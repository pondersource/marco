import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { ProfileModel } from 'applesauce-core/models/profile';
import { getProfileContent } from 'applesauce-core/helpers/profile';
import {
  parseZapReceipt,
  enrichWithPhoto,
  groupSocialPhotos,
} from '../utils/activity';

const SINCE_WINDOW = 30 * 24 * 60 * 60; // 30 days in seconds

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
  @tracked sourceMode = 'home';

  _sub = null;
  _socialSub = null;
  _profileSubs = new Map();
  _userPubkey = null;
  _zapItems = [];
  _socialItems = [];
  _lastSocialEvents = [];
  _since = null;
  _sourceMode = 'home';

  /**
   * Loads the user's incoming zap receipts and social photo activity, then
   * subscribes to live updates.
   *
   * When a Nostr account is connected, zaps received on the user's photos are
   * loaded and the 'home' mode shows photos from followed contacts. When no
   * account is connected, zaps and 'home' mode are skipped, but 'explore'
   * mode still loads photos from trusted relays.
   *
   * @param {string|null} pubkey The user's Nostr pubkey, or null
   */
  async load(pubkey) {
    this._userPubkey = pubkey || null;
    this._since = Math.floor(Date.now() / 1000) - SINCE_WINDOW;

    if (pubkey) {
      const zapFilters = [{ kinds: [9735], '#p': [pubkey] }];

      console.debug('[activity] Subscribing to zap receipts', {
        filters: zapFilters,
        pubkey,
        activeReadRelays: this.nostrData.activeReadRelays,
      });

      // Subscribe to zap receipts (kind 9735 where #p = user)
      this._sub = this.nostrData.store
        .timeline(zapFilters)
        .subscribe((events) => {
          this._updateZapItems(events, pubkey);
        });
    }

    // Subscribe to all kind 360 photos in the time window. The callback
    // filters by source mode (e.g. followed contacts only) so we only
    // show photos from the relevant source.
    const photoFilters = [{ kinds: [360], since: this._since }];
    this._socialSub = this.nostrData.store
      .timeline(photoFilters)
      .subscribe((events) => {
        this._lastSocialEvents = events;
        this._updateSocialItems(events);
      });

    if (pubkey) {
      // Ensure the user's kind 360 photo events are in the store first so
      // enrichWithPhoto can look them up when zap receipts arrive.
      await this.nostrData.loadMyContributions(pubkey);

      // Then load zap receipts — adding them to the store triggers the
      // timeline subscription, and by now the photo events are available.
      await this.nostrData.loadIncomingZaps(pubkey);
    }

    // Load social photos (contacts dependency handled internally — if
    // contacts haven't loaded yet, loadActivityPhotos returns early and
    // the ContactsModel callback re-triggers it when they arrive).
    await this.nostrData.loadActivityPhotos(this._since, this._sourceMode);
  }

  /**
   * Switches the activity source mode (e.g. 'home' for followee photos,
   * 'explore' for all photos from trusted relays). Re-filters existing
   * events and re-fetches with the new mode.
   *
   * @param {string} mode The new source mode
   */
  setSourceMode(mode) {
    if (mode === this._sourceMode) return;
    this._sourceMode = mode;
    this.sourceMode = mode;

    // Re-filter existing events with the new mode
    if (this._lastSocialEvents.length > 0) {
      this._updateSocialItems(this._lastSocialEvents);
    }

    // Re-fetch with the new mode
    if (this._since !== null) {
      this.nostrData.loadActivityPhotos(this._since, mode);
    }
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
    if (this._socialSub) {
      this._socialSub.unsubscribe();
      this._socialSub = null;
    }
    this._cleanupProfileSubs();
    this._zapItems = [];
    this._socialItems = [];
    this._lastSocialEvents = [];
    this.items = [];
    this._userPubkey = null;
    this._since = null;
    this.placeNameResolver.reset();
  }

  willDestroy() {
    this.stop();
    super.willDestroy(...arguments);
  }

  _updateZapItems(receipts, pubkey) {
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

    // Synchronous bookmark lookup — resolve those immediately so the
    // first render shows bookmarked place names without a "Loading…" flicker.
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

    this._zapItems = entries;
    this._mergeItems();

    // Async-resolve remaining entries from the IndexedDB name cache and OSM
    // cache, then fall through to the network batch for the rest.
    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this._mergeItems();
    });
  }

  _updateSocialItems(events) {
    // Filter by source mode (e.g. only followed contacts, excluding own photos)
    const filtered = events.filter((e) => this._matchesSourceMode(e));
    const entries = groupSocialPhotos(filtered);

    // Resolve sender profiles (async, fire-and-forget per sender)
    for (const entry of entries) {
      this._resolveSender(entry);
    }

    // Synchronous bookmark lookup for instant first render
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

    this._socialItems = entries;
    this._mergeItems();

    // Async-resolve remaining place names from caches → network batch
    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this._mergeItems();
    });
  }

  /**
   * Merges `_zapItems` and `_socialItems` into `items`, sorted newest-first.
   */
  _mergeItems() {
    const all =
      this._sourceMode === 'explore'
        ? [...this._socialItems]
        : [...this._zapItems, ...this._socialItems];
    all.sort((a, b) => b.createdAt - a.createdAt);
    this.items = all;
  }

  /**
   * Returns true if an event should be included in the activity feed given
   * the current source mode.
   *
   * - `'home'`: only events from followees (excluding own photos)
   * - `'explore'`: events from non-followed authors trusted by relay provenance
   *   (excluding own photos). When no pubkey is connected, all trusted events
   *   pass (no own-photo or followee exclusion).
   */
  _matchesSourceMode(event) {
    if (this._sourceMode === 'home') {
      return (
        this._userPubkey &&
        event.pubkey !== this._userPubkey &&
        this.nostrData._contactPubkeys?.has(event.pubkey)
      );
    }
    if (this._sourceMode === 'explore') {
      if (!this._userPubkey) {
        return this.nostrData.isTrustedEvent(event);
      }
      return (
        event.pubkey !== this._userPubkey &&
        !this.nostrData._contactPubkeys?.has(event.pubkey) &&
        this.nostrData.isTrustedEvent(event)
      );
    }
    return false;
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
