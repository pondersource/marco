import { module, test } from 'qunit';
import {
  ActivityEntry,
  parseZapReceipt,
  enrichWithPhoto,
} from 'marco/utils/activity';
import {
  setVerifyWrappedEventMethod,
  fakeVerifyEvent,
} from 'applesauce-core/helpers/event';

setVerifyWrappedEventMethod(fakeVerifyEvent);

const USER_PUBKEY = 'a'.repeat(64);
const SENDER_PUBKEY = 'b'.repeat(64);

const PHOTO_EVENT_ID = '1'.repeat(64);
const RECEIPT_ID = '2'.repeat(64);
const ZAP_REQ_ID_1 = '3'.repeat(64);
const ZAP_REQ_ID_2 = '4'.repeat(64);
const PHOTO_XYZ_ID = '5'.repeat(64);
const OTHER_EVENT_ID = '6'.repeat(64);

const BOLT11_INVOICE =
  'lnbc20u1p3y0x3hpp5743k2g0fsqqxj7n8qzuhns5gmkk4djeejk3wkp64ppevgekvc0jsdqcve5kzar2v9nr5gpqd4hkuetesp5ez2g297jduwc20t6lmqlsg3man0vf2jfd8ar9fh8fhn2g8yttfkqxqy9gcqcqzys9qrsgqrzjqtx3k77yrrav9hye7zar2rtqlfkytl094dsp0ms5majzth6gt7ca6uhdkxl983uywgqqqqlgqqqvx5qqjqrzjqd98kxkpyw0l9tyy8r8q57k7zpy9zjmh6sez752wj6gcumqnj3yxzhdsmg6qq56utgqqqqqqqqqqqeqqjq7jd56882gtxhrjm03c93aacyfy306m4fq0tskf83c0nmet8zc2lxyyg3saz8x6vwcp26xnrlagf9semau3qm2glysp7sv95693fphvsp54l567';

function makeZapReceiptEvent(opts = {}) {
  const recipient = opts.recipient || USER_PUBKEY;
  const sender = opts.sender || SENDER_PUBKEY;
  const zappedEventId = opts.zappedEventId || PHOTO_EVENT_ID;

  const description = JSON.stringify({
    kind: 9734,
    pubkey: sender,
    content: opts.message || '',
    id: ZAP_REQ_ID_1,
    created_at: 10000,
    sig: 'fake',
    tags: [
      ['p', recipient],
      ['relays', ['wss://relay.example.com']],
    ],
  });

  return {
    id: opts.id || RECEIPT_ID,
    kind: 9735,
    pubkey: opts.receiptAuthor || 'zap-service-pubkey',
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
    id: opts.id || PHOTO_EVENT_ID,
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

module('Unit | Utility | activity', function () {
  test('ActivityEntry has type "zap" and tracked sender fields', function (assert) {
    const entry = new ActivityEntry({
      photoEventId: '1'.repeat(64),
      photo: null,
      placeIdentifier: 'osm:node:1',
      senderPubkey: SENDER_PUBKEY,
      amountSats: 21,
      message: 'Nice!',
      createdAt: 10000,
    });

    assert.strictEqual(entry.type, 'zap');
    assert.strictEqual(entry.senderPubkey, SENDER_PUBKEY);
    assert.strictEqual(entry.amountSats, 21);
    assert.strictEqual(entry.message, 'Nice!');
    assert.true(entry.senderProfileLoading, 'senderProfileLoading starts true');
  });

  test('parseZapReceipt extracts sender, amount, and zapped event id', function (assert) {
    const receipt = makeZapReceiptEvent({ message: 'Great photo!' });
    const entry = parseZapReceipt(receipt, USER_PUBKEY);

    assert.ok(entry, 'returns an entry');
    assert.strictEqual(entry.senderPubkey, SENDER_PUBKEY);
    assert.strictEqual(entry.photoEventId, PHOTO_EVENT_ID);
    assert.strictEqual(entry.amountSats, 2000, '2000000 msat → 2000 sats');
    assert.strictEqual(entry.message, 'Great photo!');
    assert.strictEqual(entry.createdAt, 10000);
  });

  test('parseZapReceipt returns null when recipient is not the user', function (assert) {
    const receipt = makeZapReceiptEvent({
      recipient: 'c'.repeat(64),
    });
    const entry = parseZapReceipt(receipt, USER_PUBKEY);
    assert.notOk(entry, 'not directed at the user');
  });

  test('parseZapReceipt returns null for wrong kind', function (assert) {
    const receipt = makeZapReceiptEvent();
    receipt.kind = 1;
    const entry = parseZapReceipt(receipt, USER_PUBKEY);
    assert.notOk(entry);
  });

  test('parseZapReceipt returns null when no event pointer', function (assert) {
    const receipt = makeZapReceiptEvent();
    receipt.tags = receipt.tags.filter((t) => t[0] !== 'e');
    const entry = parseZapReceipt(receipt, USER_PUBKEY);
    assert.notOk(entry);
  });

  test('parseZapReceipt handles null message', function (assert) {
    const description = JSON.stringify({
      kind: 9734,
      pubkey: SENDER_PUBKEY,
      content: '',
      id: ZAP_REQ_ID_2,
      created_at: 10000,
      sig: 'fake',
      tags: [
        ['p', USER_PUBKEY],
        ['relays', ['wss://relay.example.com']],
      ],
    });
    const receipt = makeZapReceiptEvent({ description });
    const entry = parseZapReceipt(receipt, USER_PUBKEY);

    assert.ok(entry);
    assert.strictEqual(entry.message, null, 'empty content → null message');
  });

  test('enrichWithPhoto populates photo and placeIdentifier from the store', function (assert) {
    const photoEvent = makePhotoEvent({
      id: PHOTO_XYZ_ID,
      placeIdentifier: 'osm:way:456',
    });
    const mockStore = {
      getEvent: (id) => (id === PHOTO_XYZ_ID ? photoEvent : undefined),
    };

    const entry = parseZapReceipt(
      makeZapReceiptEvent({ zappedEventId: PHOTO_XYZ_ID }),
      USER_PUBKEY
    );

    const result = enrichWithPhoto(entry, mockStore, USER_PUBKEY);

    assert.true(result, 'enrichment succeeded');
    assert.ok(entry.photo, 'photo is populated');
    assert.strictEqual(
      entry.placeIdentifier,
      'osm:way:456',
      'placeIdentifier extracted from photo'
    );
    assert.strictEqual(entry.photo.url, 'https://x.com/photo.jpg');
  });

  test('enrichWithPhoto returns false when zapped event is not a kind 360', function (assert) {
    const nonPhotoEvent = { id: OTHER_EVENT_ID, pubkey: USER_PUBKEY, kind: 1 };
    const mockStore = { getEvent: () => nonPhotoEvent };

    const entry = parseZapReceipt(
      makeZapReceiptEvent({ zappedEventId: OTHER_EVENT_ID }),
      USER_PUBKEY
    );

    const result = enrichWithPhoto(entry, mockStore, USER_PUBKEY);
    assert.false(result, 'not a kind 360');
    assert.notOk(entry.photo);
  });

  test('enrichWithPhoto returns false when zapped event is not authored by the user', function (assert) {
    const otherUserPhoto = makePhotoEvent({ author: 'z'.repeat(64) });
    const mockStore = { getEvent: () => otherUserPhoto };

    const entry = parseZapReceipt(
      makeZapReceiptEvent({ zappedEventId: PHOTO_EVENT_ID }),
      USER_PUBKEY
    );

    const result = enrichWithPhoto(entry, mockStore, USER_PUBKEY);
    assert.false(result, 'not authored by the user');
  });

  test('enrichWithPhoto returns false when zapped event not in store', function (assert) {
    const mockStore = { getEvent: () => undefined };

    const entry = parseZapReceipt(makeZapReceiptEvent(), USER_PUBKEY);

    const result = enrichWithPhoto(entry, mockStore, USER_PUBKEY);
    assert.false(result, 'event not in store');
  });
});
