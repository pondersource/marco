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
const MIN_SINCE = Math.floor(new Date('2026-04-20').getTime() / 1000);
const MAX_WINDOW = 960 * 24 * 60 * 60; // 960 days in seconds

/**
 * Orchestrates loading the user's incoming social activity (zaps received on
 * their photos) and exposing it as a tracked `items` list for the activity
 * timeline.
 *
 * The flow is:
 *   1. Fetch kind 9735 zap receipts where the user is the recipient.
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
  @tracked isLoading = false;
  @tracked isLoadingMore = false;

  _profileSubs = new Map();
  _userPubkey = null;
  _zapItems = [];
  _socialItems = [];
  _lastSocialEvents = [];
  _since = null;
  _sourceMode = 'home';
  _isLoadingMore = false;
  _cacheReadyCallback = null;

  /**
   * Loads the user's incoming zap receipts and social photo activity.
   *
   * When a Nostr account is connected, zaps received on the user's photos are
   * loaded and the 'home' mode shows photos from followed contacts. When no
   * account is connected, zaps and 'home' mode are skipped, but 'explore'
   * mode still loads photos from trusted relays.
   *
   * If the initial 30-day window returns no events, the window expands
   * exponentially (up to 960 days) until events are found or the minimum
   * timestamp (2026-04-20) is reached.
   *
   * @param {string|null} pubkey The user's Nostr pubkey, or null
   */
  async load(pubkey) {
    if (this.items.length > 0) return;
    this._userPubkey = pubkey || null;
    this._since = Math.floor(Date.now() / 1000) - SINCE_WINDOW;
    this.isLoading = true;
    this._cacheReadyCallback = () => {
      this.isLoading = false;
    };

    try {
      if (pubkey) {
        await this.nostrData.loadMyContributions(pubkey);
        await this.nostrData.loadProfile(pubkey);
        await this.nostrData.whenContactsLoaded();
      }

      this._socialItems = [];
      this._zapItems = [];
      this._lastSocialEvents = [];
      this._mergeItems();

      const now = Math.floor(Date.now() / 1000);
      await this._fetchWithBackoff(this._since, now);
    } finally {
      this.isLoading = false;
      this._cacheReadyCallback = null;
    }
  }

  /**
   * Switches the activity source mode (e.g. 'home' for followee photos,
   * 'explore' for all photos from trusted relays). Resets to a fresh
   * 30-day window and re-fetches both zaps and photos with the new mode.
   *
   * @param {string} mode The new source mode
   */
  async setSourceMode(mode) {
    if (mode === this._sourceMode) return;
    this._sourceMode = mode;
    this.sourceMode = mode;

    this._since = Math.floor(Date.now() / 1000) - SINCE_WINDOW;
    this._socialItems = [];
    this._zapItems = [];
    this._lastSocialEvents = [];
    this._mergeItems();

    this.isLoading = true;
    this._cacheReadyCallback = () => {
      this.isLoading = false;
    };

    try {
      const now = Math.floor(Date.now() / 1000);
      await this._fetchWithBackoff(this._since, now);
    } finally {
      this.isLoading = false;
      this._cacheReadyCallback = null;
    }
  }

  /**
   * Loads older events by extending the time window further back.
   * Only processes newly fetched events — existing items are not re-processed.
   *
   * If an empty window is returned (no photos AND no zaps), the window size
   * doubles (up to 960 days) and the fetch is retried automatically until
   * events are found or the minimum timestamp (2026-04-20) is reached.
   *
   * @returns {Promise<void>}
   */
  async loadMore() {
    if (this._isLoadingMore || !this._since || !this.items.length) return;
    this._isLoadingMore = true;
    this.isLoadingMore = true;

    try {
      const startSince = this._since - SINCE_WINDOW;
      await this._fetchWithBackoff(startSince, this._since);
    } finally {
      this._isLoadingMore = false;
      this.isLoadingMore = false;
    }
  }

  /**
   * Stops subscriptions and clears the timeline. Called when leaving the
   * activity route.
   */
  stop() {
    this._cleanupProfileSubs();
    this._zapItems = [];
    this._socialItems = [];
    this._lastSocialEvents = [];
    this.items = [];
    this._userPubkey = null;
    this._since = null;
    this._isLoadingMore = false;
    this.isLoadingMore = false;
    this.isLoading = false;
    this.placeNameResolver.reset();
  }

  willDestroy() {
    this.stop();
    super.willDestroy(...arguments);
  }

  /**
   * Processes photo events into social items and appends them to the timeline.
   *
   * @param {object[]} events Photo events to process
   * @returns {boolean} True if any items were added
   */
  _processPhotoEvents(events) {
    if (events.length === 0) return false;

    this._lastSocialEvents = [...this._lastSocialEvents, ...events];

    const filtered = events.filter((e) => this._matchesSourceMode(e));
    if (filtered.length === 0) return false;

    const newEntries = groupSocialPhotos(filtered);

    for (const entry of newEntries) {
      this._resolveSender(entry);
    }

    for (const entry of newEntries) {
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

    this._socialItems = [...this._socialItems, ...newEntries];
    this._mergeItems();

    void this.placeNameResolver
      .resolveInBackground(newEntries)
      .then(() => this._mergeItems());

    return true;
  }

  /**
   * Processes zap receipt events and appends them to the timeline.
   *
   * @param {object[]} events Zap receipt events to process
   * @returns {boolean} True if any items were added
   */
  _processZapEventsIntoTimeline(events) {
    if (events.length === 0) return false;

    const newZapEntries = this._processZapEvents(events, this._userPubkey);
    if (newZapEntries.length === 0) return false;

    this._zapItems = [...this._zapItems, ...newZapEntries];
    this._mergeItems();

    void this.placeNameResolver
      .resolveInBackground(newZapEntries)
      .then(() => this._mergeItems());

    return true;
  }

  /**
   * Fetches photos and zaps for a single time window, processes them, and
   * appends to the respective item arrays. Cache events are processed first
   * (firing `_cacheReadyCallback` to dismiss the loading spinner), then
   * network events are awaited and processed.
   *
   * @param {number} batchSince Start of the window (seconds)
   * @param {number} batchUntil End of the window (seconds)
   * @returns {Promise<boolean>} True if any events were found
   */
  async _fetchAndProcessWindow(batchSince, batchUntil) {
    const photoResult = await this.nostrData.fetchActivityPhotos(
      batchSince,
      batchUntil,
      this._sourceMode
    );

    let zapResult = {
      cacheEvents: [],
      networkEvents: Promise.resolve([]),
    };
    if (this._sourceMode === 'home' && this._userPubkey) {
      zapResult = await this.nostrData.fetchIncomingZaps(
        this._userPubkey,
        batchSince,
        batchUntil
      );
    }

    // Phase 1: Process cache events immediately
    let added = false;

    if (photoResult.cacheEvents.length > 0) {
      added = this._processPhotoEvents(photoResult.cacheEvents) || added;
    }
    if (zapResult.cacheEvents.length > 0) {
      added =
        this._processZapEventsIntoTimeline(zapResult.cacheEvents) || added;
    }

    // Signal that cached items are ready for display
    if (added) {
      this._cacheReadyCallback?.();
    }

    // Phase 2: Await network events and process them
    const [networkPhotos, networkZaps] = await Promise.all([
      photoResult.networkEvents,
      zapResult.networkEvents,
    ]);

    if (networkPhotos.length > 0) {
      added = this._processPhotoEvents(networkPhotos) || added;
    }
    if (networkZaps.length > 0) {
      added = this._processZapEventsIntoTimeline(networkZaps) || added;
    }

    return added;
  }

  /**
   * Fetches events with exponential backoff. Starts with a 30-day window
   * and doubles the window size on each empty result (up to 960 days),
   * until events are found or MIN_SINCE is reached.
   *
   * @param {number} startSince Start of the first window (seconds)
   * @param {number} startUntil End of the first window (seconds)
   * @returns {Promise<void>}
   */
  async _fetchWithBackoff(startSince, startUntil) {
    let windowSize = SINCE_WINDOW;
    let batchSince = startSince;
    let batchUntil = startUntil;

    while (true) {
      if (this._since === null) return; // stopped

      // Clamp to MIN_SINCE — this is the final iteration if clamped
      const isFinal = batchSince < MIN_SINCE;
      if (isFinal) {
        batchSince = MIN_SINCE;
      }

      const found = await this._fetchAndProcessWindow(batchSince, batchUntil);
      this._since = batchSince;

      if (found || isFinal) break;

      windowSize = Math.min(windowSize * 2, MAX_WINDOW);
      batchUntil = batchSince;
      batchSince = batchSince - windowSize;
    }
  }

  _processZapEvents(receipts, pubkey) {
    const entries = [];

    for (const receipt of receipts) {
      const entry = parseZapReceipt(receipt, pubkey);
      if (!entry) continue;

      if (!enrichWithPhoto(entry, this.nostrData.store, pubkey)) {
        continue;
      }

      this._resolveSender(entry);
      entries.push(entry);
    }

    entries.sort((a, b) => b.createdAt - a.createdAt);

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

    return entries;
  }

  _updateZapItems(receipts, pubkey) {
    const entries = this._processZapEvents(receipts, pubkey);

    this._zapItems = entries;
    this._mergeItems();

    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this._mergeItems();
    });
  }

  _updateSocialItems(events) {
    const filtered = events.filter((e) => this._matchesSourceMode(e));
    const entries = groupSocialPhotos(filtered);

    for (const entry of entries) {
      this._resolveSender(entry);
    }

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

    void this.placeNameResolver.resolveInBackground(entries).then(() => {
      this._mergeItems();
    });
  }

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

    if (!this._profileSubs.has(pubkey)) {
      const sub = this.nostrData.store
        .model(ProfileModel, pubkey)
        .subscribe((profileContent) => {
          this._applyProfileToPubkey(pubkey, profileContent);
        });
      this._profileSubs.set(pubkey, sub);
    }

    this._applySenderProfile(entry, pubkey);
  }

  _applySenderProfile(entry, pubkey) {
    let profile = this.nostrData.getProfile(pubkey);

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
