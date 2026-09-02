import { module, test } from 'qunit';
import {
  ActivityEntry,
  parseZapReceipt,
  enrichWithPhoto,
  groupSocialPhotos,
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

const SOCIAL_PK_A = 'a'.repeat(64);
const SOCIAL_PK_B = 'b'.repeat(64);

function makeSocialPhotoEvent(opts = {}) {
  return {
    id: opts.id || `e${(opts.idx ?? 0).toString().padStart(63, '0')}`,
    pubkey: opts.author || SOCIAL_PK_A,
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

module('Unit | Utility | activity | groupSocialPhotos', function () {
  test('returns empty for no events', function (assert) {
    assert.deepEqual(groupSocialPhotos([]), []);
    assert.deepEqual(groupSocialPhotos(null), []);
  });

  test('groups by author + place within time threshold', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 2000,
      }),
      makeSocialPhotoEvent({
        idx: 3,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 3000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries.length, 1, 'one entry for same author + place');
    assert.strictEqual(entries[0].type, 'photo');
    assert.strictEqual(entries[0].photos.length, 3);
    assert.strictEqual(entries[0].senderPubkey, SOCIAL_PK_A);
    assert.strictEqual(entries[0].createdAt, 3000, 'newest created_at');
    assert.strictEqual(entries[0].placeIdentifier, 'osm:node:1');
  });

  test('separates entries by author for the same place', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_B,
        placeIdentifier: 'osm:node:1',
        created_at: 2000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries.length, 2, 'two entries (one per author)');
    assert.strictEqual(entries[0].senderPubkey, SOCIAL_PK_B, 'newest first');
    assert.strictEqual(entries[1].senderPubkey, SOCIAL_PK_A);
  });

  test('separates entries by place for the same author', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:2',
        created_at: 2000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries.length, 2, 'two entries (one per place)');
    assert.strictEqual(
      entries[0].placeIdentifier,
      'osm:node:2',
      'newest first'
    );
    assert.strictEqual(entries[1].placeIdentifier, 'osm:node:1');
  });

  test('splits by time proximity within same author + place', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 2000,
      }),
      // 5-hour gap (> 3h threshold)
      makeSocialPhotoEvent({
        idx: 3,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 20000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries.length, 2, 'split by time gap');
    assert.strictEqual(entries[0].photos.length, 1, 'newer group has 1 photo');
    assert.strictEqual(entries[1].photos.length, 2, 'older group has 2 photos');
  });

  test('sorts entries newest-first', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_B,
        placeIdentifier: 'osm:node:2',
        created_at: 5000,
      }),
      makeSocialPhotoEvent({
        idx: 3,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:node:1',
        created_at: 2000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries[0].createdAt, 5000, 'newest entry first');
    assert.strictEqual(entries[1].createdAt, 2000, 'second entry');
  });

  test('sets osmType and osmId from placeIdentifier', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        placeIdentifier: 'osm:way:999',
        created_at: 1000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries[0].osmType, 'way');
    assert.strictEqual(entries[0].osmId, '999');
  });

  test('filters out events without an i tag', function (assert) {
    const event = makeSocialPhotoEvent({ idx: 1, author: SOCIAL_PK_A });
    event.tags = [['imeta', 'url https://x.com/photo.jpg', 'dim 800x600']];

    const entries = groupSocialPhotos([event]);
    assert.strictEqual(entries.length, 0, 'no i tag → filtered out');
  });

  test('applies kind 5 deletions', function (assert) {
    const photoId = 'e'.padStart(64, '0');
    const events = [
      {
        id: photoId,
        pubkey: SOCIAL_PK_A,
        kind: 360,
        created_at: 1000,
        tags: [
          ['i', 'osm:node:1'],
          ['imeta', 'url https://x.com/photo.jpg', 'dim 800x600'],
        ],
        content: '',
        sig: 'sig',
      },
      {
        id: 'd'.padStart(64, '0'),
        pubkey: SOCIAL_PK_A,
        kind: 5,
        created_at: 5000,
        tags: [['e', photoId]],
        content: '',
        sig: 'sig',
      },
    ];

    const entries = groupSocialPhotos(events);
    assert.strictEqual(entries.length, 0, 'deleted photo is filtered out');
  });

  test('filters out entries with no usable photos (malformed imeta)', function (assert) {
    const event = makeSocialPhotoEvent({ idx: 1, author: SOCIAL_PK_A });
    event.tags = [
      ['i', 'osm:node:1'],
      ['imeta', 'dim 800x600'], // no url
    ];

    const entries = groupSocialPhotos([event]);
    assert.strictEqual(entries.length, 0, 'malformed imeta → filtered out');
  });

  test('photo is set to first photo in the group', function (assert) {
    const events = [
      makeSocialPhotoEvent({
        idx: 1,
        author: SOCIAL_PK_A,
        url: 'https://x.com/a.jpg',
        created_at: 1000,
      }),
      makeSocialPhotoEvent({
        idx: 2,
        author: SOCIAL_PK_A,
        url: 'https://x.com/b.jpg',
        created_at: 2000,
      }),
    ];

    const entries = groupSocialPhotos(events);
    assert.ok(entries[0].photo, 'photo is set');
    assert.strictEqual(
      entries[0].photo.url,
      'https://x.com/a.jpg',
      'first photo (oldest) is the thumbnail'
    );
  });
});
