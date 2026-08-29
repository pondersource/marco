import Service, { service } from '@ember/service';

const NAME_CACHE_STORE = 'place-name-cache';

export default class PlaceNameResolverService extends Service {
  @service storage;
  @service osm;
  @service localForage;

  _pendingBatchPromise = null;
  _lastBatchSignature = '';
  _unresolvable = new Set();

  /**
   * Synchronous bookmark lookup. Returns the bookmark title if found, null otherwise.
   *
   * @param {string} osmId The OSM entity ID (e.g. "123456")
   * @returns {string|null}
   */
  resolveBookmark(osmId) {
    const bookmark = this.storage.findPlaceById(osmId);
    return bookmark?.title || null;
  }

  /**
   * Asynchronous name resolution from caches (localForage → OSM IDB cache).
   * Returns the resolved name or null if not in cache.
   *
   * @param {object} entry Entry with placeIdentifier, osmType, osmId
   * @returns {Promise<string|null>}
   */
  async _resolveCachedName(entry) {
    // 1. Try the persistent name cache (IndexedDB, per-entry, survives sessions)
    const cachedName = await this.localForage.get(
      NAME_CACHE_STORE,
      entry.placeIdentifier
    );
    if (cachedName) return cachedName;

    // 2. Try OSM IndexedDB cache (from place detail visits)
    const cached = await this.osm.getCachedOsmObject(
      entry.osmType,
      entry.osmId
    );
    return cached?.title || null;
  }

  /**
   * Resolves names for entries in the background.
   * Fire-and-forget: resolves from caches, then falls through to batch OSM fetch
   * for anything still unresolved. Mutates entry.placeName and entry.placeNameLoading.
   * The caller is responsible for triggering a re-render (e.g. `this.items = [...this.items]`).
   *
   * @param {Array} entries Entries with placeIdentifier, osmType, osmId, placeName, placeNameLoading
   * @returns {Promise<void>}
   */
  async resolveInBackground(entries) {
    const pending = entries.filter((e) => e.placeNameLoading);
    if (pending.length === 0) {
      this._maybeBatchFetchNames(entries);
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

    // Trigger re-render via caller, then kick off the network batch for
    // entries that are still loading.
    this._maybeBatchFetchNames(entries);
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
        // Merge resolved names back into the entries
        for (const entry of entries) {
          if (!entry.placeNameLoading) continue;
          if (nameMap.has(entry.placeIdentifier)) {
            const name = nameMap.get(entry.placeIdentifier);
            entry.placeName = name;
            entry.placeNameLoading = false;
          } else {
            // Could not be resolved (deleted object, network error for this item).
            // Mark as unresolvable for this session and use a fallback.
            this._unresolvable.add(entry.placeIdentifier);
            entry.placeName = this._fallbackName(entry);
            entry.placeNameLoading = false;
          }
        }
      })
      .catch((e) => {
        console.error('[place-name-resolver] Batch name resolution failed', e);
        // On a total failure, mark all as unresolvable and apply fallbacks
        for (const entry of entries) {
          if (entry.placeNameLoading) {
            this._unresolvable.add(entry.placeIdentifier);
            entry.placeName = this._fallbackName(entry);
            entry.placeNameLoading = false;
          }
        }
      })
      .finally(() => {
        this._pendingBatchPromise = null;
      });
  }

  _fallbackName(entry) {
    return `OSM ${entry.osmType} ${entry.osmId}`;
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

  /**
   * Resets per-session state. Called when the owning service stops.
   */
  reset() {
    this._unresolvable.clear();
    this._lastBatchSignature = '';
    this._pendingBatchPromise = null;
  }
}
