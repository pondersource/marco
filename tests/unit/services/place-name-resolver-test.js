import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

function makeEntry(opts = {}) {
  const placeIdentifier = opts.placeIdentifier || 'osm:node:123';
  const [, osmType, osmId] = placeIdentifier.split(':');
  return {
    placeIdentifier,
    osmType: opts.osmType || osmType,
    osmId: opts.osmId || osmId,
    placeName: opts.placeName || null,
    placeNameLoading: opts.placeNameLoading ?? true,
  };
}

class MockStorageService extends Service {
  savedPlaces = [];
  findPlaceById() {
    return null;
  }
}

class MockOsmService extends Service {
  async getCachedOsmObject() {
    return null;
  }

  async fetchOsmObjectsBatch() {
    return new Map();
  }
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

module('Unit | Service | place-name-resolver', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:storage', MockStorageService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('resolveBookmark returns bookmark title when found', function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const storage = this.owner.lookup('service:storage');
    storage.savedPlaces = [{ id: '123', title: 'Bookmarked Café' }];
    storage.findPlaceById = (id) =>
      id === '123' ? { id: '123', title: 'Bookmarked Café' } : null;

    const name = resolver.resolveBookmark('123');

    assert.strictEqual(name, 'Bookmarked Café');
  });

  test('resolveBookmark returns null when no bookmark', function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');

    const name = resolver.resolveBookmark('999');

    assert.notOk(name);
  });

  test('resolveInBackground resolves names from the persistent name cache', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');
    const entry = makeEntry({ placeIdentifier: 'osm:node:999' });
    await localForage.set('place-name-cache', 'osm:node:999', 'Cached Park');

    await resolver.resolveInBackground([entry]);

    assert.strictEqual(entry.placeName, 'Cached Park');
    assert.false(entry.placeNameLoading);
  });

  test('resolved names are persisted to the IndexedDB name cache', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');
    const entry = makeEntry({ placeIdentifier: 'osm:node:42' });
    resolver.osm.fetchOsmObjectsBatch = async () => {
      const map = new Map();
      map.set('node:42', { title: 'Test Place' });
      return map;
    };

    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.strictEqual(
      await localForage.get('place-name-cache', 'osm:node:42'),
      'Test Place',
      'Name is persisted to the IndexedDB name cache'
    );
  });

  test('names stored in a previous session are resolved from the IndexedDB cache', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');
    const entry = makeEntry({ placeIdentifier: 'osm:node:77' });
    await localForage.set('place-name-cache', 'osm:node:77', 'Persisted Place');

    await resolver.resolveInBackground([entry]);

    assert.strictEqual(entry.placeName, 'Persisted Place');
    assert.false(entry.placeNameLoading);
  });

  test('batch fetch failure applies a fallback name so items do not stay loading', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const entry = makeEntry({ placeIdentifier: 'osm:node:555' });
    resolver.osm.fetchOsmObjectsBatch = async () => new Map();

    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.false(
      entry.placeNameLoading,
      'Item is no longer loading after batch failure'
    );
    assert.strictEqual(
      entry.placeName,
      'OSM node 555',
      'Fallback name is applied'
    );
  });

  test('fallback names are NOT persisted to the name cache (so they can be re-fetched next session)', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');
    const entry = makeEntry({ placeIdentifier: 'osm:node:666' });
    resolver.osm.fetchOsmObjectsBatch = async () => new Map();

    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.strictEqual(entry.placeName, 'OSM node 666');
    assert.notOk(
      await localForage.get('place-name-cache', 'osm:node:666'),
      'No fallback name persisted in the IndexedDB name cache'
    );
    assert.true(
      resolver._unresolvable.has('osm:node:666'),
      'Item is marked unresolvable for this session'
    );
  });

  test('unresolvable items are not re-fetched within the same session', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const entry = makeEntry({ placeIdentifier: 'osm:node:777' });
    let fetchCount = 0;
    resolver.osm.fetchOsmObjectsBatch = async () => {
      fetchCount++;
      return new Map();
    };

    // First call triggers a fetch
    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.strictEqual(fetchCount, 1, 'First call triggers a fetch');
    assert.strictEqual(entry.placeName, 'OSM node 777');

    // Second call should NOT trigger another fetch (already unresolvable)
    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.strictEqual(fetchCount, 1, 'Second call does not re-fetch');
    assert.strictEqual(
      entry.placeName,
      'OSM node 777',
      'Fallback is shown immediately'
    );
  });

  test('successful batch resolution stores names in the name cache', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');
    const entry = makeEntry({ placeIdentifier: 'osm:node:111' });
    resolver.osm.fetchOsmObjectsBatch = async () => {
      const map = new Map();
      map.set('node:111', { title: 'Resolved Café' });
      return map;
    };

    await resolver.resolveInBackground([entry]);
    await flushPromises();

    assert.strictEqual(entry.placeName, 'Resolved Café');
    assert.strictEqual(
      await localForage.get('place-name-cache', 'osm:node:111'),
      'Resolved Café',
      'Name is stored in the name cache'
    );
  });

  test('reset clears per-session state', function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    resolver._unresolvable.add('test-id');
    resolver._lastBatchSignature = 'sig';
    resolver._pendingBatchPromise = Promise.resolve();

    resolver.reset();

    assert.strictEqual(resolver._unresolvable.size, 0);
    assert.strictEqual(resolver._lastBatchSignature, '');
    assert.strictEqual(resolver._pendingBatchPromise, null);
  });

  test('deduplicated batch resolves entries from a second call with same place identifiers', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');
    const localForage = this.owner.lookup('service:localForage');

    let fetchCount = 0;
    resolver.osm.fetchOsmObjectsBatch = async () => {
      fetchCount++;
      const map = new Map();
      map.set('node:222', { title: 'Shared Place' });
      return map;
    };

    // First call with entry1 — triggers a batch fetch
    const entry1 = makeEntry({ placeIdentifier: 'osm:node:222' });
    const promise1 = resolver.resolveInBackground([entry1]);
    await flushPromises();
    await promise1;

    // Verify the name persisted so the second call's cache check finds it
    assert.strictEqual(entry1.placeName, 'Shared Place');
    assert.strictEqual(fetchCount, 1, 'only one batch fetch fired');

    // Simulate the real-world race: a second set of entries for the same
    // place arrives before the cache is consulted. Clear the persistent cache
    // to simulate the incognito scenario where the batch hasn't persisted yet.
    await localForage.clear('place-name-cache');

    // Second call with a fresh entry2 — should resolve from the batch result
    // that was already persisted (or re-use the pending batch if still in flight)
    const entry2 = makeEntry({ placeIdentifier: 'osm:node:222' });
    await resolver.resolveInBackground([entry2]);

    assert.strictEqual(
      entry2.placeName,
      'Shared Place',
      'second entry resolves even when batch was from a prior call'
    );
  });

  test('pending batch is shared when second call fires before first completes', async function (assert) {
    const resolver = this.owner.lookup('service:place-name-resolver');

    let fetchCount = 0;
    resolver.osm.fetchOsmObjectsBatch = async () => {
      fetchCount++;
      const map = new Map();
      map.set('node:333', { title: 'Concurrent Place' });
      return map;
    };

    // First call — don't await yet (simulates subscription firing)
    const entry1 = makeEntry({ placeIdentifier: 'osm:node:333' });
    const promise1 = resolver.resolveInBackground([entry1]);

    // Second call with a different entry for the same place — should piggyback
    const entry2 = makeEntry({ placeIdentifier: 'osm:node:333' });
    const promise2 = resolver.resolveInBackground([entry2]);

    await Promise.all([promise1, promise2]);
    await flushPromises();

    assert.strictEqual(fetchCount, 1, 'only one batch fetch fired');
    assert.strictEqual(entry1.placeName, 'Concurrent Place');
    assert.strictEqual(entry2.placeName, 'Concurrent Place');
  });
});
