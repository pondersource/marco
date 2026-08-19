import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';

module('Unit | Service | osm', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let service = this.owner.lookup('service:osm');
    assert.ok(service);
  });

  test('normalizeOsmApiData handles nodes correctly', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 123,
        type: 'node',
        lat: 52.5,
        lon: 13.4,
        tags: { name: 'Test Node' },
      },
    ];

    const result = service.normalizeOsmApiData(elements, 123, 'node');

    assert.strictEqual(result.title, 'Test Node');
    assert.strictEqual(result.lat, 52.5);
    assert.strictEqual(result.lon, 13.4);
    assert.strictEqual(result.osmId, '123');
    assert.strictEqual(result.osmType, 'node');
  });

  test('normalizeOsmApiData calculates centroid for ways', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 456,
        type: 'way',
        nodes: [1, 2],
        tags: { name: 'Test Way' },
      },
      { id: 1, type: 'node', lat: 10, lon: 10 },
      { id: 2, type: 'node', lat: 20, lon: 20 },
    ];

    const result = service.normalizeOsmApiData(elements, 456, 'way');

    assert.strictEqual(result.title, 'Test Way');
    assert.strictEqual(result.lat, 15); // (10+20)/2
    assert.strictEqual(result.lon, 15); // (10+20)/2
    assert.strictEqual(result.osmId, '456');
    assert.strictEqual(result.osmType, 'way');
  });

  test('normalizeOsmApiData prioritizes label node for relations', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 789,
        type: 'relation',
        members: [
          { type: 'node', ref: 1, role: 'admin_centre' },
          { type: 'node', ref: 2, role: 'label' },
        ],
        tags: { name: 'Test Relation' },
      },
      { id: 1, type: 'node', lat: 10, lon: 10, tags: { name: 'Admin Centre' } },
      { id: 2, type: 'node', lat: 30, lon: 30, tags: { name: 'Label Node' } },
    ];

    const result = service.normalizeOsmApiData(elements, 789, 'relation');

    assert.strictEqual(result.title, 'Label Node');
    assert.strictEqual(result.lat, 30);
    assert.strictEqual(result.lon, 30);
    assert.strictEqual(result.osmId, '2');
    assert.strictEqual(result.osmType, 'node');
  });

  test('normalizeOsmApiData falls back to admin_centre node for relations', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 789,
        type: 'relation',
        members: [{ type: 'node', ref: 1, role: 'admin_centre' }],
        tags: { name: 'Test Relation' },
      },
      { id: 1, type: 'node', lat: 10, lon: 10, tags: { name: 'Admin Centre' } },
    ];

    const result = service.normalizeOsmApiData(elements, 789, 'relation');

    assert.strictEqual(result.title, 'Admin Centre');
    assert.strictEqual(result.lat, 10);
    assert.strictEqual(result.lon, 10);
    assert.strictEqual(result.osmId, '1');
    assert.strictEqual(result.osmType, 'node');
  });

  test('normalizeOsmApiData calculates bbox for relations', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 789,
        type: 'relation',
        members: [
          { type: 'node', ref: 1, role: 'label' },
          { type: 'node', ref: 2, role: 'border' },
          { type: 'node', ref: 3, role: 'border' },
        ],
        tags: { name: 'Test Relation' },
      },
      { id: 1, type: 'node', lat: 10, lon: 10, tags: { name: 'Label' } },
      { id: 2, type: 'node', lat: 0, lon: 0 },
      { id: 3, type: 'node', lat: 20, lon: 20 },
    ];

    const result = service.normalizeOsmApiData(elements, 789, 'relation');

    // Should prioritize admin centre for ID/Title/Center
    assert.strictEqual(result.title, 'Label');
    assert.strictEqual(result.lat, 10);
    assert.strictEqual(result.lon, 10);
    assert.strictEqual(result.osmId, '1');
    assert.strictEqual(result.osmType, 'node');

    // BUT should calculate BBox from ALL members (0,0 to 20,20)
    assert.ok(result.bbox, 'BBox should be present');
    assert.strictEqual(result.bbox.minLat, 0);
    assert.strictEqual(result.bbox.minLon, 0);
    assert.strictEqual(result.bbox.maxLat, 20);
    assert.strictEqual(result.bbox.maxLon, 20);
  });

  test('normalizeOsmApiData calculates centroid for relations with member ways', function (assert) {
    let service = this.owner.lookup('service:osm');
    /*
      Relation 999
        -> Way 888
           -> Node 1 (10, 10)
           -> Node 2 (20, 20)
    */
    const elements = [
      {
        id: 999,
        type: 'relation',
        members: [{ type: 'way', ref: 888, role: 'outer' }],
        tags: { name: 'Complex Relation' },
      },
      {
        id: 888,
        type: 'way',
        nodes: [1, 2],
      },
      { id: 1, type: 'node', lat: 10, lon: 10 },
      { id: 2, type: 'node', lat: 20, lon: 20 },
    ];

    const result = service.normalizeOsmApiData(elements, 999, 'relation');

    assert.strictEqual(result.title, 'Complex Relation');
    // It averages all nodes found. In this case, Node 1 and Node 2.
    assert.strictEqual(result.lat, 15); // (10+20)/2
    assert.strictEqual(result.lon, 15); // (10+20)/2
    assert.strictEqual(result.osmId, '999');
    assert.strictEqual(result.osmType, 'relation');
  });

  test('normalizeOsmApiData creates GeoJSON for ways', function (assert) {
    let service = this.owner.lookup('service:osm');
    const elements = [
      {
        id: 456,
        type: 'way',
        nodes: [1, 2, 3],
        tags: { name: 'Test Way' },
      },
      { id: 1, type: 'node', lat: 0, lon: 0 },
      { id: 2, type: 'node', lat: 10, lon: 10 },
      { id: 3, type: 'node', lat: 0, lon: 0 }, // Closed loop
    ];

    const result = service.normalizeOsmApiData(elements, 456, 'way');

    assert.ok(result.geojson, 'GeoJSON should be present');
    assert.strictEqual(
      result.geojson.type,
      'Polygon',
      'Closed way should be a Polygon'
    );
    assert.strictEqual(
      result.geojson.coordinates[0].length,
      3,
      'Should have 3 coordinates'
    );
    assert.deepEqual(result.geojson.coordinates[0][0], [0, 0]);
    assert.deepEqual(result.geojson.coordinates[0][1], [10, 10]);
  });

  test('normalizeOsmApiData creates GeoJSON MultiLineString for relations', function (assert) {
    let service = this.owner.lookup('service:osm');
    /*
      Relation 999
        -> Way 888 (0,0 -> 10,10)
        -> Way 777 (20,20 -> 30,30)
    */
    const elements = [
      {
        id: 999,
        type: 'relation',
        members: [
          { type: 'way', ref: 888, role: 'outer' },
          { type: 'way', ref: 777, role: 'inner' },
        ],
        tags: { name: 'Complex Relation' },
      },
      {
        id: 888,
        type: 'way',
        nodes: [1, 2],
      },
      {
        id: 777,
        type: 'way',
        nodes: [3, 4],
      },
      { id: 1, type: 'node', lat: 0, lon: 0 },
      { id: 2, type: 'node', lat: 10, lon: 10 },
      { id: 3, type: 'node', lat: 20, lon: 20 },
      { id: 4, type: 'node', lat: 30, lon: 30 },
    ];

    const result = service.normalizeOsmApiData(elements, 999, 'relation');

    assert.ok(result.geojson, 'GeoJSON should be present');
    assert.strictEqual(result.geojson.type, 'MultiLineString');
    assert.strictEqual(
      result.geojson.coordinates.length,
      2,
      'Should have 2 segments'
    );
    // Check first segment (Way 888)
    assert.deepEqual(result.geojson.coordinates[0], [
      [0, 0],
      [10, 10],
    ]);
    // Check second segment (Way 777)
    assert.deepEqual(result.geojson.coordinates[1], [
      [20, 20],
      [30, 30],
    ]);
  });

  test('getCategoryPois uses cache when lat/lon matches', async function (assert) {
    let service = this.owner.lookup('service:osm');

    // Mock settings
    service.settings = { overpassApi: 'http://test-api' };

    // Mock fetchWithRetry
    let fetchCount = 0;
    service.fetchWithRetry = async () => {
      fetchCount++;
      return {
        ok: true,
        json: async () => ({
          elements: [{ id: 1, type: 'node', tags: { name: 'Test' } }],
        }),
      };
    };

    const bounds = { minLat: 0, minLon: 0, maxLat: 1, maxLon: 1 };

    // First call - should fetch
    await service.getCategoryPois(bounds, 'restaurants', 52.5, 13.4);
    assert.strictEqual(fetchCount, 1, 'First call should trigger fetch');

    // Second call with same lat/lon - should cache
    await service.getCategoryPois(bounds, 'restaurants', 52.5, 13.4);
    assert.strictEqual(
      fetchCount,
      1,
      'Second call with same lat/lon should use cache'
    );

    // Third call with diff lat/lon - should fetch
    await service.getCategoryPois(bounds, 'restaurants', 52.6, 13.5);
    assert.strictEqual(
      fetchCount,
      2,
      'Call with different lat/lon should trigger fetch'
    );
  });

  test('_storeInMemoryAndLocalStorage rejects entries without a title', function (assert) {
    let service = this.owner.lookup('service:osm');

    service._storeInMemoryAndLocalStorage('node:1', 'node', '1', {
      title: null,
      lat: 1,
      lon: 1,
    });

    assert.false(
      service.cachedPlaces.has('node:1'),
      'Does not cache entries without a title'
    );

    service._storeInMemoryAndLocalStorage('node:2', 'node', '2', null);
    assert.false(
      service.cachedPlaces.has('node:2'),
      'Does not cache null entries'
    );
  });

  test('_storeInMemoryAndLocalStorage accepts entries with a title', function (assert) {
    let service = this.owner.lookup('service:osm');

    service._storeInMemoryAndLocalStorage('node:3', 'node', '3', {
      title: 'Café Example',
      lat: 52.5,
      lon: 13.4,
    });

    assert.true(
      service.cachedPlaces.has('node:3'),
      'Caches entries with a title'
    );
  });

  test('fetchOsmObjectsBatch does not write to the general OSM cache', async function (assert) {
    let service = this.owner.lookup('service:osm');

    service.fetchWithRetry = async () => ({
      ok: true,
      json: async () => ({
        elements: [
          { id: 100, type: 'node', lat: 1, lon: 2, tags: { name: 'Node 100' } },
        ],
      }),
    });

    await service.fetchOsmObjectsBatch([{ osmType: 'node', osmId: '100' }]);

    assert.false(
      service.cachedPlaces.has('node:100'),
      'Batch fetch does not write to the in-memory OSM cache'
    );
    assert.notOk(
      await service.localForage.get('osm-cache', 'node:100'),
      'Batch fetch does not write to the persistent OSM cache'
    );
  });

  test('fetchOsmObjectsBatch returns resolved places in the result Map', async function (assert) {
    let service = this.owner.lookup('service:osm');

    service.fetchWithRetry = async () => ({
      ok: true,
      json: async () => ({
        elements: [
          { id: 200, type: 'node', lat: 1, lon: 2, tags: { name: 'Café 200' } },
        ],
      }),
    });

    const result = await service.fetchOsmObjectsBatch([
      { osmType: 'node', osmId: '200' },
    ]);

    assert.true(result.has('node:200'), 'Result contains the fetched place');
    assert.strictEqual(
      result.get('node:200').title,
      'Café 200',
      'Result has the correct title'
    );
  });

  test('fetchOsmObjectsBatch uses .json suffix in the API URL', async function (assert) {
    let service = this.owner.lookup('service:osm');

    let capturedUrls = [];
    service.fetchWithRetry = async (url) => {
      capturedUrls.push(url);
      return {
        ok: true,
        json: async () => ({
          elements: [
            { id: 300, type: 'node', lat: 1, lon: 2, tags: { name: 'Test' } },
          ],
        }),
      };
    };

    await service.fetchOsmObjectsBatch([{ osmType: 'node', osmId: '300' }]);

    assert.true(
      capturedUrls.some((url) => url.includes('.json')),
      'Batch fetch URL includes .json suffix'
    );
  });

  test('fetchOsmObjectsBatch uses correct pluralized endpoints', async function (assert) {
    let service = this.owner.lookup('service:osm');

    let capturedUrls = [];
    service.fetchWithRetry = async (url) => {
      capturedUrls.push(url);
      return {
        ok: true,
        json: async () => ({ elements: [] }),
      };
    };

    await service.fetchOsmObjectsBatch([
      { osmType: 'node', osmId: '1' },
      { osmType: 'way', osmId: '2' },
      { osmType: 'relation', osmId: '3' },
    ]);

    assert.true(
      capturedUrls.some((u) => u.includes('/nodes.json?nodes=')),
      'Uses nodes.json endpoint'
    );
    assert.true(
      capturedUrls.some((u) => u.includes('/ways.json?ways=')),
      'Uses ways.json endpoint'
    );
    assert.true(
      capturedUrls.some((u) => u.includes('/relations.json?relations=')),
      'Uses relations.json endpoint'
    );
  });

  test('fetchOsmObject with forceFresh bypasses the cache and returns fresh data', async function (assert) {
    let service = this.owner.lookup('service:osm');

    // Seed both caches so we can prove forceFresh skips them.
    service.cachedPlaces.set('node:5', {
      data: { title: 'Stale In-Memory', lat: 1, lon: 1 },
      timestamp: Date.now(),
    });
    await service.localForage.set('osm-cache', 'node:5', {
      data: { title: 'Stale IndexedDB', lat: 1, lon: 1 },
      timestamp: Date.now(),
    });

    service.fetchWithRetry = async () => ({
      ok: true,
      json: async () => ({
        elements: [
          {
            id: 5,
            type: 'node',
            lat: 2,
            lon: 3,
            tags: { name: 'Fresh From API' },
          },
        ],
      }),
    });

    const result = await service.fetchOsmObject('5', 'node', {
      forceFresh: true,
    });

    assert.strictEqual(
      result.title,
      'Fresh From API',
      'Returns fresh API data, not cached data'
    );
    assert.strictEqual(result.lat, 2);
    assert.strictEqual(result.lon, 3);
  });

  test('fetchOsmObject without forceFresh returns the in-memory cache entry without hitting the API', async function (assert) {
    let service = this.owner.lookup('service:osm');

    service.cachedPlaces.set('node:6', {
      data: { title: 'Warm In-Memory', lat: 4, lon: 5 },
      timestamp: Date.now(),
    });

    let fetchCalled = 0;
    service.fetchWithRetry = async () => {
      fetchCalled++;
      return { ok: true, json: async () => ({ elements: [] }) };
    };

    const result = await service.fetchOsmObject('6', 'node');

    assert.strictEqual(fetchCalled, 0, 'API was not hit');
    assert.strictEqual(result.title, 'Warm In-Memory');
  });
});
