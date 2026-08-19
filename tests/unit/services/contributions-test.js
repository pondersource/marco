import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

function makePhotoEvent({
  id,
  created_at,
  placeIdentifier = 'osm:node:123',
  url = 'https://example.com/photo.jpg',
}) {
  return {
    id,
    pubkey: 'pubkey-1',
    kind: 360,
    created_at,
    tags: [
      ['i', placeIdentifier],
      ['imeta', `url ${url}`, 'dim 800x600'],
    ],
  };
}

class MockStorageService extends Service {
  savedPlaces = [];
  findPlaceById() {
    return null;
  }
}

class MockNostrDataService extends Service {
  store = {
    timeline() {
      return {
        subscribe() {
          return { unsubscribe() {} };
        },
      };
    },
  };

  async loadMyContributions() {}
}

class MockOsmService extends Service {
  async getCachedOsmObject() {
    return null;
  }

  async fetchOsmObjectsBatch() {
    return new Map();
  }
}

const NAME_CACHE_STORE = 'contributions-name-cache';

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

module('Unit | Service | contributions', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:storage', MockStorageService);
    this.owner.register('service:nostrData', MockNostrDataService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('_updateItems resolves names from bookmarks immediately', function (assert) {
    const events = [makePhotoEvent({ id: 'e1', created_at: 1000 })];

    const service = this.owner.lookup('service:contributions');
    service.storage.savedPlaces = [{ id: '123', title: 'Bookmarked Café' }];
    service.storage.findPlaceById = (id) =>
      id === '123' ? { id: '123', title: 'Bookmarked Café' } : null;

    service._updateItems(events);

    assert.strictEqual(service.items.length, 1);
    assert.false(service.items[0].placeNameLoading, 'Not loading');
    assert.strictEqual(
      service.items[0].placeName,
      'Bookmarked Café',
      'Resolved from bookmark'
    );
  });

  test('_updateItems resolves names from the persistent name cache', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:999',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    await service.localForage.set(
      NAME_CACHE_STORE,
      'osm:node:999',
      'Cached Park'
    );

    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(service.items[0].placeName, 'Cached Park');
    assert.false(service.items[0].placeNameLoading);
  });

  test('resolved names are persisted to the IndexedDB name cache', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:42',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    service.osm.fetchOsmObjectsBatch = async () => {
      const map = new Map();
      map.set('node:42', { title: 'Test Place' });
      return map;
    };

    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(
      await service.localForage.get(NAME_CACHE_STORE, 'osm:node:42'),
      'Test Place',
      'Name is persisted to the IndexedDB name cache'
    );
  });

  test('names stored in a previous session are resolved from the IndexedDB cache', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:77',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    await service.localForage.set(
      NAME_CACHE_STORE,
      'osm:node:77',
      'Persisted Place'
    );

    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(service.items[0].placeName, 'Persisted Place');
    assert.false(service.items[0].placeNameLoading);
  });

  test('batch fetch failure applies a fallback name so items do not stay loading', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:555',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    // OSM batch returns empty (simulating all-failed fetch)
    service.osm.fetchOsmObjectsBatch = async () => new Map();

    service._updateItems(events);

    // Wait for the background batch to complete
    await flushPromises();

    assert.false(
      service.items[0].placeNameLoading,
      'Item is no longer loading after batch failure'
    );
    assert.strictEqual(
      service.items[0].placeName,
      'OSM node 555',
      'Fallback name is applied'
    );
  });

  test('fallback names are NOT persisted to the name cache (so they can be re-fetched next session)', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:666',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    service.osm.fetchOsmObjectsBatch = async () => new Map();

    service._updateItems(events);
    await flushPromises();

    // Fallback should be shown but NOT cached
    assert.strictEqual(service.items[0].placeName, 'OSM node 666');
    assert.notOk(
      await service.localForage.get(NAME_CACHE_STORE, 'osm:node:666'),
      'No fallback name persisted in the IndexedDB name cache'
    );
    assert.true(
      service._unresolvable.has('osm:node:666'),
      'Item is marked unresolvable for this session'
    );
  });

  test('unresolvable items are not re-fetched within the same session', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:777',
      }),
    ];

    let fetchCount = 0;
    const service = this.owner.lookup('service:contributions');
    service.osm.fetchOsmObjectsBatch = async () => {
      fetchCount++;
      return new Map();
    };

    // First update triggers a fetch
    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(fetchCount, 1, 'First update triggers a fetch');
    assert.strictEqual(service.items[0].placeName, 'OSM node 777');

    // Second update should NOT trigger another fetch (already unresolvable)
    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(fetchCount, 1, 'Second update does not re-fetch');
    assert.strictEqual(
      service.items[0].placeName,
      'OSM node 777',
      'Fallback is shown immediately'
    );
  });

  test('successful batch resolution stores names in the name cache', async function (assert) {
    const events = [
      makePhotoEvent({
        id: 'e1',
        created_at: 1000,
        placeIdentifier: 'osm:node:111',
      }),
    ];

    const service = this.owner.lookup('service:contributions');
    service.osm.fetchOsmObjectsBatch = async () => {
      const map = new Map();
      map.set('node:111', { title: 'Resolved Café' });
      return map;
    };

    service._updateItems(events);
    await flushPromises();

    assert.strictEqual(service.items[0].placeName, 'Resolved Café');
    assert.strictEqual(
      await service.localForage.get(NAME_CACHE_STORE, 'osm:node:111'),
      'Resolved Café',
      'Name is stored in the name cache'
    );
  });
});
