import { module, test } from 'qunit';
import { groupPhotoContributions } from 'marco/utils/contributions';

function makePhotoEvent({
  id,
  created_at,
  placeIdentifier = 'osm:node:123',
  url = 'https://example.com/photo.jpg',
  tags = [],
}) {
  return {
    id,
    pubkey: 'pubkey-1',
    kind: 360,
    created_at,
    tags: [
      ['i', placeIdentifier],
      ['imeta', `url ${url}`, 'dim 800x600'],
      ...tags.map((t) => ['t', t]),
    ],
  };
}

function makeDeletionEvent({ id, targetId }) {
  return {
    id,
    pubkey: 'pubkey-1',
    kind: 5,
    created_at: 999,
    tags: [['e', targetId]],
  };
}

module('Unit | Utility | contributions', function () {
  test('groupPhotoContributions returns empty for no events', function (assert) {
    assert.deepEqual(groupPhotoContributions([]), []);
    assert.deepEqual(groupPhotoContributions(null), []);
  });

  test('groupPhotoContributions creates one entry per event for the same place when spread out', function (assert) {
    // Two events 10 hours apart for the same place -> two entries
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        url: 'https://x.com/1.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 1000 + 10 * 60 * 60,
        url: 'https://x.com/2.jpg',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 2);
    // Newest first
    assert.strictEqual(entries[0].photos[0].url, 'https://x.com/2.jpg');
    assert.strictEqual(entries[1].photos[0].url, 'https://x.com/1.jpg');
  });

  test('groupPhotoContributions groups events for the same place within the threshold', function (assert) {
    // Two events 30 minutes apart -> one entry with two photos
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        url: 'https://x.com/1.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 1000 + 30 * 60,
        url: 'https://x.com/2.jpg',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].photos.length, 2);
    assert.strictEqual(entries[0].eventCount, 2);
    // createdAt = newest event's created_at
    assert.strictEqual(entries[0].createdAt, 1000 + 30 * 60);
  });

  test('groupPhotoContributions orders photos within a group oldest-first', function (assert) {
    // Three events within the threshold for the same place
    const events = [
      makePhotoEvent({
        id: 'e3',
        created_at: 3000,
        url: 'https://x.com/3.jpg',
      }),
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        url: 'https://x.com/1.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 2000,
        url: 'https://x.com/2.jpg',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(
      entries[0].photos[0].url,
      'https://x.com/1.jpg',
      'First photo is the oldest'
    );
    assert.strictEqual(
      entries[0].photos[1].url,
      'https://x.com/2.jpg',
      'Second photo is the middle'
    );
    assert.strictEqual(
      entries[0].photos[2].url,
      'https://x.com/3.jpg',
      'Third photo is the newest'
    );
  });

  test('groupPhotoContributions groups by OSM entity identifier', function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:111',
        url: 'https://x.com/a.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 1000,
        placeIdentifier: 'osm:node:222',
        url: 'https://x.com/b.jpg',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 2);
  });

  test('groupPhotoContributions sorts entries newest-first', function (assert) {
    const events = [
      makePhotoEvent({
        id: 'old',
        created_at: 100,
        placeIdentifier: 'osm:node:111',
      }),
      makePhotoEvent({
        id: 'new',
        created_at: 200,
        placeIdentifier: 'osm:node:222',
      }),
      makePhotoEvent({
        id: 'mid',
        created_at: 150,
        placeIdentifier: 'osm:node:333',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries[0].placeIdentifier, 'osm:node:222');
    assert.strictEqual(entries[1].placeIdentifier, 'osm:node:333');
    assert.strictEqual(entries[2].placeIdentifier, 'osm:node:111');
  });

  test('groupPhotoContributions respects custom threshold hours', function (assert) {
    // Events 2 hours apart. With threshold 1, they are separate; with 3, they group.
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        url: 'https://x.com/1.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 1000 + 2 * 60 * 60,
        url: 'https://x.com/2.jpg',
      }),
    ];

    assert.strictEqual(groupPhotoContributions(events, 1).length, 2);
    assert.strictEqual(groupPhotoContributions(events, 3).length, 1);
  });

  test('groupPhotoContributions parses place identifier into osmType and osmId', function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:way:98765',
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries[0].osmType, 'way');
    assert.strictEqual(entries[0].osmId, '98765');
  });

  test('groupPhotoContributions attaches t tags to photos', function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        tags: ['food', 'vibe'],
      }),
    ];

    const entries = groupPhotoContributions(events);
    assert.deepEqual(entries[0].photos[0].tags, ['food', 'vibe']);
  });

  test('groupPhotoContributions excludes events deleted by kind 5', function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        url: 'https://x.com/1.jpg',
      }),
      makePhotoEvent({
        id: 'e2',
        created_at: 2000,
        url: 'https://x.com/2.jpg',
      }),
      makeDeletionEvent({ id: 'd1', targetId: 'e1' }),
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].photos[0].url, 'https://x.com/2.jpg');
  });

  test('groupPhotoContributions skips events without an i tag', function (assert) {
    const events = [
      {
        id: 'no-i',
        pubkey: 'pubkey-1',
        kind: 360,
        created_at: 1000,
        tags: [['imeta', 'url https://x.com/1.jpg', 'dim 800x600']],
      },
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 0);
  });

  test('groupPhotoContributions skips events without a usable imeta', function (assert) {
    const events = [makePhotoEvent({ id: 'e1', created_at: 1000, url: null })];

    // The helper always sets a URL, so override manually
    events[0].tags = [
      ['i', 'osm:node:123'],
      ['imeta', 'dim 800x600'],
    ];

    const entries = groupPhotoContributions(events);
    assert.strictEqual(entries.length, 0);
  });
});
