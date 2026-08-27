import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import { Subject, EMPTY } from 'rxjs';
import Service from '@ember/service';
import NostrDataService from 'marco/services/nostr-data';

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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module('Unit | Service | nostr-data | contacts', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.requestedFilters = [];
    const requestedFilters = this.requestedFilters;

    class StubNostrRelayService extends Service {
      pool = {
        relays$: new Subject(),
        request: (_relays, filters) => {
          requestedFilters.push(...filters);
          return EMPTY;
        },
        req: () => EMPTY,
        publish: () => Promise.resolve([{ ok: true }]),
      };
    }

    this.owner.register('service:nostrRelay', StubNostrRelayService);
    this.owner.register('service:nostrData', NostrDataService);
  });

  hooks.afterEach(async function () {
    // Clear the real IDB cache between tests to prevent cross-test contamination
    const service = this.owner.lookup('service:nostr-data');
    await service.clearCache();
  });

  test('loadProfile populates contacts from store via ContactsModel', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;

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
    service.store.verifyEvent = undefined;

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

    // Give the subscription a tick to propagate
    await new Promise((r) => setTimeout(r, 50));

    assert.deepEqual(
      service.contacts,
      [],
      'contacts remains empty — old subscription was torn down'
    );
  });

  test('loadProfile network request includes kind 3', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;

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

  test('kind 3 events are persisted to IDB cache', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;

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

  test('isTrustedEvent trusts content from followed contacts', async function (assert) {
    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;

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
    service.store.verifyEvent = undefined;

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
    service.store.verifyEvent = undefined;

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
    service.store.verifyEvent = undefined;

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
    service.store.verifyEvent = undefined;

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
});

module('Unit | Service | nostr-data | relays and trust', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    const requestedFilters = [];
    const reqMessages = new Subject();

    class StubNostrRelayService extends Service {
      pool = {
        relays$: new Subject(),
        request: (_relays, filters) => {
          requestedFilters.push(...filters);
          return EMPTY;
        },
        req: () => reqMessages,
        publish: () => Promise.resolve([{ ok: true }]),
      };
    }

    this.owner.register('service:nostrRelay', StubNostrRelayService);
    this.owner.register('service:nostrData', NostrDataService);

    this.requestedFilters = requestedFilters;
    this.reqMessages = reqMessages;

    const service = this.owner.lookup('service:nostr-data');
    service.store.verifyEvent = undefined;
  });

  hooks.afterEach(async function () {
    const service = this.owner.lookup('service:nostr-data');
    await service.clearCache();
    await service.localForage.clear('event-relay-provenance');
  });

  // ─── Relay getters ─────────────────────────────────────────────────────────

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

  // ─── Provenance ────────────────────────────────────────────────────────────

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

  // ─── partitionByTrust ──────────────────────────────────────────────────────

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
