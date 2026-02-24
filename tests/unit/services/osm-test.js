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
});
