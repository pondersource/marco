import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { groupPhotoContributions } from '../utils/contributions';

const NAME_CACHE_STORE = 'contributions-name-cache';

/**
 * Orchestrates loading the user's own Nostr contributions, grouping them into
 * timeline entries, and resolving place names from bookmarks or the OSM API.
 *
 * The flow is:
 *   1. Subscribe to `nostrData.store.timeline(...)` for the user's kind 360 events.
 *   2. Group events into contribution entries via `groupPhotoContributions`.
 *   3. Resolve place names from bookmarks (sync, instant) on the first render,
 *      then asynchronously from the IndexedDB name cache and OSM cache.
 *   4. For unresolved names, batch-fetch from the OSM API in the background.
 *   5. Any items that can't be resolved get a fallback name so they don't stay
 *      stuck in a "Loading…" state forever.
 *   6. Update `@tracked items` so the UI renders progressively.
 *
 * The persistent name cache is stored in IndexedDB (via the `localForage`
 * service) with one key per `placeIdentifier`, so partial updates don't
 * require re-serializing the whole map.
 */
export default class ContributionsService extends Service {
  @service nostrData;
  @service nostrAuth;
  @service storage;
  @service osm;
  @service localForage;

  @tracked items = [];

  _sub = null;
  _pendingBatchPromise = null;
  _lastBatchSignature = '';
  _unresolvable = new Set();

  /**
   * Async name resolution. Checks, in order:
   *   1. Bookmarks (sync, instant).
   *   2. The persistent IndexedDB name cache (per-entry key).
   *   3. The OSM service's IndexedDB cache (from place detail visits).
   *
   * @param {object} entry A contribution entry with `osmType`, `osmId`, and `placeIdentifier`.
   * @returns {Promise<string|null>}
   */
  async _resolveCachedName(entry) {
    // 1. Try bookmarks (instant)
    const bookmark = this.storage.findPlaceById(entry.osmId);
    if (bookmark?.title) return bookmark.title;

    // 2. Try the persistent name cache (IndexedDB, per-entry, survives sessions)
    const cachedName = await this.localForage.get(
      NAME_CACHE_STORE,
      entry.placeIdentifier
    );
    if (cachedName) return cachedName;

    // 3. Try OSM IndexedDB cache (from place detail visits)
    const cached = await this.osm.getCachedOsmObject(
      entry.osmType,
      entry.osmId
    );
    return cached?.title || null;
  }

  /**
   * Asynchronously resolves names for still-loading entries from the caches.
   * Falls through to `_maybeBatchFetchNames` for anything that remains
   * unresolved. Fire-and-forget from `_updateItems` so the list renders
   * immediately with bookmark-resolved names.
   *
   * @param {Array} entries
   * @returns {Promise<void>}
   */
  async _resolveFromCache(entries) {
    const pending = entries.filter((e) => e.placeNameLoading);
    if (pending.length === 0) {
      this._maybeBatchFetchNames(this.items);
      return;
    }

    await Promise.all(
      pending.map(async (entry) => {
        const name = await this._resolveCachedName(entry);
        if (name) {
          entry.placeName = name;
          entry.placeNameLoading = false;
        }
      })
    );

    // Re-render with whatever resolved, then kick off the network batch for
    // entries that are still loading.
    this.items = [...this.items];
    this._maybeBatchFetchNames(this.items);
  }

  /**
   * Loads the user's contributions and subscribes to live updates.
   *
   * @param {string} pubkey The user's Nostr pubkey
   */
  async load(pubkey) {
    if (!pubkey) {
      this.items = [];
      return;
    }

    // Subscribe to the user's own kind 360 events. Each update triggers a re-group
    // and place-name resolution. This mirrors the `loadPhotosForPlace` pattern.
    this._sub = this.nostrData.store
      .timeline([{ kinds: [360, 5], authors: [pubkey] }])
      .subscribe((events) => {
        this._updateItems(events);
      });

    // Also kick off the network fetch via nostrData. This populates the store and
    // causes the subscription above to fire with fresh events.
    await this.nostrData.loadMyContributions(pubkey);
  }

  /**
   * Stops the subscription and clears the timeline. Called when leaving the
   * contributions route.
   */
  stop() {
    if (this._sub) {
      this._sub.unsubscribe();
      this._sub = null;
    }
    this.items = [];
    this._lastBatchSignature = '';
    this._pendingBatchPromise = null;
    this._unresolvable.clear();
  }

  willDestroy() {
    this.stop();
    super.willDestroy(...arguments);
  }

  _updateItems(events) {
    // 1. Group events into contribution entries (newest-first)
    const entries = groupPhotoContributions(events);

    // 2. Bookmark lookup is synchronous — resolve those immediately so the
    //    first render shows bookmarked place names without a "Loading…" flicker.
    for (const entry of entries) {
      const bookmark = this.storage.findPlaceById(entry.osmId);
      if (bookmark?.title) {
        entry.placeName = bookmark.title;
        entry.placeNameLoading = false;
      }
    }

    this.items = entries;

    // 3. Async-resolve remaining entries from the IndexedDB name cache and OSM
    //    cache, then fall through to the network batch for the rest.
    void this._resolveFromCache(entries);
  }

  _isUnresolvable(entry) {
    return this._unresolvable.has(entry.placeIdentifier);
  }

  _maybeBatchFetchNames(entries) {
    const unresolved = entries.filter(
      (e) => e.placeNameLoading && !this._isUnresolvable(e)
    );

    // Apply fallbacks for items already marked unresolvable in this session
    for (const entry of entries) {
      if (entry.placeNameLoading && this._isUnresolvable(entry)) {
        entry.placeName = this._fallbackName(entry);
        entry.placeNameLoading = false;
      }
    }

    if (unresolved.length === 0) {
      if (this.items.some((i) => !i.placeNameLoading)) {
        this.items = [...this.items];
      }
      return;
    }

    // Build a stable signature so we only fire one batch request per unique set
    const signature = unresolved
      .map((e) => e.placeIdentifier)
      .sort()
      .join('|');
    if (signature === this._lastBatchSignature && this._pendingBatchPromise) {
      return;
    }
    this._lastBatchSignature = signature;

    this._pendingBatchPromise = this._batchResolveNames(unresolved)
      .then((nameMap) => {
        // Merge resolved names back into the current `items`.
        for (const item of this.items) {
          if (!item.placeNameLoading) continue;
          if (nameMap.has(item.placeIdentifier)) {
            const name = nameMap.get(item.placeIdentifier);
            item.placeName = name;
            item.placeNameLoading = false;
          } else {
            // Could not be resolved (deleted object, network error for this item).
            // Mark as unresolvable for this session and use a fallback.
            this._unresolvable.add(item.placeIdentifier);
            item.placeName = this._fallbackName(item);
            item.placeNameLoading = false;
          }
        }
        // Trigger a re-render
        this.items = [...this.items];
      })
      .catch((e) => {
        console.error('[contributions] Batch name resolution failed', e);
        // On a total failure, mark all as unresolvable and apply fallbacks
        for (const item of this.items) {
          if (item.placeNameLoading) {
            this._unresolvable.add(item.placeIdentifier);
            item.placeName = this._fallbackName(item);
            item.placeNameLoading = false;
          }
        }
        this.items = [...this.items];
      })
      .finally(() => {
        this._pendingBatchPromise = null;
      });
  }

  _fallbackName(item) {
    return `OSM ${item.osmType} ${item.osmId}`;
  }

  async _batchResolveNames(entries) {
    const nameMap = new Map();
    const toFetch = [];

    // Re-check cache in case it was populated between the trigger and now
    for (const entry of entries) {
      const cached = await this._resolveCachedName(entry);
      if (cached) {
        nameMap.set(entry.placeIdentifier, cached);
      } else {
        toFetch.push({ osmType: entry.osmType, osmId: entry.osmId });
      }
    }

    if (toFetch.length === 0) return nameMap;

    const places = await this.osm.fetchOsmObjectsBatch(toFetch);

    // Persist each newly-resolved name to the IndexedDB name cache as its own
    // entry (per-placeIdentifier key) so we don't re-fetch next session.
    const writePromises = [];
    for (const entry of entries) {
      if (nameMap.has(entry.placeIdentifier)) continue;
      const cacheKey = `${entry.osmType}:${entry.osmId}`;
      const place = places.get(cacheKey);
      if (place?.title) {
        nameMap.set(entry.placeIdentifier, place.title);
        writePromises.push(
          this.localForage.set(
            NAME_CACHE_STORE,
            entry.placeIdentifier,
            place.title
          )
        );
      }
    }
    await Promise.all(writePromises);
    return nameMap;
  }
}
