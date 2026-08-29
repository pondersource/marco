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
    created_at: 5000,
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

  getProfile(pubkey) {
    return this.profiles[pubkey];
  }

  async loadIncomingZaps() {}
}

module('Unit | Service | activity', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:nostrData', MockNostrDataService);
  });

  test('_updateItems parses receipts and enriches with photos from the store', function (assert) {
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

    service._updateItems([receipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 1);
    assert.strictEqual(service.items[0].type, 'zap');
    assert.strictEqual(service.items[0].senderPubkey, SENDER_PUBKEY);
    assert.strictEqual(service.items[0].amountSats, 2000);
    assert.strictEqual(service.items[0].message, 'Love it!');
    assert.strictEqual(service.items[0].placeIdentifier, 'osm:node:42');
    assert.ok(service.items[0].photo, 'photo is populated');
  });

  test('_updateItems filters out zaps for non-photo events', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.store.add({
      id: TEXT_EVENT_ID,
      pubkey: USER_PUBKEY,
      kind: 1,
      created_at: 5000,
      tags: [],
    });

    const receipt = makeZapReceiptEvent({ zappedEventId: TEXT_EVENT_ID });

    service._updateItems([receipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 0, 'non-photo zap filtered out');
  });

  test('_updateItems filters out zaps for photos not authored by the user', function (assert) {
    const service = this.owner.lookup('service:activity');
    const otherUserPhoto = makePhotoEvent({
      id: PHOTO_EVENT_ID_OTHER,
      author: 'z'.repeat(64),
    });
    service.nostrData.store.add(otherUserPhoto);

    const receipt = makeZapReceiptEvent({
      zappedEventId: PHOTO_EVENT_ID_OTHER,
    });

    service._updateItems([receipt], USER_PUBKEY);

    assert.strictEqual(
      service.items.length,
      0,
      "zap for someone else's photo filtered out"
    );
  });

  test('_updateItems filters out zaps not directed at the user', function (assert) {
    const service = this.owner.lookup('service:activity');
    const photoEvent = makePhotoEvent({ id: PHOTO_EVENT_ID_1 });
    service.nostrData.store.add(photoEvent);

    const receipt = makeZapReceiptEvent({
      recipient: 'c'.repeat(64),
      zappedEventId: PHOTO_EVENT_ID_1,
    });

    service._updateItems([receipt], USER_PUBKEY);

    assert.strictEqual(
      service.items.length,
      0,
      'zap directed at someone else filtered out'
    );
  });

  test('_updateItems sorts entries newest-first', function (assert) {
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

    service._updateItems([oldReceipt, newReceipt], USER_PUBKEY);

    assert.strictEqual(service.items.length, 2);
    assert.strictEqual(service.items[0].createdAt, 9000, 'newest first');
    assert.strictEqual(service.items[1].createdAt, 1000, 'oldest second');
  });

  test('stop clears items and resets state', function (assert) {
    const service = this.owner.lookup('service:activity');
    service.nostrData.store.add(makePhotoEvent({ id: PHOTO_EVENT_ID_1 }));
    service._updateItems(
      [makeZapReceiptEvent({ zappedEventId: PHOTO_EVENT_ID_1 })],
      USER_PUBKEY
    );

    assert.strictEqual(service.items.length, 1);

    service.stop();

    assert.strictEqual(service.items.length, 0, 'items cleared');
    assert.strictEqual(service._userPubkey, null);
  });

  test('load with no pubkey clears items', async function (assert) {
    const service = this.owner.lookup('service:activity');
    service.items = [{ fake: true }];

    await service.load(null);

    assert.strictEqual(service.items.length, 0);
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
});
