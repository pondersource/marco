import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { EventStore } from 'applesauce-core/event-store';
import { ProfileModel } from 'applesauce-core/models/profile';
import { MailboxesModel } from 'applesauce-core/models/mailboxes';
import { npubEncode } from 'applesauce-core/helpers/pointers';
import { persistEventsToCache } from 'applesauce-core/helpers/event-cache';
import { NostrIDB, openDB } from 'nostr-idb';
import { normalizeRelayUrl } from '../utils/nostr';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';

const DIRECTORY_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
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

  _profileSub = null;
  _mailboxesSub = null;
  _blossomSub = null;
  _photosSub = null;

  _requestSub = null;
  _cachePromise = null;
  loadedGeohashPrefixes = new Set();

  constructor() {
    super(...arguments);

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
          // Only cache profiles, mailboxes, blossom servers, and place photos
          const toCache = events.filter(
            (e) =>
              e.kind === 0 ||
              e.kind === 10002 ||
              e.kind === 10063 ||
              e.kind === 360
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

  get defaultReadRelays() {
    const mailboxes = (this.mailboxes?.inboxes || [])
      .map(normalizeRelayUrl)
      .filter(Boolean);
    const defaults = DEFAULT_READ_RELAYS.map(normalizeRelayUrl).filter(Boolean);
    return Array.from(new Set([...defaults, ...mailboxes]));
  }

  get defaultWriteRelays() {
    const mailboxes = (this.mailboxes?.outboxes || [])
      .map(normalizeRelayUrl)
      .filter(Boolean);
    const defaults =
      DEFAULT_WRITE_RELAYS.map(normalizeRelayUrl).filter(Boolean);
    return Array.from(new Set([...defaults, ...mailboxes]));
  }

  get activeReadRelays() {
    if (this.settings.nostrReadRelays) {
      return Array.from(
        new Set(
          this.settings.nostrReadRelays.map(normalizeRelayUrl).filter(Boolean)
        )
      );
    }
    return this.defaultReadRelays;
  }

  get activeWriteRelays() {
    if (this.settings.nostrWriteRelays) {
      return Array.from(
        new Set(
          this.settings.nostrWriteRelays.map(normalizeRelayUrl).filter(Boolean)
        )
      );
    }
    return this.defaultWriteRelays;
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
    if (this._photosSub) {
      this._photosSub.unsubscribe();
      this._photosSub = null;
    }

    this.placePhotos = [];

    if (!place || !place.osmId || !place.osmType) {
      return;
    }

    const entityId = `osm:${place.osmType}:${place.osmId}`;

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
      });

    try {
      await this._cachePromise;

      const cachedEvents = await this.cache.query([
        {
          kinds: [360],
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
          kinds: [360],
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
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._cleanupSubscriptions();

    if (this._stopPersisting) {
      this._stopPersisting();
    }

    if (this.cache) {
      this.cache.stop();
    }
  }
}
