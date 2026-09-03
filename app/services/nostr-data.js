import Service, { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { EMPTY, from, timeout, filter, connect, take, takeUntil } from 'rxjs';
import { EventStore } from 'applesauce-core/event-store';
import { ProfileModel } from 'applesauce-core/models/profile';
import { MailboxesModel } from 'applesauce-core/models/mailboxes';
import { ContactsModel } from 'applesauce-core/models/contacts';
import { isEventPointer, npubEncode } from 'applesauce-core/helpers/pointers';
import { persistEventsToCache } from 'applesauce-core/helpers/event-cache';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';
import { RelayGroup } from 'applesauce-relay';
import { NostrIDB, openDB } from 'nostr-idb';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  normalizeRelayUrl,
  relayUrlMatches,
  uniqNormalizedRelays,
} from '../utils/nostr';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';
import { DEFAULT_BLOSSOM_SERVER } from './blossom';

const DIRECTORY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

const DEFAULT_READ_RELAYS = ['wss://nostr.kosmos.org'];
const DEFAULT_WRITE_RELAYS = []; // TODO nostr.kosmos.org/marco

// Content event kinds subject to relay-trust filtering. Adding `30360`
// (place reviews) here is the only change needed to extend the feature.
const TRUSTED_CONTENT_KINDS = [360];

// localforage store name for persisted relay provenance.
const PROVENANCE_STORE = 'event-relay-provenance';

// Replicates applesauce-relay's `completeWhen`: completes the source when the
// `operator` emits a truthy value. `completeWhen` is used internally by
// RelayGroup but not re-exported, so we recreate it from rxjs primitives.
function completeWhen(operator) {
  return connect((shared$) => {
    const complete$ = shared$.pipe(operator, filter(Boolean), take(1));
    return shared$.pipe(takeUntil(complete$));
  });
}

export default class NostrDataService extends Service {
  @service nostrRelay;
  @service nostrAuth;
  @service settings;
  @service localForage;

  store = new EventStore();

  @tracked profile = null;
  @tracked mailboxes = null;
  @tracked contacts = null;
  @tracked blossomServers = [];
  @tracked placePhotos = [];
  @tracked myContributionEvents = [];
  @tracked profiles = {};
  @tracked zapReceipts = {};

  // Relay-provenance trust state. `_eventRelays` maps eventId -> Set<relayUrl>
  // and accumulates every relay an event was seen on (unconditionally, so an
  // event first seen on an untrusted relay can be upgraded to trusted when it
  // later arrives from a trusted one). Hydrated from IDB at init so cached
  // events render with correct trust state instantly.
  _eventRelays = new Map();
  _provenanceReady = null;

  // Set of pubkeys from the user's follow list (kind 3 contacts) for O(1)
  // trust lookups. Rebuilt whenever contacts change.
  _contactPubkeys = null;

  // Deferred that resolves when contacts are first loaded. Created in
  // loadProfile, resolved in the ContactsModel callback.
  _contactsResolver = null;
  _contactsPromise = null;

  // Session-only reveal toggle for untrusted content. Not persisted.
  @tracked showUntrustedContent = false;
  // Count of currently-hidden (untrusted) place photos for the selected place.
  @tracked untrustedContentCount = 0;
  _allPlacePhotos = [];

  _profileSub = null;
  _mailboxesSub = null;
  _contactsSub = null;
  _blossomSub = null;
  _photosSub = null;
  _contributionsSub = null;
  _deletionsSub = null;
  _profileModelSubs = new Map();

  _zapReceiptsSub = null;
  _zapReceiptsNetworkSub = null;
  _zapRefreshTimer = null;
  _lastPhotoIds = new Set();
  _incomingZapsNetworkSub = null;

  // Activity photos state: tracks the current time window and source mode
  // so that the contacts callback can re-trigger when contacts arrive.
  _activityPhotosSince = null;
  _activityPhotosMode = 'home';
  _activityPhotosNetworkSub = null;

  _requestSub = null;
  _cachePromise = null;
  _currentPlaceEntityId = null;
  loadedGeohashPrefixes = new Set();

  constructor() {
    super(...arguments);

    // Set up the event loader synchronously so that any subscription
    // (e.g. loadProfiles from a route's afterModel) can auto-fetch even
    // before the IndexedDB cache has finished opening. The cacheRequest
    // is lazy — it returns EMPTY until `this.cache` is available, so the
    // loader falls through to relay hints → lookup relays in the meantime.
    createEventLoaderForStore(this.store, this.nostrRelay.pool, {
      cacheRequest: (filters) => {
        if (!this.cache) return EMPTY;
        return from(this.cache.query(filters));
      },
      lookupRelays: DIRECTORY_RELAYS,
    });

    // Initialize the IndexedDB cache
    this._cachePromise = openDB('applesauce-events').then(async (db) => {
      this.cache = new NostrIDB(db, {
        cacheIndexes: 1000,
        maxEvents: 10000,
      });

      await this.cache.start();

      // Automatically persist new events to the cache
      this._stopPersisting = persistEventsToCache(
        this.store,
        async (events) => {
          // Only cache profiles, mailboxes, contacts, blossom servers, place photos, and deletions
          const toCache = events.filter(
            (e) =>
              e.kind === 0 ||
              e.kind === 3 ||
              e.kind === 5 ||
              e.kind === 10002 ||
              e.kind === 10063 ||
              e.kind === 360 ||
              e.kind === 9735
          );

          if (toCache.length > 0) {
            await Promise.all(toCache.map((event) => this.cache.add(event)));
          }
        },
        {
          batchTime: 1000, // Batch writes every 1 second
          maxBatchSize: 100,
        }
      );
    });

    // Hydrate relay provenance from IDB so cached events can be trust-checked
    // instantly without waiting for relay connections.
    this._provenanceReady = this._hydrateProvenance();

    // Centralized kind-5 deletion handling: the store routes kind-5 events to
    // its DeleteManager (never into the event database), so listen to the
    // deletion stream rather than a timeline. Drop provenance entries for
    // deleted events so the trust map and IDB don't accumulate dead entries.
    this._deletionsSub = this.store.deletes.deleted$.subscribe(
      ({ pointer }) => {
        if (isEventPointer(pointer)) {
          this._removeProvenance(pointer.id);
        }
      }
    );

    // Feed events from the relay pool into the event store
    this.nostrRelay.pool.relays$.subscribe(() => {
      // Setup relay subscription tracking if needed, or we just rely on request()
      // which returns an Observable<NostrEvent>
    });
  }

  get requiredReadRelays() {
    return DEFAULT_READ_RELAYS;
  }

  get requiredWriteRelays() {
    return DEFAULT_WRITE_RELAYS;
  }

  get mailboxReadRelays() {
    return (this.mailboxes?.inboxes || [])
      .map(normalizeRelayUrl)
      .filter(Boolean);
  }

  get mailboxWriteRelays() {
    return (this.mailboxes?.outboxes || [])
      .map(normalizeRelayUrl)
      .filter(Boolean);
  }

  get configuredReadRelays() {
    const configured = uniqNormalizedRelays([
      ...this.mailboxReadRelays,
      ...(this.settings.nostrReadRelays || []),
    ]);

    return excludeRequiredRelays(
      configured,
      this.settings.nostrReadRelayExclusions || []
    );
  }

  get configuredWriteRelays() {
    const configured = uniqNormalizedRelays([
      ...this.mailboxWriteRelays,
      ...(this.settings.nostrWriteRelays || []),
    ]);

    return excludeRequiredRelays(
      configured,
      this.settings.nostrWriteRelayExclusions || []
    );
  }

  get activeReadRelays() {
    return mergeRequiredRelays(
      this.requiredReadRelays,
      this.configuredReadRelays
    );
  }

  get activeWriteRelays() {
    return mergeRequiredRelays(
      this.requiredWriteRelays,
      this.configuredWriteRelays
    );
  }

  // Relays treated as "moderated" for content-trust filtering. Always includes
  // the required read relays (e.g. nostr.kosmos.org); `nostrTrustedRelays`
  // adds user-marked custom relays on top. Default (null) = required relays
  // only, so the app only surfaces content verified by those relays.
  get trustedRelays() {
    const configured = this.settings.nostrTrustedRelays || [];
    return uniqNormalizedRelays([...this.requiredReadRelays, ...configured]);
  }

  /**
   * Returns true if an event should be considered trusted:
   *   - authored by the connected user (own uploads), OR
   *   - authored by a pubkey the user follows (kind 3 contacts), OR
   *   - seen on at least one trusted (moderated) relay.
   */
  isTrustedEvent(event) {
    if (!event) return false;
    const myPubkey = this.nostrAuth?.pubkey;
    if (myPubkey && event.pubkey === myPubkey) return true;

    if (this._contactPubkeys?.has(event.pubkey)) return true;

    const relays = this._eventRelays.get(event.id);
    if (!relays || relays.size === 0) return false;
    const trusted = this.trustedRelays;
    for (const url of relays) {
      if (relayUrlMatches(url, trusted)) return true;
    }
    return false;
  }

  /**
   * Splits content events into trusted / untrusted buckets. Non-content kinds
   * (e.g. kind 5 deletions) are always treated as trusted so they pass through.
   */
  partitionByTrust(events) {
    const trusted = [];
    const untrusted = [];
    for (const event of events) {
      if (
        !TRUSTED_CONTENT_KINDS.includes(event.kind) ||
        this.isTrustedEvent(event)
      ) {
        trusted.push(event);
      } else {
        untrusted.push(event);
      }
    }
    return { trusted, untrusted };
  }

  // Hydrate the in-memory provenance map from the IDB store.
  async _hydrateProvenance() {
    try {
      await this.localForage.iterate(PROVENANCE_STORE, (value, key) => {
        this._eventRelays.set(key, new Set(value || []));
      });
    } catch (e) {
      console.debug('[nostr-data] Failed to hydrate relay provenance', e);
    }
  }

  // Record that `eventId` was seen on `relayUrl`. Merges into the existing
  // set (accumulates across sightings) and persists fire-and-forget.
  _recordProvenance(eventId, relayUrl) {
    if (!eventId || !relayUrl) return;
    let set = this._eventRelays.get(eventId);
    if (!set) {
      set = new Set();
      this._eventRelays.set(eventId, set);
    }
    if (set.has(relayUrl)) return;
    set.add(relayUrl);
    const urls = Array.from(set);
    // Fire-and-forget persistence; never blocks the render path.
    this.localForage.set(PROVENANCE_STORE, eventId, urls).catch((e) => {
      console.debug('[nostr-data] Failed to persist relay provenance', e);
    });
  }

  // Remove provenance for a deleted event (called on kind-5 processing).
  _removeProvenance(eventId) {
    if (!eventId) return;
    if (!this._eventRelays.delete(eventId)) return;
    this.localForage.remove(PROVENANCE_STORE, eventId).catch((e) => {
      console.debug('[nostr-data] Failed to remove relay provenance', e);
    });
  }

  /**
   * Request content events from relays while capturing full provenance.
   *
   * This mirrors `RelayGroup.request()` completion semantics (wait for the
   * first relay EOSE + 5s grace period, or all relays EOSE; 30s hard
   * timeout) but uses `pool.req()` so each `EVENT` message retains its
   * `from` relay URL. Every sighting is recorded in the provenance map
   * (unconditionally, including duplicates) so an event first seen on an
   * untrusted relay can be upgraded to trusted when it later arrives from
   * a trusted one. Events are always added to the store regardless of trust
   * status; filtering happens at presentation time.
   */
  _requestContentWithProvenance(relays, filters, errorLabel) {
    const complete = RelayGroup.completeOnAny(
      RelayGroup.completeAfterFirstRelay(5_000),
      RelayGroup.completeOnAllEose()
    );
    return this.nostrRelay.pool
      .req(relays, filters)
      .pipe(
        completeWhen(complete),
        timeout({ first: 30_000 }),
        // Only EVENT messages carry content; ignore OPEN/EOSE/CLOSED/ERROR.
        // We deliberately do NOT dedupe so we see every relay's copy and can
        // accumulate full provenance across relays.
        filter((message) => message.type === 'EVENT')
      )
      .subscribe({
        next: (message) => {
          this._recordProvenance(message.event.id, message.from);
          this.store.add(message.event);
        },
        error: (err) => {
          console.error(errorLabel, err);
        },
      });
  }

  async loadPlacesInBounds(bbox) {
    const requiredPrefixes = getGeohashPrefixesInBbox(bbox);

    const missingPrefixes = requiredPrefixes.filter(
      (p) => !this.loadedGeohashPrefixes.has(p)
    );

    if (missingPrefixes.length === 0) {
      return;
    }

    console.debug(
      '[nostr-data] Loading place photos for prefixes:',
      missingPrefixes
    );

    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query([
        {
          kinds: [360],
          '#g': missingPrefixes,
        },
      ]);

      if (cachedEvents && cachedEvents.length > 0) {
        for (const event of cachedEvents) {
          this.store.add(event);
        }
      }
    } catch (e) {
      console.warn(
        '[nostr-data] Failed to read photos from local Nostr IDB cache',
        e
      );
    }

    // Fire network request for new prefixes (captures relay provenance for
    // trust filtering; events are added to the store regardless of trust).
    this._requestContentWithProvenance(
      this.activeReadRelays,
      [{ kinds: [360], '#g': missingPrefixes }],
      '[nostr-data] Error fetching place photos by geohash:'
    );

    for (const p of missingPrefixes) {
      this.loadedGeohashPrefixes.add(p);
    }
  }

  async loadPhotosForPlace(place) {
    const entityId =
      place && place.osmId && place.osmType
        ? `osm:${place.osmType}:${place.osmId}`
        : null;

    // Skip the full reset if we're loading the same place again (e.g. from
    // checkUpdates calling selectPlace a second time). This prevents tearing
    // down timeline and profile subscriptions that are still in-flight.
    if (entityId && entityId === this._currentPlaceEntityId) {
      return;
    }

    if (this._photosSub) {
      this._photosSub.unsubscribe();
      this._photosSub = null;
    }

    this._cleanupZapReceiptSubs();
    this._clearZapRefreshTimer();

    this.placePhotos = [];
    this.zapReceipts = {};
    this._lastPhotoIds = new Set();
    this._clearProfileSubs();
    this._currentPlaceEntityId = entityId;

    if (!entityId) {
      return;
    }

    // Setup reactive store query
    this._photosSub = this.store
      .timeline([
        {
          kinds: [360],
          '#i': [entityId],
        },
      ])
      .subscribe((events) => {
        this._allPlacePhotos = events;
        this._updatePlacePhotos();
        const pubkeys = [...new Set(events.map((e) => e.pubkey))];
        this.loadProfiles(pubkeys);
        this._scheduleZapReceiptRefresh(events);
      });

    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query([
        {
          kinds: [360, 5],
          '#i': [entityId],
        },
      ]);

      if (cachedEvents && cachedEvents.length > 0) {
        for (const event of cachedEvents) {
          this.store.add(event);
        }
      }
    } catch (e) {
      console.warn(
        '[nostr-data] Failed to read photos for place from local Nostr IDB cache',
        e
      );
    }

    // Fire network request specifically for this place (captures provenance).
    this._requestContentWithProvenance(
      this.activeReadRelays,
      [{ kinds: [360, 5], '#i': [entityId] }],
      '[nostr-data] Error fetching place photos for place:'
    );
  }

  // Recompute `placePhotos` from `_allPlacePhotos` applying the trust filter
  // and the session-only reveal toggle. Called whenever the timeline emits or
  // the user flips `showUntrustedContent`.
  _updatePlacePhotos() {
    const events = this._allPlacePhotos;
    const { trusted, untrusted } = this.partitionByTrust(events);
    this.untrustedContentCount = untrusted.length;
    this.placePhotos = this.showUntrustedContent ? events : trusted;
  }

  @action
  toggleShowUntrustedContent() {
    this.showUntrustedContent = !this.showUntrustedContent;
    this._updatePlacePhotos();
  }

  async loadMyContributions(pubkey) {
    if (!pubkey) return;

    // Reset state and unsubscribe from any previous subscription
    this.myContributionEvents = [];
    if (this._contributionsSub) {
      this._contributionsSub.unsubscribe();
      this._contributionsSub = null;
    }

    const filters = [{ kinds: [360, 5], authors: [pubkey] }];

    // 1. Set up reactive store subscription so the timeline updates as events arrive
    this._contributionsSub = this.store
      .timeline(filters)
      .subscribe((events) => {
        this.myContributionEvents = events;
      });

    // 2. Populate the store from the local Nostr IDB cache (instant)
    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query(filters);

      if (cachedEvents && cachedEvents.length > 0) {
        for (const event of cachedEvents) {
          this.store.add(event);
        }
      }
    } catch (e) {
      console.warn(
        '[nostr-data] Failed to read my contributions from local Nostr IDB cache',
        e
      );
    }

    // 3. Request fresh events from the network in the background (captures
    // provenance; own-author events bypass trust filtering anyway).
    this._requestContentWithProvenance(
      this.activeReadRelays,
      filters,
      '[nostr-data] Error fetching my contribution events:'
    );
  }

  /**
   * Hydrates the store with incoming zap receipts (kind 9735) where the user is
   * the recipient (`#p` filter). Loads from the IDB cache first (instant), then
   * fires a network request. Called by the `activity` service.
   *
   * @param {string} pubkey The user's Nostr pubkey
   */
  async loadIncomingZaps(pubkey) {
    if (!pubkey) return;

    const filters = [{ kinds: [9735], '#p': [pubkey] }];

    console.debug('[nostr-data] Requesting incoming zap receipts from relays', {
      filters,
      relays: this.activeReadRelays,
    });

    if (this._incomingZapsNetworkSub) {
      this._incomingZapsNetworkSub.unsubscribe();
      this._incomingZapsNetworkSub = null;
    }

    // 1. Populate the store from the local Nostr IDB cache (instant)
    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query(filters);

      if (cachedEvents && cachedEvents.length > 0) {
        for (const event of cachedEvents) {
          this.store.add(event);
        }
      }
    } catch (e) {
      console.warn(
        '[nostr-data] Failed to read incoming zap receipts from local Nostr IDB cache',
        e
      );
    }

    // 2. Request fresh events from the network in the background
    this._incomingZapsNetworkSub = this._requestContentWithProvenance(
      this.activeReadRelays,
      filters,
      '[nostr-data] Error fetching incoming zap receipts:'
    );
  }

  /**
   * Loads kind 360 (Place Photo) events for the activity feed, scoped to the
   * given time window and source mode.
   *
   * - `'home'` mode: fetches photos authored by the user's followed contacts
   *   (followees). If contacts haven't loaded yet (`_contactPubkeys` is null or
   *   empty), this returns early and is re-triggered automatically by the
   *   `ContactsModel` subscription callback when contacts arrive.
   * - `'explore'` mode: fetches all kind 360 photos in the time window from
   *   trusted relays (no authors filter). Provenance is captured so
   *   `isTrustedEvent` can filter at presentation time.
   *
   * @param {number} since Unix timestamp (seconds) for the start of the window
   * @param {string} [mode='home'] Source mode
   */
  async loadActivityPhotos(since, mode = 'home') {
    this._activityPhotosSince = since;
    this._activityPhotosMode = mode;

    if (this._activityPhotosNetworkSub) {
      this._activityPhotosNetworkSub.unsubscribe();
      this._activityPhotosNetworkSub = null;
    }

    if (mode === 'home') {
      this._loadFolloweePhotos(since);
    } else if (mode === 'explore') {
      this._loadTrustedRelaysPhotos(since);
    }
  }

  /**
   * Fetches kind 360 photos from the user's followees (followed contacts),
   * batched by author pubkey (≤100 per filter to stay under relay REQ limits).
   * Defers if contacts haven't loaded yet.
   */
  _loadFolloweePhotos(since) {
    const pubkeys = this._contactPubkeys
      ? Array.from(this._contactPubkeys)
      : [];

    if (pubkeys.length === 0) {
      console.debug(
        '[nostr-data] No contacts loaded yet, deferring followee photo load'
      );
      return;
    }

    const filters = this._batchAuthorFilters(pubkeys, [360], since);

    console.debug('[nostr-data] Loading followee photos', {
      filterCount: filters.length,
      pubkeyCount: pubkeys.length,
      since,
    });

    // 1. Populate the store from the local Nostr IDB cache (instant)
    this._cachePromise
      .then(() => this.cache.query(filters))
      .then((cachedEvents) => {
        if (cachedEvents && cachedEvents.length > 0) {
          for (const event of cachedEvents) {
            this.store.add(event);
          }
        }
      })
      .catch((e) => {
        console.warn(
          '[nostr-data] Failed to read followee photos from local Nostr IDB cache',
          e
        );
      });

    // 2. Request fresh events from the network (captures provenance for trust)
    this._activityPhotosNetworkSub = this._requestContentWithProvenance(
      this.activeReadRelays,
      filters,
      '[nostr-data] Error fetching followee photos:'
    );
  }

  /**
   * Fetches all kind 360 photos in the time window from trusted relays (no
   * authors filter). Provenance is captured so `isTrustedEvent` can filter
   * at presentation time. Fires immediately — no contacts dependency.
   */
  _loadTrustedRelaysPhotos(since) {
    const filters = [{ kinds: [360], since }];

    console.debug('[nostr-data] Loading trusted relay photos', { since });

    // 1. Populate the store from the local Nostr IDB cache (instant)
    this._cachePromise
      .then(() => this.cache.query(filters))
      .then((cachedEvents) => {
        if (cachedEvents && cachedEvents.length > 0) {
          for (const event of cachedEvents) {
            this.store.add(event);
          }
        }
      })
      .catch((e) => {
        console.warn(
          '[nostr-data] Failed to read trusted relay photos from local Nostr IDB cache',
          e
        );
      });

    // 2. Request fresh events from the network (captures provenance for trust)
    this._activityPhotosNetworkSub = this._requestContentWithProvenance(
      this.activeReadRelays,
      filters,
      '[nostr-data] Error fetching trusted relay photos:'
    );
  }

  /**
   * Fetches events from the network as a Promise that resolves on EOSE.
   * Records provenance for each event and adds them to the store.
   *
   * @param {object[]} filters Nostr filters
   * @param {string} errorLabel Log label for errors
   * @returns {Promise<object[]>} Deduplicated events received from relays
   */
  async _fetchEventsWithProvenance(filters, errorLabel) {
    const complete = RelayGroup.completeOnAny(
      RelayGroup.completeAfterFirstRelay(5_000),
      RelayGroup.completeOnAllEose()
    );

    const seen = new Set();
    const events = [];

    return new Promise((resolve) => {
      this.nostrRelay.pool
        .req(this.activeReadRelays, filters)
        .pipe(
          completeWhen(complete),
          timeout({ first: 30_000 }),
          filter((message) => message.type === 'EVENT')
        )
        .subscribe({
          next: (message) => {
            this._recordProvenance(message.event.id, message.from);
            this.store.add(message.event);
            if (!seen.has(message.event.id)) {
              seen.add(message.event.id);
              events.push(message.event);
            }
          },
          error: (err) => {
            console.error(errorLabel, err);
            resolve(events);
          },
          complete: () => resolve(events),
        });
    });
  }

  /**
   * Fetches kind 360 (Place Photo) events for the activity feed.
   *
   * Returns `{ cacheEvents, networkEvents }` so the caller can show cached
   * items instantly while the network request resolves on EOSE.
   *
   * - `'home'` mode: fetches photos authored by the user's followed contacts
   *   (followees), batched by author pubkey.
   * - `'explore'` mode: fetches all kind 360 photos in the time window from
   *   trusted relays (no authors filter).
   *
   * @param {number} since Unix timestamp (seconds) for the start of the window
   * @param {number} [until] Unix timestamp (seconds) for the end of the window
   * @param {string} [mode='home'] Source mode
   * @returns {Promise<{cacheEvents: object[], networkEvents: Promise<object[]>}>}
   */
  async fetchActivityPhotos(since, until, mode = 'home') {
    let filters;
    if (mode === 'home') {
      const pubkeys = this._contactPubkeys
        ? Array.from(this._contactPubkeys)
        : [];
      if (pubkeys.length === 0)
        return { cacheEvents: [], networkEvents: Promise.resolve([]) };
      filters = this._batchAuthorFilters(pubkeys, [360], since, until);
    } else if (mode === 'explore') {
      const filter = { kinds: [360], since };
      if (until !== undefined) filter.until = until;
      filters = [filter];
    } else {
      return { cacheEvents: [], networkEvents: Promise.resolve([]) };
    }

    // 1. Populate the store from the local Nostr IDB cache (instant)
    const seen = new Set();
    const cacheResult = [];

    const cacheEvents = await this._cachePromise
      .then(() => this.cache.query(filters))
      .catch(() => []);

    if (cacheEvents) {
      for (const event of cacheEvents) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          cacheResult.push(event);
          this.store.add(event);
        }
      }
    }

    // 2. Request fresh events from the network (resolves on EOSE)
    const networkEvents = this._fetchEventsWithProvenance(
      filters,
      '[nostr-data] Error fetching activity photos:'
    ).then((events) => {
      const result = [];
      for (const event of events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          result.push(event);
        }
      }
      return result;
    });

    return { cacheEvents: cacheResult, networkEvents };
  }

  /**
   * Fetches incoming zap receipts (kind 9735) where the user is the recipient.
   *
   * Returns `{ cacheEvents, networkEvents }` so the caller can show cached
   * items instantly while the network request resolves on EOSE.
   *
   * @param {string} pubkey The user's Nostr pubkey
   * @param {number} [since] Unix timestamp (seconds) for the start of the window
   * @param {number} [until] Unix timestamp (seconds) for the end of the window
   * @returns {Promise<{cacheEvents: object[], networkEvents: Promise<object[]>}>}
   */
  async fetchIncomingZaps(pubkey, since, until) {
    if (!pubkey) return { cacheEvents: [], networkEvents: Promise.resolve([]) };

    const filter = { kinds: [9735], '#p': [pubkey] };
    if (since !== undefined) filter.since = since;
    if (until !== undefined) filter.until = until;
    const filters = [filter];

    const seen = new Set();
    const cacheResult = [];

    // 1. IDB cache
    const cacheEvents = await this._cachePromise
      .then(() => this.cache.query(filters))
      .catch(() => []);

    if (cacheEvents) {
      for (const event of cacheEvents) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          cacheResult.push(event);
          this.store.add(event);
        }
      }
    }

    // 2. Network (resolves on EOSE)
    const networkEvents = this._fetchEventsWithProvenance(
      filters,
      '[nostr-data] Error fetching incoming zap receipts:'
    ).then((events) => {
      const result = [];
      for (const event of events) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          result.push(event);
        }
      }
      return result;
    });

    return { cacheEvents: cacheResult, networkEvents };
  }

  /**
   * Builds an array of Nostr filters, each with ≤ `BATCH_SIZE` author pubkeys.
   *
   * @param {string[]} pubkeys Author pubkeys to batch
   * @param {number[]} kinds Event kinds to request
   * @param {number} since Unix timestamp (seconds) for the start of the window
   * @returns {object[]} Array of filter objects
   */
  _batchAuthorFilters(pubkeys, kinds, since, until) {
    const BATCH_SIZE = 100;
    const filters = [];
    for (let i = 0; i < pubkeys.length; i += BATCH_SIZE) {
      const filter = {
        kinds,
        authors: pubkeys.slice(i, i + BATCH_SIZE),
        since,
      };
      if (until !== undefined) filter.until = until;
      filters.push(filter);
    }
    return filters;
  }

  loadProfiles(pubkeys) {
    const newPubkeys = pubkeys.filter(
      (pk) => pk && !this._profileModelSubs.has(pk)
    );

    for (const pubkey of newPubkeys) {
      const sub = this.store
        .model(ProfileModel, pubkey)
        .subscribe((profileContent) => {
          this.profiles = { ...this.profiles, [pubkey]: profileContent };
        });
      this._profileModelSubs.set(pubkey, sub);
    }
  }

  getProfile(pubkey) {
    return this.profiles[pubkey];
  }

  _clearProfileSubs() {
    for (const sub of this._profileModelSubs.values()) {
      sub.unsubscribe();
    }
    this._profileModelSubs.clear();
    this.profiles = {};
  }

  async loadProfile(pubkey) {
    if (!pubkey) return;

    // Reset state
    this.profile = null;
    this.mailboxes = null;
    this.contacts = null;
    this._contactPubkeys = null;
    this.blossomServers = [];

    // Create a deferred that resolves when contacts are first loaded
    this._contactsPromise = new Promise((resolve) => {
      this._contactsResolver = resolve;
    });

    this._cleanupSubscriptions();

    // Setup models to track state reactively FIRST
    // This way, if cached events populate the store, the UI updates instantly.
    this._profileSub = this.store
      .model(ProfileModel, pubkey)
      .subscribe((profileContent) => {
        this.profile = profileContent;
      });

    this._mailboxesSub = this.store
      .model(MailboxesModel, pubkey)
      .subscribe((mailboxesData) => {
        this.mailboxes = mailboxesData;
      });

    this._contactsSub = this.store
      .model(ContactsModel, pubkey)
      .subscribe((contacts) => {
        this.contacts = contacts;
        this._contactPubkeys = new Set(contacts.map((c) => c.pubkey));
        // Resolve the deferred so callers awaiting whenContactsLoaded proceed.
        this._contactsResolver?.();
        this._contactsResolver = null;
        this._updatePlacePhotos();
        // Re-trigger activity photo load now that contacts are available.
        // If no activity load has been requested yet, _activityPhotosSince
        // is null and the call is a no-op.
        if (this._activityPhotosSince !== null) {
          this.loadActivityPhotos(
            this._activityPhotosSince,
            this._activityPhotosMode
          );
        }
      });

    this._blossomSub = this.store
      .replaceable(10063, pubkey)
      .subscribe((event) => {
        if (event && event.tags) {
          this.blossomServers = event.tags
            .filter((t) => t[0] === 'server' && t[1])
            .map((t) => t[1]);
        } else {
          this.blossomServers = [];
        }

        if (this.blossomServers.length > 0) {
          const current = this.settings.nostrMediaServer;
          if (
            current === DEFAULT_BLOSSOM_SERVER ||
            !this.blossomServers.includes(current)
          ) {
            this.settings.update('nostrMediaServer', this.blossomServers[0]);
          }
        }
      });

    // 1. Await cache initialization and populate the EventStore with local data
    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query([
        {
          authors: [pubkey],
          kinds: [0, 3, 10002, 10063],
        },
      ]);

      if (cachedEvents && cachedEvents.length > 0) {
        for (const event of cachedEvents) {
          this.store.add(event);
        }
      }
    } catch (e) {
      console.warn('Failed to read from local Nostr IDB cache', e);
    }

    // 2. Request new events from the network in the background and dump them into the store
    const profileRelays = Array.from(
      new Set([...DIRECTORY_RELAYS, ...this.activeWriteRelays])
    );
    this._requestSub = this.nostrRelay.pool
      .request(profileRelays, [
        {
          authors: [pubkey],
          kinds: [0, 3, 10002, 10063],
        },
      ])
      .subscribe({
        next: (event) => {
          this.store.add(event);
        },
        error: (err) => {
          console.error('Error fetching profile events:', err);
        },
      });
  }

  /**
   * Returns a promise that resolves when contacts are first loaded, or
   * immediately if already loaded. Times out after 5s so callers don't hang
   * forever if contacts never arrive.
   *
   * @param {number} [timeout=5000] Timeout in milliseconds
   * @returns {Promise<void>}
   */
  whenContactsLoaded(timeout = 5000) {
    if (this._contactPubkeys) return Promise.resolve();
    if (!this._contactsPromise) return Promise.resolve();
    return Promise.race([
      this._contactsPromise,
      new Promise((resolve) => setTimeout(resolve, timeout)),
    ]);
  }

  get userDisplayName() {
    if (this.profile) {
      if (this.profile.nip05) {
        return this.profile.nip05;
      }
      if (this.profile.displayName || this.profile.display_name) {
        return this.profile.displayName || this.profile.display_name;
      }
      if (this.profile.name) {
        return this.profile.name;
      }
    }

    // Fallback to npub
    if (this.nostrAuth.pubkey) {
      try {
        const npub = npubEncode(this.nostrAuth.pubkey);
        return `${npub.slice(0, 9)}...${npub.slice(-4)}`;
      } catch {
        return this.nostrAuth.pubkey;
      }
    }

    return 'Not connected';
  }

  async clearCache() {
    await this._cachePromise;
    if (this.cache) {
      await this.cache.deleteAllEvents();
    }
  }

  _scheduleZapReceiptRefresh(events) {
    const newIds = new Set(events.map((e) => e.id));

    let changed = false;
    if (newIds.size !== this._lastPhotoIds.size) {
      changed = true;
    } else {
      for (const id of newIds) {
        if (!this._lastPhotoIds.has(id)) {
          changed = true;
          break;
        }
      }
    }

    if (!changed) return;
    this._lastPhotoIds = newIds;

    this._clearZapRefreshTimer();
    this._zapRefreshTimer = setTimeout(() => {
      this._zapRefreshTimer = null;
      this._refreshZapReceiptSubscription([...newIds]);
    }, 100);
  }

  _clearZapRefreshTimer() {
    if (this._zapRefreshTimer) {
      clearTimeout(this._zapRefreshTimer);
      this._zapRefreshTimer = null;
    }
  }

  _refreshZapReceiptSubscription(photoIds) {
    this._cleanupZapReceiptSubs();

    if (!photoIds || photoIds.length === 0) return;

    // Batch IDs into filters of <=100 to stay under relay REQ limits
    const BATCH_SIZE = 100;
    const filters = [];
    for (let i = 0; i < photoIds.length; i += BATCH_SIZE) {
      filters.push({
        kinds: [9735],
        '#e': photoIds.slice(i, i + BATCH_SIZE),
      });
    }

    // Reactive local query — emits whenever matching events are in the store
    this._zapReceiptsSub = this.store.timeline(filters).subscribe((events) => {
      this._updateZapReceipts(events);
    });

    // Load from IDB cache (fire-and-forget — store.add triggers timeline)
    this._cachePromise
      .then(() => this.cache.query(filters))
      .then((cachedEvents) => {
        if (cachedEvents && cachedEvents.length > 0) {
          for (const event of cachedEvents) {
            this.store.add(event);
          }
        }
      })
      .catch((e) => {
        console.warn('[nostr-data] Failed to read zap receipts from cache', e);
      });

    // Network request (fire-and-forget)
    this._zapReceiptsNetworkSub = this.nostrRelay.pool
      .request(this.activeReadRelays, filters)
      .subscribe({
        next: (event) => {
          this.store.add(event);
        },
        error: (err) => {
          console.error('[nostr-data] Error fetching zap receipts:', err);
        },
      });
  }

  _updateZapReceipts(events) {
    const grouped = {};
    for (const receipt of events) {
      for (const tag of receipt.tags) {
        if (tag[0] === 'e' && tag[1]) {
          if (!grouped[tag[1]]) grouped[tag[1]] = [];
          grouped[tag[1]].push(receipt);
        }
      }
    }
    this.zapReceipts = { ...this.zapReceipts, ...grouped };
  }

  _cleanupZapReceiptSubs() {
    if (this._zapReceiptsSub) {
      this._zapReceiptsSub.unsubscribe();
      this._zapReceiptsSub = null;
    }
    if (this._zapReceiptsNetworkSub) {
      this._zapReceiptsNetworkSub.unsubscribe();
      this._zapReceiptsNetworkSub = null;
    }
  }

  _cleanupSubscriptions() {
    if (this._requestSub) {
      this._requestSub.unsubscribe();
      this._requestSub = null;
    }
    if (this._profileSub) {
      this._profileSub.unsubscribe();
      this._profileSub = null;
    }
    if (this._mailboxesSub) {
      this._mailboxesSub.unsubscribe();
      this._mailboxesSub = null;
    }
    if (this._contactsSub) {
      this._contactsSub.unsubscribe();
      this._contactsSub = null;
      this._contactPubkeys = null;
    }
    if (this._blossomSub) {
      this._blossomSub.unsubscribe();
      this._blossomSub = null;
    }
    if (this._photosSub) {
      this._photosSub.unsubscribe();
      this._photosSub = null;
    }
    if (this._contributionsSub) {
      this._contributionsSub.unsubscribe();
      this._contributionsSub = null;
    }
    this._cleanupZapReceiptSubs();
    this._clearZapRefreshTimer();
    if (this._incomingZapsNetworkSub) {
      this._incomingZapsNetworkSub.unsubscribe();
      this._incomingZapsNetworkSub = null;
    }
    if (this._activityPhotosNetworkSub) {
      this._activityPhotosNetworkSub.unsubscribe();
      this._activityPhotosNetworkSub = null;
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._cleanupSubscriptions();
    this._clearProfileSubs();

    if (this._deletionsSub) {
      this._deletionsSub.unsubscribe();
      this._deletionsSub = null;
    }

    if (this._stopPersisting) {
      this._stopPersisting();
    }

    if (this.cache) {
      this.cache.stop();
    }
  }
}
