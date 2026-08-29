import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { ProfileModel } from 'applesauce-core/models/profile';
import { getProfileContent } from 'applesauce-core/helpers/profile';
import { parseZapReceipt, enrichWithPhoto } from '../utils/activity';

/**
 * Orchestrates loading the user's incoming social activity (zaps received on
 * their photos) and exposing it as a tracked `items` list for the activity
 * timeline.
 *
 * The flow is:
 *   1. Subscribe to `nostrData.store.timeline(...)` for kind 9735 zap receipts
 *      where the user is the recipient (`#p` filter).
 *   2. Parse each receipt into an `ActivityEntry`, filtering to zaps on the
 *      user's own kind 360 photos.
 *   3. Resolve sender profiles asynchronously via a per-sender `ProfileModel`
 *      subscription, updating the tracked entry fields when they load.
 *   4. Resolve place names via the shared `placeNameResolver` service.
 *   5. Update `@tracked items` so the UI renders progressively.
 */
export default class ActivityService extends Service {
  @service nostrData;
  @service nostrAuth;
  @service placeNameResolver;

  @tracked items = [];

  _sub = null;
  _profileSubs = new Map();
  _userPubkey = null;

  /**
   * Loads the user's incoming zap receipts and subscribes to live updates.
   *
   * @param {string} pubkey The user's Nostr pubkey
   */
  async load(pubkey) {
    if (!pubkey) {
      this.items = [];
      return;
    }

    this._userPubkey = pubkey;

    const filters = [{ kinds: [9735], '#p': [pubkey] }];

    console.debug('[activity] Subscribing to zap receipts', {
      filters,
      pubkey,
      activeReadRelays: this.nostrData.activeReadRelays,
    });

    // Subscribe to the store timeline so we get live updates as receipts
    // arrive and are added to the store.
    this._sub = this.nostrData.store.timeline(filters).subscribe((events) => {
      this._updateItems(events, pubkey);
    });

    // Ensure the user's kind 360 photo events are in the store first so
    // enrichWithPhoto can look them up when zap receipts arrive.
    await this.nostrData.loadMyContributions(pubkey);

    // Then load zap receipts — adding them to the store triggers the
    // timeline subscription, and by now the photo events are available.
    await this.nostrData.loadIncomingZaps(pubkey);
  }

  /**
   * Stops subscriptions and clears the timeline. Called when leaving the
   * activity route.
   */
  stop() {
    if (this._sub) {
      this._sub.unsubscribe();
      this._sub = null;
    }
    this._cleanupProfileSubs();
    this.items = [];
    this._userPubkey = null;
    this.placeNameResolver.reset();
  }

  willDestroy() {
    this.stop();
    super.willDestroy(...arguments);
  }

  _updateItems(receipts, pubkey) {
    const entries = [];

    for (const receipt of receipts) {
      const entry = parseZapReceipt(receipt, pubkey);
      if (!entry) continue;

      // Only keep zaps for the user's own kind 360 photos
      if (!enrichWithPhoto(entry, this.nostrData.store, pubkey)) {
        continue;
      }

      // Resolve sender profile (async, fire-and-forget)
      this._resolveSender(entry);

      entries.push(entry);
    }

    // Sort newest-first by created_at
    entries.sort((a, b) => b.createdAt - a.createdAt);

    console.debug('[activity] Zap receipts received', {
      total: receipts.length,
      matched: entries.length,
      pubkey,
    });

    // 2. Bookmark lookup is synchronous — resolve those immediately so the
    //    first render shows bookmarked place names without a "Loading…" flicker.
    for (const entry of entries) {
      if (entry.osmId) {
        const bookmarkName = this.placeNameResolver.resolveBookmark(
          entry.osmId
        );
        if (bookmarkName) {
          entry.placeName = bookmarkName;
          entry.placeNameLoading = false;
        }
      }
    }

    this.items = entries;

    // 3. Async-resolve remaining entries from the IndexedDB name cache and OSM
    //    cache, then fall through to the network batch for the rest.
    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this.items = [...this.items];
    });
  }

  _resolveSender(entry) {
    const pubkey = entry.senderPubkey;
    if (!pubkey) return;

    // Set up a ProfileModel subscription for this sender so the entry's
    // tracked fields update when the profile arrives from cache or network.
    // The event loader (configured in nostrData) auto-fetches missing kind 0
    // events from the IDB cache and relays.
    if (!this._profileSubs.has(pubkey)) {
      const sub = this.nostrData.store
        .model(ProfileModel, pubkey)
        .subscribe((profileContent) => {
          this._applyProfileToPubkey(pubkey, profileContent);
        });
      this._profileSubs.set(pubkey, sub);
    }

    // Read immediately in case the profile is already cached
    this._applySenderProfile(entry, pubkey);
  }

  _applySenderProfile(entry, pubkey) {
    // Try nostrData's profiles dict first (populated by other parts of the app)
    let profile = this.nostrData.getProfile(pubkey);

    // Fall back to reading the kind 0 event directly from the store. This
    // handles the re-open case where the event is already in the store from
    // a previous load but nostrData.profiles wasn't populated by this service.
    if (!profile) {
      const event = this.nostrData.store.getReplaceable(0, pubkey);
      if (event) {
        profile = getProfileContent(event);
      }
    }

    if (profile) {
      entry.senderName = profile.name || profile.display_name || null;
      entry.senderAvatar = profile.picture || null;
      entry.senderProfileLoading = false;
    }
  }

  _applyProfileToPubkey(pubkey, profileContent) {
    // Update all entries matching this sender
    let changed = false;
    for (const entry of this.items) {
      if (entry.senderPubkey === pubkey) {
        entry.senderName =
          profileContent.name || profileContent.display_name || null;
        entry.senderAvatar = profileContent.picture || null;
        entry.senderProfileLoading = false;
        changed = true;
      }
    }

    if (changed) {
      // Trigger re-render
      this.items = [...this.items];
    }
  }

  _cleanupProfileSubs() {
    for (const sub of this._profileSubs.values()) {
      sub.unsubscribe();
    }
    this._profileSubs.clear();
  }
}
