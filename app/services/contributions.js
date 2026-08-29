import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { groupPhotoContributions } from '../utils/contributions';

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
  @service placeNameResolver;

  @tracked items = [];

  _sub = null;

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
    this.placeNameResolver.reset();
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
      const bookmarkName = this.placeNameResolver.resolveBookmark(entry.osmId);
      if (bookmarkName) {
        entry.placeName = bookmarkName;
        entry.placeNameLoading = false;
      }
    }

    this.items = entries;

    // 3. Async-resolve remaining entries from the IndexedDB name cache and OSM
    //    cache, then fall through to the network batch for the rest.
    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this.items = [...this.items];
    });
  }
}
