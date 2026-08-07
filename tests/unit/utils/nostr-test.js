import { module, test } from 'qunit';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  normalizeRelayUrl,
  parsePlacePhotos,
  uniqNormalizedRelays,
} from 'marco/utils/nostr';

module('Unit | Utility | nostr', function () {
  test('normalizeRelayUrl normalizes protocol, case, and slashes', function (assert) {
    assert.strictEqual(normalizeRelayUrl(null), '');
    assert.strictEqual(normalizeRelayUrl(''), '');
    assert.strictEqual(normalizeRelayUrl('  '), '');

    assert.strictEqual(
      normalizeRelayUrl('Relay.example.com'),
      'wss://relay.example.com'
    );
    assert.strictEqual(
      normalizeRelayUrl('ws://Relay.example.com/'),
      'ws://relay.example.com'
    );
    assert.strictEqual(
      normalizeRelayUrl('wss://relay.example.com///'),
      'wss://relay.example.com'
    );
  });

  test('parsePlacePhotos includes event t tags on photo objects', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 123,
        tags: [
          ['i', 'osm:node:123'],
          ['t', 'food'],
          ['t', 'vibe'],
          ['imeta', 'url https://example.com/photo.jpg', 'dim 800x600'],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 1);
    assert.deepEqual(photos[0].tags, ['food', 'vibe']);
  });

  test('parsePlacePhotos sorts by created_at', function (assert) {
    const events = [
      {
        id: 'event-2',
        pubkey: 'pubkey-2',
        created_at: 200,
        tags: [
          ['i', 'osm:node:456'],
          ['imeta', 'url https://example.com/late.jpg', 'dim 600x900'],
        ],
      },
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [
          ['i', 'osm:node:123'],
          ['imeta', 'url https://example.com/early.jpg', 'dim 600x900'],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 2);
    assert.strictEqual(photos[0].url, 'https://example.com/early.jpg');
    assert.strictEqual(photos[1].url, 'https://example.com/late.jpg');
  });

  test('parsePlacePhotos promotes first landscape photo to index 0', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [
          ['imeta', 'url https://example.com/portrait.jpg', 'dim 600x900'],
        ],
      },
      {
        id: 'event-2',
        pubkey: 'pubkey-2',
        created_at: 200,
        tags: [
          ['imeta', 'url https://example.com/landscape.jpg', 'dim 1200x600'],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 2);
    assert.strictEqual(photos[0].url, 'https://example.com/landscape.jpg');
    assert.strictEqual(photos[1].url, 'https://example.com/portrait.jpg');
  });

  test('parsePlacePhotos skips imeta entries without urls', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [['imeta', 'dim 800x600']],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.deepEqual(photos, []);
  });

  test('parsePlacePhotos returns one photo per event imeta tag', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [
          ['i', 'osm:node:123'],
          ['imeta', 'url https://example.com/photo-1.jpg', 'dim 800x600'],
        ],
      },
      {
        id: 'event-2',
        pubkey: 'pubkey-2',
        created_at: 200,
        tags: [
          ['i', 'osm:node:456'],
          ['imeta', 'url https://example.com/photo-2.jpg', 'dim 600x800'],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 2);
    assert.strictEqual(photos[0].placeIdentifier, 'osm:node:123');
    assert.strictEqual(photos[1].placeIdentifier, 'osm:node:456');
  });

  test('parsePlacePhotos extracts alt text from imeta', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [
          [
            'imeta',
            'url https://example.com/photo.jpg',
            'dim 800x600',
            'alt A sunny terrace overlooking the bay',
          ],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 1);
    assert.strictEqual(photos[0].alt, 'A sunny terrace overlooking the bay');
  });

  test('parsePlacePhotos strips the legacy placeholder alt text', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [
          [
            'imeta',
            'url https://example.com/photo.jpg',
            'dim 800x600',
            'alt A photo of a place',
          ],
        ],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 1);
    assert.strictEqual(photos[0].alt, null);
  });

  test('parsePlacePhotos leaves alt null when not provided', function (assert) {
    const events = [
      {
        id: 'event-1',
        pubkey: 'pubkey-1',
        created_at: 100,
        tags: [['imeta', 'url https://example.com/photo.jpg', 'dim 800x600']],
      },
    ];

    const photos = parsePlacePhotos(events);

    assert.strictEqual(photos.length, 1);
    assert.strictEqual(photos[0].alt, null);
  });

  test('uniqNormalizedRelays returns normalized unique relays', function (assert) {
    const relays = uniqNormalizedRelays([
      'Relay.example.com',
      'wss://relay.example.com/',
      'wss://other.example.com',
    ]);

    assert.deepEqual(relays, [
      'wss://relay.example.com',
      'wss://other.example.com',
    ]);
  });

  test('mergeRequiredRelays keeps required relays as-is and merges normalized custom relays', function (assert) {
    const relays = mergeRequiredRelays(
      ['wss://required.example.com', 'required-2.example.com'],
      ['required-2.example.com/', 'wss://custom.example.com']
    );

    assert.deepEqual(relays, [
      'wss://required.example.com',
      'required-2.example.com',
      'wss://required-2.example.com',
      'wss://custom.example.com',
    ]);
  });

  test('excludeRequiredRelays removes required relays from normalized custom list', function (assert) {
    const relays = excludeRequiredRelays(
      [
        'wss://required.example.com',
        'custom.example.com',
        'ws://custom2.example.com',
      ],
      ['wss://required.example.com']
    );

    assert.deepEqual(relays, [
      'wss://custom.example.com',
      'ws://custom2.example.com',
    ]);
  });

  test('excludeRequiredRelays trusts required list without normalizing it', function (assert) {
    const relays = excludeRequiredRelays(
      ['Required.example.com', 'custom.example.com'],
      ['required.example.com']
    );

    assert.deepEqual(relays, [
      'wss://required.example.com',
      'wss://custom.example.com',
    ]);
  });
});
