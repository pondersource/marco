import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { groupPhotoContributions } from '../utils/contributions';

const NAME_CACHE_KEY = 'marco:contributions:name_cache';

/**
 * Orchestrates loading the user's own Nostr contributions, grouping them into
 * timeline entries, and resolving place names from bookmarks or the OSM API.
 *
 * The flow is:
 *   1. Subscribe to `nostrData.store.timeline(...)` for the user's kind 360 events.
 *   2. Group events into contribution entries via `groupPhotoContributions`.
 *   3. Resolve place names immediately from bookmarks / name cache / OSM cache.
 *   4. For unresolved names, batch-fetch from the OSM API in the background.
 *   5. Any items that can't be resolved get a fallback name so they don't stay
 *      stuck in a "Loading…" state forever.
 *   6. Update `@tracked items` so the UI renders progressively.
 */
export default class ContributionsService extends Service {
  @service nostrData;
  @service nostrAuth;
  @service storage;
  @service osm;

  @tracked items = [];

  _sub = null;
  _pendingBatchPromise = null;
  _lastBatchSignature = '';
  _nameCache = new Map();
  _unresolvable = new Set();

  constructor() {
    super(...arguments);
    this._loadNameCache();
  }

  _loadNameCache() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(NAME_CACHE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          this._nameCache = new Map(Object.entries(obj));
        }
      }
    } catch {
      // ignore malformed cache
    }
  }

  _saveNameCache() {
    if (typeof localStorage === 'undefined') return;
    try {
      const obj = Object.fromEntries(this._nameCache);
      localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {
      console.debug('[contributions] Failed to persist name cache', e);
    }
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

    // 2. Resolve place names: preserve previously-resolved names, then check
    // bookmarks, the name cache, and the OSM service cache.
    for (const entry of entries) {
      const cached = this._resolveCachedName(entry);
      if (cached) {
        entry.placeName = cached;
        entry.placeNameLoading = false;
      }
    }

    this.items = entries;

    // 3. Trigger a background batch fetch for any still-unresolved names.
    // De-duplicate so we don't re-fetch the same set while a fetch is in-flight.
    this._maybeBatchFetchNames(entries);
  }

  _resolveCachedName(entry) {
    // 1. Try bookmarks (instant)
    const bookmark = this.storage.findPlaceById(entry.osmId);
    if (bookmark?.title) return bookmark.title;

    // 2. Try the persistent name cache (instant, survives across sessions)
    if (this._nameCache.has(entry.placeIdentifier)) {
      return this._nameCache.get(entry.placeIdentifier);
    }

    // 3. Try OSM localStorage cache (instant, from place detail visits)
    const cached = this.osm.getCachedOsmObject(entry.osmType, entry.osmId);
    return cached?.title || null;
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
        // Merge resolved names back into the current `items` and the name cache.
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
        this._saveNameCache();
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
        this._saveNameCache();
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
      const cached = this._resolveCachedName(entry);
      if (cached) {
        nameMap.set(entry.placeIdentifier, cached);
      } else {
        toFetch.push({ osmType: entry.osmType, osmId: entry.osmId });
      }
    }

    if (toFetch.length === 0) return nameMap;

    const places = await this.osm.fetchOsmObjectsBatch(toFetch);
    for (const entry of entries) {
      if (nameMap.has(entry.placeIdentifier)) continue;
      const cacheKey = `${entry.osmType}:${entry.osmId}`;
      const place = places.get(cacheKey);
      if (place?.title) {
        nameMap.set(entry.placeIdentifier, place.title);
        this._nameCache.set(entry.placeIdentifier, place.title);
      }
    }
    this._saveNameCache();
    return nameMap;
  }
}
