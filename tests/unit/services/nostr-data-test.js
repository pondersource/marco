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
});
