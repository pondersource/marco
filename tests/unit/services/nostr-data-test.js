import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import { Subject, EMPTY, of } from 'rxjs';
import Service from '@ember/service';
import NostrDataService from 'marco/services/nostr-data';
import { getGeohashPrefixesInBbox } from 'marco/utils/geohash-coverage';

function makePubkey(n) {
  return n.toString(16).padStart(64, '0');
}

function makeEventId(n) {
  return `e${n.toString(16).padStart(63, '0')}`;
}

function makeContactsEvent(pubkey, contactPubkeys, opts = {}) {
  const id = opts.id || makeEventId(1);
  const createdAt = opts.created_at || 1000;
  return {
    id,
    pubkey,
    kind: 3,
    created_at: createdAt,
    tags: contactPubkeys.map((pk) => ['p', pk, 'wss://relay.example']),
    content: '',
    sig: 'sig',
  };
}

function makePhotoEvent(pubkey, placeId, opts = {}) {
  const id = opts.id || makeEventId(100);
  const createdAt = opts.created_at || 2000;
  return {
    id,
    pubkey,
    kind: 360,
    created_at: createdAt,
    tags: [
      ['i', placeId],
      ['imeta', 'url https://example.com/photo.jpg', 'dim 800x600'],
    ],
    content: '',
    sig: 'sig',
  };
}

function makePhotoEventWithGeohash(pubkey, placeId, geohash, opts = {}) {
  const event = makePhotoEvent(pubkey, placeId, opts);
  event.tags.push(['g', geohash]);
  return event;
}

function makeDeletionEvent(pubkey, eventIds, opts = {}) {
  const id = opts.id || makeEventId(50);
  return {
    id,
    pubkey,
    kind: 5,
    created_at: opts.created_at || 5000,
    tags: eventIds.map((eid) => ['e', eid]),
    content: '',
    sig: 'sig',
  };
}

function makeZapReceiptEvent(pubkey, photoEventIds, opts = {}) {
  const id = opts.id || makeEventId(600);
  return {
    id,
    pubkey,
    kind: 9735,
    created_at: opts.created_at || 6000,
    tags: photoEventIds.map((eid) => ['e', eid]),
    content: '',
    sig: 'sig',
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupNostrDataService(hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    const requestedFilters = [];
    const reqCalls = [];
    const reqMessages = new Subject();

    class StubNostrRelayService extends Service {
      pool = {
        relays$: new Subject(),
        request: (_relays, filters) => {
          requestedFilters.push(...filters);
          return EMPTY;
        },
        req: (_relays, filters) => {
          reqCalls.push(true);
          requestedFilters.push(...filters);
          return reqMessages;
        },
        publish: () => Promise.resolve([{ ok: true }]),
      };
    }

    this.owner.register('service:nostrRelay', StubNostrRelayService);
    this.owner.register('service:nostrData', NostrDataService);

    this.requestedFilters = requestedFilters;
    this.reqCalls = reqCalls;
    this.reqMessages = reqMessages;

    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;
  });

  hooks.afterEach(async function () {
    const service = this.owner.lookup('service:nostr-data');
    await service.clearCache();
    await service.localForage.clear('event-relay-provenance');
  });
}

module('Unit | Service | nostr-data | contacts', function (hooks) {
  setupNostrDataService(hooks);

  test('loadProfile populates contacts from store via ContactsModel', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkey = makePubkey(1);
    const contactA = makePubkey(2);
    const contactB = makePubkey(3);

    service.store.add(makeContactsEvent(pubkey, [contactA, contactB]));

    await service.loadProfile(pubkey);

    assert.ok(service.contacts, 'contacts is populated');
    assert.strictEqual(service.contacts.length, 2, 'two contacts');
    const pubkeys = service.contacts.map((c) => c.pubkey).sort();
    assert.deepEqual(
      pubkeys,
      [contactA, contactB].sort(),
      'contact pubkeys match'
    );
  });

  test('loadProfile tears down previous contacts subscription when called with a different pubkey', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkeyA = makePubkey(1);
    const pubkeyB = makePubkey(4);
    const contactA = makePubkey(2);

    service.store.add(makeContactsEvent(pubkeyA, [contactA]));
    await service.loadProfile(pubkeyA);

    assert.strictEqual(
      service.contacts.length,
      1,
      'contacts populated for pubkeyA'
    );

    // Switch to a different pubkey — this should tear down pubkeyA's subscription
    await service.loadProfile(pubkeyB);

    assert.deepEqual(
      service.contacts,
      [],
      'contacts is empty for pubkeyB (no kind 3 event)'
    );

    // Add a new contacts event for pubkeyA after the switch
    const newerEvent = makeContactsEvent(pubkeyA, [makePubkey(9)], {
      created_at: 2000,
    });
    service.store.add(newerEvent);

    // Give the subscriptions a tick to propagate
    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(
      service.contacts,
      [],
      'contacts remains empty — old subscription was torn down'
    );
  });

  test('loadProfile network request includes kind 3', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkey = makePubkey(1);
    await service.loadProfile(pubkey);

    const kindsFilter = this.requestedFilters.find((f) =>
      f.authors?.includes(pubkey)
    );
    assert.ok(kindsFilter, 'filter with authors was requested');
    assert.ok(kindsFilter.kinds.includes(3), 'kinds includes 3 (contacts)');
    assert.deepEqual(
      kindsFilter.kinds.sort(),
      [0, 3, 10002, 10063].sort(),
      'kinds match expected set'
    );
  });

  test('whenContactsLoaded resolves after contacts are loaded', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkey = makePubkey(1);
    const contactA = makePubkey(2);

    // Start loadProfile (sets up the deferred + subscriptions)
    await service.loadProfile(pubkey);

    // Contacts not loaded yet — whenContactsLoaded should not resolve yet
    // (it will resolve after timeout, but we'll add the event first)

    // Add a contacts event to the store — the ContactsModel subscription fires
    service.store.add(makeContactsEvent(pubkey, [contactA]));

    // Give the model a tick to process
    await new Promise((r) => setTimeout(r, 50));

    await service.whenContactsLoaded();

    assert.ok(service._contactPubkeys, 'contacts loaded');
    assert.true(
      service._contactPubkeys.has(contactA),
      'contact pubkey present'
    );
  });

  test('whenContactsLoaded resolves immediately when contacts already loaded', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkey = makePubkey(1);
    const contactA = makePubkey(2);

    service.store.add(makeContactsEvent(pubkey, [contactA]));
    await service.loadProfile(pubkey);
    await new Promise((r) => setTimeout(r, 50));

    // Contacts are already loaded — whenContactsLoaded should resolve immediately
    await service.whenContactsLoaded();

    assert.true(service._contactPubkeys.has(contactA), 'contacts available');
  });

  test('whenContactsLoaded resolves immediately when no profile loaded', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    // No loadProfile called — should resolve immediately
    await service.whenContactsLoaded();

    assert.true(true, 'resolved without hanging');
  });

  test('kind 3 events are persisted to IDB cache', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    // Wait for the IDB cache to be ready before adding events
    await service._cachePromise;

    const pubkey = makePubkey(1);
    const contactA = makePubkey(2);
    const event = makeContactsEvent(pubkey, [contactA], { id: makeEventId(5) });

    service.store.add(event);

    // Wait for the persistEventsToCache batch (1s) plus some margin
    await new Promise((r) => setTimeout(r, 1500));

    const cached = await service.cache.query([
      { kinds: [3], authors: [pubkey] },
    ]);
    assert.strictEqual(cached.length, 1, 'kind 3 event is in IDB cache');
    assert.strictEqual(cached[0].id, event.id, 'cached event id matches');
  });
});

module('Unit | Service | nostr-data | relay configuration', function (hooks) {
  setupNostrDataService(hooks);

  test('mailboxReadRelays normalizes mailbox inbox URLs', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    assert.deepEqual(service.mailboxReadRelays, [], 'empty when no mailboxes');

    service.mailboxes = {
      inboxes: ['WSS://Relay.Example.COM/', 'relay.two.example'],
      outboxes: [],
    };

    assert.deepEqual(
      service.mailboxReadRelays,
      ['wss://relay.example.com', 'wss://relay.two.example'],
      'normalizes and filters invalid URLs'
    );
  });

  test('mailboxWriteRelays returns empty array without mailboxes', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    assert.deepEqual(service.mailboxWriteRelays, [], 'empty when no mailboxes');

    service.mailboxes = {
      inboxes: [],
      outboxes: ['WSS://Outbox.Example.COM/'],
    };

    assert.deepEqual(
      service.mailboxWriteRelays,
      ['wss://outbox.example.com'],
      'normalizes outbox URLs'
    );
  });

  test('configuredReadRelays merges mailbox and custom relays with dedupe and exclusions', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.mailboxes = { inboxes: ['wss://a.example'], outboxes: [] };
    service.settings.nostrReadRelays = ['wss://a.example/', 'wss://b.example'];

    assert.deepEqual(
      service.configuredReadRelays,
      ['wss://a.example', 'wss://b.example'],
      'merges and deduplicates (normalized)'
    );

    service.settings.nostrReadRelayExclusions = ['wss://a.example'];

    assert.deepEqual(
      service.configuredReadRelays,
      ['wss://b.example'],
      'exclusions remove mailbox relays'
    );
  });

  test('configuredWriteRelays merges mailbox outboxes with custom write relays', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.mailboxes = { inboxes: [], outboxes: ['wss://out.example'] };
    service.settings.nostrWriteRelays = ['wss://custom.example'];

    assert.deepEqual(
      service.configuredWriteRelays,
      ['wss://out.example', 'wss://custom.example'],
      'merges mailbox and custom write relays'
    );

    service.settings.nostrWriteRelayExclusions = ['wss://out.example'];

    assert.deepEqual(
      service.configuredWriteRelays,
      ['wss://custom.example'],
      'exclusions apply to write relays'
    );
  });

  test('activeReadRelays puts required relays first and appends custom', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    assert.deepEqual(
      service.activeReadRelays,
      ['wss://nostr.kosmos.org'],
      'default is required only'
    );

    service.settings.nostrReadRelays = ['wss://custom.example'];

    assert.deepEqual(
      service.activeReadRelays,
      ['wss://nostr.kosmos.org', 'wss://custom.example'],
      'required first, custom appended'
    );
  });

  test('activeWriteRelays returns empty when nothing configured', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    assert.deepEqual(
      service.activeWriteRelays,
      [],
      'no required write relays by default'
    );
  });

  test('trustedRelays includes required read relays plus user-marked trusted relays', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    assert.deepEqual(
      service.trustedRelays,
      ['wss://nostr.kosmos.org'],
      'default is required read relays only'
    );

    service.settings.nostrTrustedRelays = ['wss://custom.example'];

    assert.deepEqual(
      service.trustedRelays,
      ['wss://nostr.kosmos.org', 'wss://custom.example'],
      'merges custom trusted relays'
    );
  });
});

module('Unit | Service | nostr-data | provenance', function (hooks) {
  setupNostrDataService(hooks);

  test('_recordProvenance accumulates relays for an event and persists them', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const eventId = makeEventId(900);

    service._recordProvenance(eventId, 'wss://one.example');
    service._recordProvenance(eventId, 'wss://two.example');
    service._recordProvenance(eventId, 'wss://one.example'); // duplicate

    const relays = service._eventRelays.get(eventId);
    assert.strictEqual(relays.size, 2, 'accumulates unique relays');
    assert.true(relays.has('wss://one.example'), 'has first relay');
    assert.true(relays.has('wss://two.example'), 'has second relay');

    const persisted = await service.localForage.get(
      'event-relay-provenance',
      eventId
    );
    assert.deepEqual(
      persisted.sort(),
      ['wss://one.example', 'wss://two.example'],
      'persists to localForage'
    );
  });

  test('kind 5 deletion events remove provenance for referenced events', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const deadId = makeEventId(901);
    const author = makePubkey(50);

    service._recordProvenance(deadId, 'wss://one.example');

    // The store routes kind-5 events to its DeleteManager, which emits
    // deleted$ synchronously from add() — provenance is dropped immediately.
    service.store.add(makeDeletionEvent(author, [deadId]));

    assert.false(
      service._eventRelays.has(deadId),
      'provenance removed from memory'
    );
    const persisted = await service.localForage.get(
      'event-relay-provenance',
      deadId
    );
    assert.strictEqual(persisted, null, 'provenance removed from localForage');
  });

  test('_hydrateProvenance restores persisted provenance', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const eventId = makeEventId(902);

    await service.localForage.set('event-relay-provenance', eventId, [
      'wss://x.example',
    ]);

    await service._hydrateProvenance();

    const relays = service._eventRelays.get(eventId);
    assert.ok(relays, 'provenance restored');
    assert.true(relays.has('wss://x.example'), 'contains the relay');
  });

  test('_requestContentWithProvenance records provenance and adds events to the store', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const eventId = makeEventId(903);
    const pubkey = makePubkey(60);

    service._requestContentWithProvenance(
      ['wss://relay.test'],
      [{ kinds: [360] }],
      'test'
    );

    const photoEvent = makePhotoEvent(pubkey, 'osm:node:1', { id: eventId });
    this.reqMessages.next({
      type: 'EVENT',
      event: photoEvent,
      from: 'wss://relay.test',
    });

    await wait(50);

    const relays = service._eventRelays.get(eventId);
    assert.ok(relays, 'provenance recorded');
    assert.true(
      relays.has('wss://relay.test'),
      'contains the relay the event came from'
    );
    assert.true(service.store.hasEvent(eventId), 'event added to store');
  });
});

module('Unit | Service | nostr-data | trust evaluation', function (hooks) {
  setupNostrDataService(hooks);

  test('isTrustedEvent trusts content from followed contacts', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const followedPubkey = makePubkey(2);

    // User follows followedPubkey
    service.store.add(makeContactsEvent(userPubkey, [followedPubkey]));
    await service.loadProfile(userPubkey);

    // Photo from followed contact (no trusted relay provenance)
    const photoEvent = makePhotoEvent(followedPubkey, 'osm:node:123', {
      id: makeEventId(200),
    });
    service.store.add(photoEvent);

    assert.true(
      service.isTrustedEvent(photoEvent),
      'photo from followed contact is trusted'
    );
  });

  test('isTrustedEvent does not trust content from unfollowed pubkeys', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const followedPubkey = makePubkey(2);
    const unfollowedPubkey = makePubkey(3);

    // User follows followedPubkey (but NOT unfollowedPubkey)
    service.store.add(makeContactsEvent(userPubkey, [followedPubkey]));
    await service.loadProfile(userPubkey);

    // Photo from unfollowed pubkey (no trusted relay provenance)
    const photoEvent = makePhotoEvent(unfollowedPubkey, 'osm:node:123', {
      id: makeEventId(201),
    });
    service.store.add(photoEvent);

    assert.false(
      service.isTrustedEvent(photoEvent),
      'photo from unfollowed pubkey is not trusted'
    );
  });

  test('isTrustedEvent still trusts own content (regression)', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    service.nostrAuth = { pubkey: userPubkey };

    await service.loadProfile(userPubkey);

    // Photo from the user themselves
    const photoEvent = makePhotoEvent(userPubkey, 'osm:node:123', {
      id: makeEventId(202),
    });
    service.store.add(photoEvent);

    assert.true(service.isTrustedEvent(photoEvent), 'own photo is trusted');
  });

  test('isTrustedEvent still trusts content from trusted relays (regression)', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const randomPubkey = makePubkey(99);

    await service.loadProfile(userPubkey);

    // Photo from random pubkey
    const photoEvent = makePhotoEvent(randomPubkey, 'osm:node:123', {
      id: makeEventId(203),
    });
    service.store.add(photoEvent);

    // Simulate provenance: photo was seen on a trusted relay
    const trustedRelay = 'wss://nostr.kosmos.org';
    service._recordProvenance(photoEvent.id, trustedRelay);

    assert.true(
      service.isTrustedEvent(photoEvent),
      'photo from trusted relay is trusted'
    );
  });

  test('isTrustedEvent re-evaluates when contacts change', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const followedPubkey = makePubkey(2);

    // Load profile first (no contacts yet)
    await service.loadProfile(userPubkey);

    // Create a photo from followedPubkey (who is not yet followed)
    const photoEvent = makePhotoEvent(followedPubkey, 'osm:node:456', {
      id: makeEventId(204),
    });

    // Photo should be untrusted initially (no contacts loaded yet)
    assert.false(
      service.isTrustedEvent(photoEvent),
      'photo is untrusted before contacts load'
    );

    // Now load contacts (user follows followedPubkey)
    service.store.add(
      makeContactsEvent(userPubkey, [followedPubkey], {
        id: makeEventId(300),
        created_at: 3000,
      })
    );

    // Give the contacts subscription a tick to propagate
    await new Promise((r) => setTimeout(r, 50));

    // Photo should now be trusted (contacts loaded)
    assert.true(
      service.isTrustedEvent(photoEvent),
      'photo is trusted after contacts load'
    );
  });

  test('partitionByTrust always passes kind 5 deletions through as trusted', function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const untrustedPk = makePubkey(70);
    const authorPk = makePubkey(71);

    const untrustedPhoto = makePhotoEvent(untrustedPk, 'osm:node:1', {
      id: makeEventId(904),
    });
    const deletion = makeDeletionEvent(authorPk, [untrustedPhoto.id], {
      id: makeEventId(905),
    });

    const { trusted, untrusted } = service.partitionByTrust([
      untrustedPhoto,
      deletion,
    ]);

    assert.strictEqual(trusted.length, 1, 'one trusted event');
    assert.strictEqual(trusted[0].kind, 5, 'deletion is trusted');
    assert.strictEqual(untrusted.length, 1, 'one untrusted event');
    assert.strictEqual(untrusted[0].kind, 360, 'photo is untrusted');
  });
});

module('Unit | Service | nostr-data | geohash loading', function (hooks) {
  setupNostrDataService(hooks);

  const BERLIN_BBOX = {
    minLat: 52.5,
    minLon: 13.4,
    maxLat: 52.55,
    maxLon: 13.45,
  };

  test('requests kind 360 events for missing geohash prefixes and marks them loaded', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const expected = getGeohashPrefixesInBbox(BERLIN_BBOX);
    assert.ok(expected.length > 0, 'bbox produces prefixes');

    await service.loadPlacesInBounds(BERLIN_BBOX);

    assert.strictEqual(this.reqCalls.length, 1, 'one network request made');
    const filter = this.requestedFilters.find((f) => f['#g']);
    assert.ok(filter, 'geohash filter was requested');
    assert.deepEqual(filter.kinds, [360], 'requests kind 360');
    assert.deepEqual(
      filter['#g'].sort(),
      expected.sort(),
      'covers all prefixes'
    );
    for (const p of expected) {
      assert.true(
        service.loadedGeohashPrefixes.has(p),
        `prefix ${p} marked loaded`
      );
    }
  });

  test('skips prefixes that were already loaded', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    await service.loadPlacesInBounds(BERLIN_BBOX);
    const firstReqCalls = this.reqCalls.length;

    await service.loadPlacesInBounds(BERLIN_BBOX);

    assert.strictEqual(
      this.reqCalls.length,
      firstReqCalls,
      'no additional network request'
    );
  });

  test('hydrates matching cached photos into the store', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    await service._cachePromise;

    const pk = makePubkey(80);
    const geohash = getGeohashPrefixesInBbox(BERLIN_BBOX)[0];
    const cached = makePhotoEventWithGeohash(pk, 'osm:node:700', geohash, {
      id: makeEventId(700),
      created_at: 4000,
    });
    await service.cache.add(cached);

    await service.loadPlacesInBounds(BERLIN_BBOX);

    assert.true(
      service.store.hasEvent(cached.id),
      'cached photo added to store'
    );
  });
});

module('Unit | Service | nostr-data | place photos', function (hooks) {
  setupNostrDataService(hooks);

  test('sets entity id and streams photos for the place', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pk = makePubkey(81);
    const photoId = makeEventId(800);

    await service.loadPhotosForPlace({ osmId: '800', osmType: 'node' });
    assert.strictEqual(
      service._currentPlaceEntityId,
      'osm:node:800',
      'entity id set'
    );

    service._recordProvenance(photoId, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pk, 'osm:node:800', { id: photoId }));

    assert.strictEqual(service.placePhotos.length, 1, 'photo visible');
  });

  test('calling with the same place twice does not tear down subscriptions', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    await service.loadPhotosForPlace({ osmId: '800', osmType: 'node' });
    const firstSub = service._photosSub;

    await service.loadPhotosForPlace({ osmId: '800', osmType: 'node' });

    assert.strictEqual(
      service._photosSub,
      firstSub,
      'same subscription retained'
    );
  });

  test('switching places resets state and re-subscribes', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pk = makePubkey(82);
    const idA = makeEventId(801);
    const idB = makeEventId(802);

    await service.loadPhotosForPlace({ osmId: '800', osmType: 'node' });
    service._recordProvenance(idA, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pk, 'osm:node:800', { id: idA }));
    assert.strictEqual(service.placePhotos.length, 1, 'place 800 has photo');

    await service.loadPhotosForPlace({ osmId: '801', osmType: 'node' });
    assert.deepEqual(service.placePhotos, [], 'photos cleared');
    assert.strictEqual(
      service._currentPlaceEntityId,
      'osm:node:801',
      'entity id updated'
    );

    service._recordProvenance(idB, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pk, 'osm:node:801', { id: idB }));
    assert.strictEqual(service.placePhotos.length, 1, 'new place has photo');
    assert.strictEqual(service.placePhotos[0].id, idB);
  });

  test('null place clears state and tears down subscription', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pk = makePubkey(83);
    const idA = makeEventId(803);

    await service.loadPhotosForPlace({ osmId: '800', osmType: 'node' });
    service._recordProvenance(idA, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pk, 'osm:node:800', { id: idA }));
    assert.strictEqual(service.placePhotos.length, 1);

    await service.loadPhotosForPlace(null);

    assert.deepEqual(service.placePhotos, [], 'photos cleared');
    assert.strictEqual(
      service._currentPlaceEntityId,
      null,
      'entity id cleared'
    );
    assert.strictEqual(service._photosSub, null, 'subscription torn down');
  });

  test('placePhotos hides untrusted photos by default and counts them', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pkA = makePubkey(84);
    const pkB = makePubkey(85);
    const trustedId = makeEventId(900);
    const untrustedId = makeEventId(901);

    await service.loadPhotosForPlace({ osmId: '900', osmType: 'node' });

    service._recordProvenance(trustedId, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pkA, 'osm:node:900', { id: trustedId }));
    service.store.add(makePhotoEvent(pkB, 'osm:node:900', { id: untrustedId }));

    assert.deepEqual(
      service.placePhotos.map((e) => e.id),
      [trustedId],
      'only trusted shown'
    );
    assert.strictEqual(service.untrustedContentCount, 1, 'untrusted counted');
  });

  test('toggleShowUntrustedContent reveals all photos and toggles back', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pkA = makePubkey(86);
    const pkB = makePubkey(87);
    const trustedId = makeEventId(902);
    const untrustedId = makeEventId(903);

    await service.loadPhotosForPlace({ osmId: '901', osmType: 'node' });

    service._recordProvenance(trustedId, 'wss://nostr.kosmos.org');
    service.store.add(makePhotoEvent(pkA, 'osm:node:901', { id: trustedId }));
    service.store.add(makePhotoEvent(pkB, 'osm:node:901', { id: untrustedId }));

    service.toggleShowUntrustedContent();
    assert.strictEqual(service.placePhotos.length, 2, 'all photos shown');
    assert.strictEqual(service.untrustedContentCount, 1, 'count unchanged');

    service.toggleShowUntrustedContent();
    assert.strictEqual(service.placePhotos.length, 1, 'back to trusted only');
  });

  test('own photos are shown without provenance', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const myPubkey = makePubkey(95);
    service.nostrAuth = { pubkey: myPubkey };
    const ownId = makeEventId(950);

    await service.loadPhotosForPlace({ osmId: '950', osmType: 'node' });
    service.store.add(makePhotoEvent(myPubkey, 'osm:node:950', { id: ownId }));

    assert.strictEqual(
      service.placePhotos.length,
      1,
      'own photo shown without provenance'
    );
    assert.strictEqual(service.untrustedContentCount, 0);
  });
});

module('Unit | Service | nostr-data | my contributions', function (hooks) {
  setupNostrDataService(hooks);

  test('returns early when pubkey is null', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    await service.loadMyContributions(null);

    assert.deepEqual(service.myContributionEvents, [], 'no events loaded');
    assert.strictEqual(
      service._contributionsSub,
      null,
      'no subscription created'
    );
  });

  test('loads own photos from store into myContributionEvents', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const myPk = makePubkey(60);
    const photoId = makeEventId(600);

    service.store.add(makePhotoEvent(myPk, 'osm:node:600', { id: photoId }));

    await service.loadMyContributions(myPk);

    assert.strictEqual(
      service.myContributionEvents.length,
      1,
      'photo in contributions'
    );
    assert.strictEqual(service.myContributionEvents[0].id, photoId);
  });

  test('requests own contributions from network with correct filter', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const myPk = makePubkey(61);

    await service.loadMyContributions(myPk);

    const filter = this.requestedFilters.find((f) => f.authors?.includes(myPk));
    assert.ok(filter, 'filter for own pubkey requested');
    assert.deepEqual(filter.kinds.sort(), [360, 5].sort(), 'kinds 360 and 5');
  });
});

module('Unit | Service | nostr-data | activity photos', function (hooks) {
  setupNostrDataService(hooks);

  test('loadActivityPhotos defers when contacts are not loaded yet', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    // _contactPubkeys is null initially (no loadProfile called)
    assert.strictEqual(service._contactPubkeys, null);

    await service.loadActivityPhotos(1000, 'home');

    // No network request should have been made
    const photoFilters = this.requestedFilters.filter(
      (f) => f.kinds?.includes(360) && f.authors
    );
    assert.strictEqual(photoFilters.length, 0, 'no request without contacts');
  });

  test('loadActivityPhotos batches >100 pubkeys into multiple filters', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    // Create 250 contact pubkeys
    const contactPubkeys = Array.from({ length: 250 }, (_, i) =>
      makePubkey(100 + i)
    );

    // Load contacts so _contactPubkeys is populated
    service.store.add(makeContactsEvent(userPubkey, contactPubkeys));
    await service.loadProfile(userPubkey);

    await service.loadActivityPhotos(1000, 'home');

    const photoFilters = this.requestedFilters.filter(
      (f) => f.kinds?.includes(360) && f.authors && f.since !== undefined
    );
    assert.strictEqual(
      photoFilters.length,
      3,
      '250 pubkeys → 3 filters (100+100+50)'
    );
    assert.strictEqual(photoFilters[0].authors.length, 100);
    assert.strictEqual(photoFilters[1].authors.length, 100);
    assert.strictEqual(photoFilters[2].authors.length, 50);
  });

  test('loadActivityPhotos includes since in filter', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const contactPubkey = makePubkey(2);

    service.store.add(makeContactsEvent(userPubkey, [contactPubkey]));
    await service.loadProfile(userPubkey);

    const since = 12345;
    await service.loadActivityPhotos(since, 'home');

    const photoFilter = this.requestedFilters.find(
      (f) => f.kinds?.includes(360) && f.authors && f.since !== undefined
    );
    assert.ok(photoFilter, 'photo filter with since found');
    assert.strictEqual(photoFilter.since, since, 'since value matches');
    assert.deepEqual(photoFilter.kinds, [360], 'requests kind 360');
  });

  test('loadActivityPhotos re-triggers when contacts arrive', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const contactPubkey = makePubkey(2);

    // Call loadActivityPhotos before contacts are loaded
    await service.loadActivityPhotos(1000, 'home');

    const beforeCount = this.requestedFilters.filter(
      (f) => f.kinds?.includes(360) && f.authors && f.since !== undefined
    ).length;
    assert.strictEqual(beforeCount, 0, 'no request before contacts');

    // Now load contacts — the ContactsModel callback should re-trigger
    service.store.add(makeContactsEvent(userPubkey, [contactPubkey]));
    await service.loadProfile(userPubkey);

    // Give the callback a tick to propagate
    await new Promise((r) => setTimeout(r, 50));

    const afterCount = this.requestedFilters.filter(
      (f) => f.kinds?.includes(360) && f.authors && f.since !== undefined
    ).length;
    assert.ok(afterCount > 0, 'request made after contacts arrived');
  });

  test("loadActivityPhotos in 'explore' mode fetches all photos without authors filter", async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const since = 9999;
    await service.loadActivityPhotos(since, 'explore');

    // Should make a request immediately (no contacts dependency)
    const photoFilter = this.requestedFilters.find(
      (f) => f.kinds?.includes(360) && f.since !== undefined && !f.authors
    );
    assert.ok(photoFilter, 'photo filter without authors found');
    assert.strictEqual(photoFilter.since, since, 'since value matches');
    assert.deepEqual(photoFilter.kinds, [360], 'requests kind 360');
    assert.notOk(photoFilter.authors, 'no authors filter in explore mode');
  });

  test('_batchAuthorFilters produces correct batches', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkeys = Array.from({ length: 250 }, (_, i) => makePubkey(i));
    const filters = service._batchAuthorFilters(pubkeys, [360], 1000);

    assert.strictEqual(filters.length, 3, '250 → 3 filters');
    assert.strictEqual(filters[0].authors.length, 100);
    assert.strictEqual(filters[1].authors.length, 100);
    assert.strictEqual(filters[2].authors.length, 50);
    assert.deepEqual(filters[0].kinds, [360]);
    assert.strictEqual(filters[0].since, 1000);
    assert.notOk(filters[0].until, 'no until when not provided');
  });

  test('_batchAuthorFilters includes until when provided', function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const pubkeys = Array.from({ length: 5 }, (_, i) => makePubkey(i));
    const filters = service._batchAuthorFilters(pubkeys, [360], 1000, 2000);

    assert.strictEqual(filters.length, 1);
    assert.strictEqual(filters[0].since, 1000);
    assert.strictEqual(filters[0].until, 2000);
  });
});

module('Unit | Service | nostr-data | fetchActivityPhotos', function (hooks) {
  setupNostrDataService(hooks);

  test('fetchActivityPhotos in home mode returns events from network', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const contactPubkey = makePubkey(2);
    const photo = makePhotoEvent(contactPubkey, 'osm:node:100', {
      id: makeEventId(100),
    });

    service.store.add(makeContactsEvent(userPubkey, [contactPubkey]));
    await service.loadProfile(userPubkey);

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return of({
        type: 'EVENT',
        event: photo,
        from: 'wss://relay.example',
      });
    };

    const result = await service.fetchActivityPhotos(1000, undefined, 'home');
    const networkEvents = await result.networkEvents;

    assert.ok(
      networkEvents.some((e) => e.id === photo.id),
      'photo event from network returned'
    );
  });

  test('fetchActivityPhotos includes until in filters', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const contactPubkey = makePubkey(2);

    service.store.add(makeContactsEvent(userPubkey, [contactPubkey]));
    await service.loadProfile(userPubkey);

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return EMPTY;
    };

    await service.fetchActivityPhotos(1000, 2000, 'home');

    const photoFilter = this.requestedFilters.find(
      (f) => f.kinds?.includes(360) && f.authors
    );
    assert.ok(photoFilter, 'photo filter found');
    assert.strictEqual(photoFilter.since, 1000, 'since value matches');
    assert.strictEqual(photoFilter.until, 2000, 'until value matches');
  });

  test('fetchActivityPhotos in explore mode does not include authors filter', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return EMPTY;
    };

    await service.fetchActivityPhotos(9999, undefined, 'explore');

    const photoFilter = this.requestedFilters.find(
      (f) => f.kinds?.includes(360) && !f.authors
    );
    assert.ok(photoFilter, 'photo filter without authors found');
    assert.strictEqual(photoFilter.since, 9999);
    assert.notOk(photoFilter.until, 'no until when not provided');
  });

  test('fetchActivityPhotos in explore mode includes until', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return EMPTY;
    };

    await service.fetchActivityPhotos(1000, 2000, 'explore');

    const photoFilter = this.requestedFilters.find(
      (f) => f.kinds?.includes(360) && !f.authors
    );
    assert.ok(photoFilter, 'photo filter found');
    assert.strictEqual(photoFilter.since, 1000);
    assert.strictEqual(photoFilter.until, 2000);
  });

  test('fetchActivityPhotos returns empty array when no contacts in home mode', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.nostrRelay.pool.req = () => EMPTY;

    const result = await service.fetchActivityPhotos(1000, undefined, 'home');

    assert.strictEqual(
      result.cacheEvents.length,
      0,
      'empty cache events when no contacts'
    );
    const networkEvents = await result.networkEvents;
    assert.strictEqual(
      networkEvents.length,
      0,
      'empty network events when no contacts'
    );
  });

  test('fetchActivityPhotos deduplicates cache and network events', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    const userPubkey = makePubkey(1);
    const contactPubkey = makePubkey(2);
    const photo = makePhotoEvent(contactPubkey, 'osm:node:100', {
      id: makeEventId(100),
    });

    service.store.add(makeContactsEvent(userPubkey, [contactPubkey]));
    await service.loadProfile(userPubkey);

    // Add to IDB cache
    await service.cache.add(photo);

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return of({
        type: 'EVENT',
        event: photo,
        from: 'wss://relay.example',
      });
    };

    const result = await service.fetchActivityPhotos(1000, undefined, 'home');
    const networkEvents = await result.networkEvents;

    assert.strictEqual(
      result.cacheEvents.filter((e) => e.id === photo.id).length,
      1,
      'photo appears once in cache events'
    );
    assert.strictEqual(
      networkEvents.filter((e) => e.id === photo.id).length,
      0,
      'photo not in network events (deduplicated against cache)'
    );
  });

  test('fetchIncomingZaps includes since and until in filter', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return EMPTY;
    };

    await service.fetchIncomingZaps(makePubkey(1), 1000, 2000);

    const zapFilter = this.requestedFilters.find((f) =>
      f.kinds?.includes(9735)
    );
    assert.ok(zapFilter, 'zap filter found');
    assert.strictEqual(zapFilter.since, 1000, 'since value matches');
    assert.strictEqual(zapFilter.until, 2000, 'until value matches');
  });

  test('fetchIncomingZaps without since/until does not include them', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');

    service.nostrRelay.pool.req = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return EMPTY;
    };

    await service.fetchIncomingZaps(makePubkey(1));

    const zapFilter = this.requestedFilters.find((f) =>
      f.kinds?.includes(9735)
    );
    assert.ok(zapFilter, 'zap filter found');
    assert.notOk('since' in zapFilter, 'no since when not provided');
    assert.notOk('until' in zapFilter, 'no until when not provided');
  });
});

module('Unit | Service | nostr-data | zap receipts', function (hooks) {
  setupNostrDataService(hooks);

  test('_refreshZapReceiptSubscription batches >100 IDs into multiple filters', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const photoIds = Array.from({ length: 250 }, (_, i) =>
      makeEventId(1000 + i)
    );

    service._refreshZapReceiptSubscription(photoIds);

    const filters = this.requestedFilters.filter((f) =>
      f.kinds?.includes(9735)
    );
    assert.strictEqual(filters.length, 3, '250 IDs → 3 filters (100+100+50)');
    assert.strictEqual(filters[0]['#e'].length, 100);
    assert.strictEqual(filters[1]['#e'].length, 100);
    assert.strictEqual(filters[2]['#e'].length, 50);
  });

  test('_updateZapReceipts groups receipts by photo event id', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const photoA = makeEventId(2000);
    const photoB = makeEventId(2001);

    const receipt1 = makeZapReceiptEvent(makePubkey(70), [photoA], {
      id: makeEventId(2100),
    });
    const receipt2 = makeZapReceiptEvent(makePubkey(71), [photoA, photoB], {
      id: makeEventId(2101),
    });
    const receipt3 = makeZapReceiptEvent(makePubkey(72), [photoB], {
      id: makeEventId(2102),
    });

    service._updateZapReceipts([receipt1, receipt2, receipt3]);

    assert.strictEqual(
      service.zapReceipts[photoA].length,
      2,
      'photoA has 2 receipts'
    );
    assert.strictEqual(
      service.zapReceipts[photoB].length,
      2,
      'photoB has 2 receipts'
    );
    assert.deepEqual(
      service.zapReceipts[photoA].map((r) => r.id).sort(),
      [makeEventId(2100), makeEventId(2101)],
      'receipts for photoA match'
    );
  });
});

module('Unit | Service | nostr-data | profiles', function (hooks) {
  setupNostrDataService(hooks);

  function makeProfileEvent(pubkey, content, opts = {}) {
    return {
      id: opts.id || makeEventId(3000),
      pubkey,
      kind: 0,
      created_at: opts.created_at || 1000,
      tags: [],
      content: JSON.stringify(content),
      sig: 'sig',
    };
  }

  test('refreshProfiles requests kind 0 for the given pubkeys', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pubkey = makePubkey(80);

    await service.refreshProfiles([pubkey]);

    const filter = this.requestedFilters.find((f) => f.kinds?.includes(0));
    assert.ok(filter, 'requested kind 0');
    assert.deepEqual(filter.authors, [pubkey], 'requested the pubkey');
  });

  test('refreshProfiles adds returned profiles to the store', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pubkey = makePubkey(81);
    const event = makeProfileEvent(pubkey, { name: 'Alice' });

    service.nostrRelay.pool.request = (_relays, filters) => {
      this.requestedFilters.push(...filters);
      return of(event);
    };

    await service.refreshProfiles([pubkey]);

    assert.true(service.store.hasReplaceable(0, pubkey), 'profile stored');
  });

  test('refreshProfiles deduplicates input and skips empty input', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pubkey = makePubkey(82);

    await service.refreshProfiles([pubkey, pubkey, null]);
    await service.refreshProfiles([]);

    const filters = this.requestedFilters.filter((f) => f.kinds?.includes(0));
    assert.strictEqual(filters.length, 1, 'one request for deduped input');
    assert.deepEqual(filters[0].authors, [pubkey], 'deduped authors');
  });

  test('loadProfiles re-requests an unresolved profile on a second call', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    const pubkey = makePubkey(83);

    // First call: the ProfileModel loader handles it, no explicit refresh.
    service.loadProfiles([pubkey]);
    assert.strictEqual(
      this.requestedFilters.filter((f) => f.kinds?.includes(0)).length,
      0,
      'first lookup is not refreshed explicitly'
    );

    // Re-entering the place clears the model subscriptions, but the ProfileModel
    // stays cached and its loader won't run again. The second call should retry.
    service._clearProfileSubs();
    service.loadProfiles([pubkey]);

    const filters = this.requestedFilters.filter((f) => f.kinds?.includes(0));
    assert.strictEqual(
      filters.length,
      1,
      'second lookup refreshes the profile'
    );
    assert.deepEqual(
      filters[0].authors,
      [pubkey],
      'refreshes the missing pubkey'
    );
  });
});
