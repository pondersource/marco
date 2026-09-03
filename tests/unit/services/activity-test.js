import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { parseZapReceipt } from 'marco/utils/activity';
import {
  setVerifyWrappedEventMethod,
  fakeVerifyEvent,
} from 'applesauce-core/helpers/event';

setVerifyWrappedEventMethod(fakeVerifyEvent);

class MockPlaceNameResolver extends Service {
  resolveBookmark() {
    return null;
  }
  resolveInBackground() {
    return new Promise(() => {});
  }
  reset() {}
}

const USER_PUBKEY = 'a'.repeat(64);
const SENDER_PUBKEY = 'b'.repeat(64);

const PHOTO_EVENT_ID_1 = '1'.repeat(64);
const PHOTO_EVENT_ID_2 = '2'.repeat(64);
const PHOTO_EVENT_ID_OTHER = '3'.repeat(64);
const TEXT_EVENT_ID = '4'.repeat(64);
const RECEIPT_ID_1 = '5'.repeat(64);
const RECEIPT_ID_2 = '6'.repeat(64);
const ZAP_REQ_ID = '7'.repeat(64);

const BOLT11_INVOICE =
  'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567';

function makeZapReceiptEvent(opts = {}) {
  const recipient = opts.recipient || USER_PUBKEY;
  const sender = opts.sender || SENDER_PUBKEY;
  const zappedEventId = opts.zappedEventId || PHOTO_EVENT_ID_1;

  const description = JSON.stringify({
    kind: 9734,
    pubkey: sender,
    content: opts.message || '',
    id: ZAP_REQ_ID,
    created_at: 10000,
    sig: 'fake',
    tags: [
      ['p', recipient],
      ['relays', ['wss://relay.example.com']],
    ],
  });

  return {
    id: opts.id || RECEIPT_ID_1,
    kind: 9735,
    pubkey: 'zap-service-pubkey',
    created_at: opts.created_at || 10000,
    tags: [
      ['p', recipient],
      ['P', sender],
      ['e', zappedEventId],
      ['bolt11', BOLT11_INVOICE],
      ['description', description],
    ],
    content: '',
    sig: 'sig',
  };
}

function makePhotoEvent(opts = {}) {
  return {
    id: opts.id || PHOTO_EVENT_ID_1,
    pubkey: opts.author || USER_PUBKEY,
    kind: 360,
    created_at: opts.created_at || 5000,
    tags: [
      ['i', opts.placeIdentifier || 'osm:node:123'],
      ['imeta', `url ${opts.url || 'https://x.com/photo.jpg'}`, 'dim 800x600'],
    ],
    content: '',
    sig: 'sig',
  };
}

class MockNostrDataService extends Service {
  @tracked profiles = {};
  _contactPubkeys = new Set();

  store = {
    events: new Map(),
    add(event) {
      this.events.set(event.id, event);
    },
    getEvent(id) {
      return this.events.get(id);
    },
    getReplaceable(kind, pubkey) {
      // Find a replaceable event (kind 0 profile) by pubkey
      for (const event of this.events.values()) {
        if (event.kind === kind && event.pubkey === pubkey) {
          return event;
        }
      }
      return undefined;
    },
    timeline() {
      return {
        subscribe(callback) {
          callback([]);
          return { unsubscribe() {} };
        },
      };
    },
    model() {
      return {
        subscribe() {
          return { unsubscribe() {} };
        },
      };
    },
  };

  loadProfiles() {}
  loadActivityPhotos() {}
  loadMyContributions() {}
  loadProfile() {}
  whenContactsLoaded() {
    return Promise.resolve();
  }

  async fetchActivityPhotos() {
    return { cacheEvents: [], networkEvents: Promise.resolve([]) };
  }

  async fetchIncomingZaps() {
    return { cacheEvents: [], networkEvents: Promise.resolve([]) };
  }

  getProfile(pubkey) {
    return this.profiles[pubkey];
  }

  async loadIncomingZaps() {}
}

module('Unit | Service | activity', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:nostrData', MockNostrDataService);
    this.owner.register('service:placeNameResolver', MockPlaceNameResolver);
  });

  test('_updateZapItems parses receipts and enriches with photos from the store', function (assert) {
    const service = this.owner.lookup('service:activity');
    const photoEvent = makePhotoEvent({
      id: PHOTO_EVENT_ID_1,
      placeIdentifier: 'osm:node:42',
    });
    service.nostrData.store.add(photoEvent);

    const receipt = makeZapReceiptEvent({
      zappedEventId: PHOTO_EVENT_ID_1,
      message: 'Love it!',
    });

    service._updateZapItems([receipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 1);
    assert.strictEqual(service.items[0].type, 'zap');
    assert.strictEqual(service.items[0].senderPubkey, SENDER_PUBKEY);
    assert.strictEqual(service.items[0].amountSats, 2000);
    assert.strictEqual(service.items[0].message, 'Love it!');
    assert.strictEqual(service.items[0].placeIdentifier, 'osm:node:42');
    assert.ok(service.items[0].photo, 'photo is populated');
  });

  test('_updateZapItems filters out zaps for non-photo events', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.store.add({
      id: TEXT_EVENT_ID,
      pubkey: USER_PUBKEY,
      kind: 1,
      created_at: 5000,
      tags: [],
    });

    const receipt = makeZapReceiptEvent({ zappedEventId: TEXT_EVENT_ID });

    service._updateZapItems([receipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 0, 'non-photo zap filtered out');
  });

  test('_updateZapItems filters out zaps for photos not authored by the user', function (assert) {
    const service = this.owner.lookup('service:activity');
    const otherUserPhoto = makePhotoEvent({
      id: PHOTO_EVENT_ID_OTHER,
      author: 'z'.repeat(64),
    });
    service.nostrData.store.add(otherUserPhoto);

    const receipt = makeZapReceiptEvent({
      zappedEventId: PHOTO_EVENT_ID_OTHER,
    });

    service._updateZapItems([receipt], USER_PUBKEY);

    assert.strictEqual(
      service.items.length,
      0,
      "zap for someone else's photo filtered out"
    );
  });

  test('_updateZapItems filters out zaps not directed at the user', function (assert) {
    const service = this.owner.lookup('service:activity');
    const photoEvent = makePhotoEvent({ id: PHOTO_EVENT_ID_1 });
    service.nostrData.store.add(photoEvent);

    const receipt = makeZapReceiptEvent({
      recipient: 'c'.repeat(64),
      zappedEventId: PHOTO_EVENT_ID_1,
    });

    service._updateZapItems([receipt], USER_PUBKEY);

    assert.strictEqual(
      service.items.length,
      0,
      'zap directed at someone else filtered out'
    );
  });

  test('_updateZapItems sorts entries newest-first', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.store.add(makePhotoEvent({ id: PHOTO_EVENT_ID_1 }));
    service.nostrData.store.add(makePhotoEvent({ id: PHOTO_EVENT_ID_2 }));

    const oldReceipt = makeZapReceiptEvent({
      id: RECEIPT_ID_1,
      zappedEventId: PHOTO_EVENT_ID_1,
      created_at: 1000,
    });
    const newReceipt = makeZapReceiptEvent({
      id: RECEIPT_ID_2,
      zappedEventId: PHOTO_EVENT_ID_2,
      created_at: 9000,
    });

    service._updateZapItems([oldReceipt, newReceipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 2);
    assert.strictEqual(service.items[0].createdAt, 9000, 'newest first');
    assert.strictEqual(service.items[1].createdAt, 1000, 'oldest second');
  });

  test('stop clears items and resets state', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.store.add(makePhotoEvent({ id: PHOTO_EVENT_ID_1 }));
    service._updateZapItems(
      [makeZapReceiptEvent({ zappedEventId: PHOTO_EVENT_ID_1 })],
      USER_PUBKEY
    );

    assert.strictEqual(service.items.length, 1);

    service.stop();

    assert.strictEqual(service.items.length, 0, 'items cleared');
    assert.strictEqual(service._userPubkey, null);
  });

  test('load with no pubkey preserves existing items', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service.items = [{ fake: true }];

    await service.load(null);

    assert.strictEqual(
      service.items.length,
      1,
      'items preserved when already loaded'
    );
  });

  test('_resolveSender applies profile when available', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.profiles[SENDER_PUBKEY] = {
      name: 'Alice',
      picture: 'https://x.com/avatar.jpg',
    };

    const entry = parseZapReceipt(makeZapReceiptEvent(), USER_PUBKEY);
    service._resolveSender(entry);

    assert.strictEqual(entry.senderName, 'Alice');
    assert.strictEqual(entry.senderAvatar, 'https://x.com/avatar.jpg');
    assert.false(entry.senderProfileLoading);
  });

  test('_updateSocialItems groups photos by author + place', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const photo1 = makePhotoEvent({
      id: 'p1'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: 1000,
    });
    const photo2 = makePhotoEvent({
      id: 'p2'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: 2000,
    });

    service._updateSocialItems([photo1, photo2]);

    assert.strictEqual(
      service.items.length,
      1,
      'one entry for same author + place'
    );
    assert.strictEqual(service.items[0].type, 'photo');
    assert.strictEqual(service.items[0].photos.length, 2);
    assert.strictEqual(service.items[0].senderPubkey, SENDER_PUBKEY);
  });

  test('_matchesSourceMode filters by contact pubkeys in home mode', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._sourceMode = 'home';
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const followedPhoto = makePhotoEvent({ author: SENDER_PUBKEY });
    const unfollowedPhoto = makePhotoEvent({ author: 'z'.repeat(64) });
    const ownPhoto = makePhotoEvent({ author: USER_PUBKEY });

    assert.true(
      service._matchesSourceMode(followedPhoto),
      'followed contact passes'
    );
    assert.false(
      service._matchesSourceMode(unfollowedPhoto),
      'unfollowed pubkey rejected'
    );
    assert.false(service._matchesSourceMode(ownPhoto), 'own photo excluded');
  });

  test('_matchesSourceMode in explore mode includes trusted strangers, excludes own photos and followees', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._sourceMode = 'explore';
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const STRANGER_PUBKEY = 'c'.repeat(64);

    // Mock isTrustedEvent to return true for SENDER_PUBKEY and STRANGER_PUBKEY
    service.nostrData.isTrustedEvent = (event) =>
      event.pubkey === SENDER_PUBKEY || event.pubkey === STRANGER_PUBKEY;

    const trustedStrangerPhoto = makePhotoEvent({ author: STRANGER_PUBKEY });
    const trustedFolloweePhoto = makePhotoEvent({ author: SENDER_PUBKEY });
    const untrustedPhoto = makePhotoEvent({ author: 'z'.repeat(64) });
    const ownPhoto = makePhotoEvent({ author: USER_PUBKEY });

    assert.true(
      service._matchesSourceMode(trustedStrangerPhoto),
      'trusted stranger passes in explore mode'
    );
    assert.false(
      service._matchesSourceMode(trustedFolloweePhoto),
      'trusted followee excluded in explore mode'
    );
    assert.false(
      service._matchesSourceMode(untrustedPhoto),
      'untrusted event rejected in explore mode'
    );
    assert.false(
      service._matchesSourceMode(ownPhoto),
      'own photo excluded in explore mode'
    );
  });

  test('_matchesSourceMode in explore mode with no pubkey includes all trusted events', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = null;
    service._sourceMode = 'explore';
    service.nostrData._contactPubkeys = null;

    const STRANGER_PUBKEY = 'c'.repeat(64);

    service.nostrData.isTrustedEvent = (event) =>
      event.pubkey === SENDER_PUBKEY || event.pubkey === STRANGER_PUBKEY;

    const trustedPhoto = makePhotoEvent({ author: SENDER_PUBKEY });
    const trustedStrangerPhoto = makePhotoEvent({ author: STRANGER_PUBKEY });
    const untrustedPhoto = makePhotoEvent({ author: 'z'.repeat(64) });

    assert.true(
      service._matchesSourceMode(trustedPhoto),
      'trusted event passes with no pubkey'
    );
    assert.true(
      service._matchesSourceMode(trustedStrangerPhoto),
      'trusted stranger passes with no pubkey'
    );
    assert.false(
      service._matchesSourceMode(untrustedPhoto),
      'untrusted event rejected with no pubkey'
    );
  });

  test('_updateSocialItems merges with zap items sorted by createdAt', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    // Seed a zap item
    service.nostrData.store.add(
      makePhotoEvent({ id: PHOTO_EVENT_ID_1, placeIdentifier: 'osm:node:50' })
    );
    service._updateZapItems(
      [
        makeZapReceiptEvent({
          zappedEventId: PHOTO_EVENT_ID_1,
          created_at: 5000,
        }),
      ],
      USER_PUBKEY
    );

    // Add a social photo that is newer
    const socialPhoto = makePhotoEvent({
      id: 'sp1'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: 9000,
    });
    service._updateSocialItems([socialPhoto]);

    assert.strictEqual(service.items.length, 2);
    assert.strictEqual(
      service.items[0].createdAt,
      9000,
      'newer social photo first'
    );
    assert.strictEqual(service.items[1].createdAt, 5000, 'older zap second');
  });

  test('explore mode excludes zap items from merged results', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._sourceMode = 'explore';
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    // Seed a zap item
    service.nostrData.store.add(
      makePhotoEvent({ id: PHOTO_EVENT_ID_1, placeIdentifier: 'osm:node:50' })
    );
    service._updateZapItems(
      [
        makeZapReceiptEvent({
          zappedEventId: PHOTO_EVENT_ID_1,
          created_at: 5000,
        }),
      ],
      USER_PUBKEY
    );

    // Add a trusted stranger social photo
    const STRANGER_PUBKEY = 'c'.repeat(64);
    service.nostrData.isTrustedEvent = (event) =>
      event.pubkey === STRANGER_PUBKEY;

    const socialPhoto = makePhotoEvent({
      id: 'sp1'.padEnd(64, '0'),
      author: STRANGER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: 9000,
    });
    service._updateSocialItems([socialPhoto]);

    assert.strictEqual(
      service.items.length,
      1,
      'zap excluded in explore mode, only social photo shown'
    );
    assert.strictEqual(
      service.items[0].createdAt,
      9000,
      'only the social photo is present'
    );
  });

  test('setSourceMode resets and re-filters with fresh 30-day window', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._sourceMode = 'explore';
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);
    service.nostrData.isTrustedEvent = () => false;

    const followedPhoto = makePhotoEvent({
      id: 'fp1'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: 1000,
    });

    service.nostrData.fetchActivityPhotos = async (_since, _until, mode) => {
      if (mode === 'home')
        return {
          cacheEvents: [followedPhoto],
          networkEvents: Promise.resolve([]),
        };
      return { cacheEvents: [], networkEvents: Promise.resolve([]) };
    };

    service._updateSocialItems([followedPhoto]);
    assert.strictEqual(service.items.length, 0, 'no items in explore mode');

    await service.setSourceMode('home');

    assert.strictEqual(service._sourceMode, 'home', 'mode switched');
    assert.ok(
      service.items.length > 0,
      'items loaded after switching to home mode'
    );
  });

  test('stop clears social items and resets state', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const photo = makePhotoEvent({
      id: 'sp2'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
    });
    service._updateSocialItems([photo]);

    assert.strictEqual(service.items.length, 1);

    service.stop();

    assert.strictEqual(service.items.length, 0, 'items cleared');
    assert.strictEqual(service._socialItems.length, 0, 'social items cleared');
    assert.strictEqual(service._zapItems.length, 0, 'zap items cleared');
  });

  test('loadMore fetches older events with until set to old since', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const NOW = Math.floor(Date.now() / 1000);
    service._since = NOW;

    const recentPhoto = makePhotoEvent({
      id: 'r1'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: NOW - 100,
    });
    service._updateSocialItems([recentPhoto]);
    assert.ok(service.items.length > 0, 'has initial items');

    const oldPhoto = makePhotoEvent({
      id: 'old1'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:200',
      created_at: NOW - 5000,
    });
    service.nostrData.fetchActivityPhotos = async (since, until) => {
      assert.strictEqual(since, NOW - 30 * 24 * 60 * 60, 'since extended');
      assert.strictEqual(until, NOW, 'until set to old since');
      return {
        cacheEvents: [oldPhoto],
        networkEvents: Promise.resolve([]),
      };
    };

    await service.loadMore();

    assert.strictEqual(
      service._since,
      NOW - 30 * 24 * 60 * 60,
      '_since extended'
    );
    assert.false(service.isLoadingMore, 'isLoadingMore reset');
    assert.false(service._isLoadingMore, '_isLoadingMore reset');
    assert.ok(
      service.items.length >= 2,
      'new items appended without re-processing'
    );
  });

  test('loadMore fetches zaps alongside photos in home mode', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._sourceMode = 'home';
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const NOW = Math.floor(Date.now() / 1000);
    service._since = NOW;

    // Seed initial photo so loadMore doesn't bail
    const recentPhoto = makePhotoEvent({
      id: 'r5'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: NOW - 100,
    });
    service._updateSocialItems([recentPhoto]);

    // Also seed a photo for the zap to reference
    const zapPhoto = makePhotoEvent({
      id: PHOTO_EVENT_ID_1,
      author: USER_PUBKEY,
      placeIdentifier: 'osm:node:50',
      created_at: NOW - 200,
    });
    service.nostrData.store.add(zapPhoto);

    const oldZapReceipt = makeZapReceiptEvent({
      zappedEventId: PHOTO_EVENT_ID_1,
      created_at: NOW - 5000,
    });

    let zapCallCount = 0;
    service.nostrData.fetchActivityPhotos = async () => ({
      cacheEvents: [],
      networkEvents: Promise.resolve([]),
    });
    service.nostrData.fetchIncomingZaps = async (_pubkey, since, until) => {
      zapCallCount++;
      assert.strictEqual(since, NOW - 30 * 24 * 60 * 60, 'zap since matches');
      assert.strictEqual(until, NOW, 'zap until matches');
      return {
        cacheEvents: [oldZapReceipt],
        networkEvents: Promise.resolve([]),
      };
    };

    await service.loadMore();

    assert.strictEqual(zapCallCount, 1, 'fetchIncomingZaps called once');
    assert.ok(service.items.length >= 2, 'zap and photo items both present');
  });

  test('loadMore exponentially expands window on empty results', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const NOW = Math.floor(Date.now() / 1000);
    service._since = NOW;

    const recentPhoto = makePhotoEvent({
      id: 'r2'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: NOW - 100,
    });
    service._updateSocialItems([recentPhoto]);

    const callArgs = [];
    let callCount = 0;
    service.nostrData.fetchActivityPhotos = async (since, until) => {
      callArgs.push({ since, until });
      callCount++;
      if (callCount < 2)
        return { cacheEvents: [], networkEvents: Promise.resolve([]) };
      return {
        cacheEvents: [
          makePhotoEvent({
            id: 'old2'.padEnd(64, '0'),
            author: SENDER_PUBKEY,
            placeIdentifier: 'osm:node:300',
            created_at: NOW - 100000,
          }),
        ],
        networkEvents: Promise.resolve([]),
      };
    };

    await service.loadMore();

    assert.strictEqual(callCount, 2, 'retried with expanding window');
    assert.strictEqual(callArgs[0].since, NOW - 30 * 24 * 60 * 60);
    assert.strictEqual(
      callArgs[1].since,
      NOW - 30 * 24 * 60 * 60 - 60 * 24 * 60 * 60
    );
    assert.ok(service.items.length >= 2, 'events from 2nd call appended');
  });

  test('loadMore stops at MIN_SINCE floor with clamped final fetch', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const MIN_SINCE = Math.floor(new Date('2026-04-20').getTime() / 1000);
    service._since = MIN_SINCE + 60 * 24 * 60 * 60;

    const recentPhoto = makePhotoEvent({
      id: 'r3'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: service._since - 100,
    });
    service._updateSocialItems([recentPhoto]);

    let callCount = 0;
    service.nostrData.fetchActivityPhotos = async () => {
      callCount++;
      return { cacheEvents: [], networkEvents: Promise.resolve([]) };
    };

    await service.loadMore();

    // First 30-day window: batchSince = MIN_SINCE + 30d (>= MIN_SINCE, executes)
    // Second 60-day window: batchSince = MIN_SINCE - 30d (< MIN_SINCE, clamped to MIN_SINCE for final fetch)
    assert.strictEqual(callCount, 2, 'one normal + one clamped final fetch');
    assert.false(service.isLoadingMore, 'isLoadingMore reset after exhaustion');
  });

  test('loadMore guard prevents concurrent calls', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service.nostrData._contactPubkeys = new Set([SENDER_PUBKEY]);

    const NOW = Math.floor(Date.now() / 1000);
    service._since = NOW;

    const recentPhoto = makePhotoEvent({
      id: 'r4'.padEnd(64, '0'),
      author: SENDER_PUBKEY,
      placeIdentifier: 'osm:node:100',
      created_at: NOW - 100,
    });
    service._updateSocialItems([recentPhoto]);

    let callCount = 0;
    service.nostrData.fetchActivityPhotos = async () => {
      callCount++;
      return {
        cacheEvents: [
          makePhotoEvent({
            id: 'old3'.padEnd(64, '0'),
            author: SENDER_PUBKEY,
            placeIdentifier: 'osm:node:200',
            created_at: NOW - 5000,
          }),
        ],
        networkEvents: Promise.resolve([]),
      };
    };

    const promise1 = service.loadMore();
    await service.loadMore();
    await promise1;

    assert.strictEqual(callCount, 1, 'only one loadMore sequence');
  });

  test('loadMore does nothing when no items', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service._userPubkey = USER_PUBKEY;
    service._since = Math.floor(Date.now() / 1000);
    service.items = [];

    let called = false;
    service.nostrData.fetchActivityPhotos = async () => {
      called = true;
      return { cacheEvents: [], networkEvents: Promise.resolve([]) };
    };

    await service.loadMore();

    assert.false(called, 'no fetch when items is empty');
  });

  test('stop resets isLoadingMore and isLoading', function (assert) {
    const service = this.owner.lookup('service:activity');
    service._isLoadingMore = true;
    service.isLoadingMore = true;
    service.isLoading = true;

    service.stop();

    assert.false(service.isLoadingMore, 'isLoadingMore reset');
    assert.false(service._isLoadingMore, '_isLoadingMore reset');
    assert.false(service.isLoading, 'isLoading reset');
  });
});
