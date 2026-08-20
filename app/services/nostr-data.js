import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { EMPTY, from } from 'rxjs';
import { EventStore } from 'applesauce-core/event-store';
import { ProfileModel } from 'applesauce-core/models/profile';
import { MailboxesModel } from 'applesauce-core/models/mailboxes';
import { npubEncode } from 'applesauce-core/helpers/pointers';
import { persistEventsToCache } from 'applesauce-core/helpers/event-cache';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';
import { NostrIDB, openDB } from 'nostr-idb';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  normalizeRelayUrl,
  uniqNormalizedRelays,
} from '../utils/nostr';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';

const DIRECTORY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

const DEFAULT_READ_RELAYS = ['wss://nostr.kosmos.org'];
const DEFAULT_WRITE_RELAYS = [];

export default class NostrDataService extends Service {
  @service nostrRelay;
  @service nostrAuth;
  @service settings;

  store = new EventStore();

  @tracked profile = null;
  @tracked mailboxes = null;
  @tracked blossomServers = [];
  @tracked placePhotos = [];
  @tracked myContributionEvents = [];
  @tracked profiles = {};
  @tracked zapReceipts = {};

  _profileSub = null;
  _mailboxesSub = null;
  _blossomSub = null;
  _photosSub = null;
  _contributionsSub = null;
  _profileModelSubs = new Map();

  _zapReceiptsSub = null;
  _zapReceiptsNetworkSub = null;
  _zapRefreshTimer = null;
  _lastPhotoIds = new Set();

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
          // Only cache profiles, mailboxes, blossom servers, and place photos, and deletions
          const toCache = events.filter(
            (e) =>
              e.kind === 0 ||
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

    // Fire network request for new prefixes
    this.nostrRelay.pool
      .request(this.activeReadRelays, [
        {
          kinds: [360],
          '#g': missingPrefixes,
        },
      ])
      .subscribe({
        next: (event) => {
          this.store.add(event);
        },
        error: (err) => {
          console.error(
            '[nostr-data] Error fetching place photos by geohash:',
            err
          );
        },
      });

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
        this.placePhotos = events;
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

    // Fire network request specifically for this place
    this.nostrRelay.pool
      .request(this.activeReadRelays, [
        {
          kinds: [360, 5],
          '#i': [entityId],
        },
      ])
      .subscribe({
        next: (event) => {
          this.store.add(event);
        },
        error: (err) => {
          console.error(
            '[nostr-data] Error fetching place photos for place:',
            err
          );
        },
      });
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

    // 3. Request fresh events from the network in the background
    this.nostrRelay.pool.request(this.activeReadRelays, filters).subscribe({
      next: (event) => {
        this.store.add(event);
      },
      error: (err) => {
        console.error(
          '[nostr-data] Error fetching my contribution events:',
          err
        );
      },
    });
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
    this.blossomServers = [];

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
      });

    // 1. Await cache initialization and populate the EventStore with local data
    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query([
        {
          authors: [pubkey],
          kinds: [0, 10002, 10063],
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
          kinds: [0, 10002, 10063],
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
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._cleanupSubscriptions();
    this._clearProfileSubs();

    if (this._stopPersisting) {
      this._stopPersisting();
    }

    if (this.cache) {
      this.cache.stop();
    }
  }
}
