import { module, test } from 'qunit';
import { setupTest } from 'ember-qunit';
import { getGeohashPrefixesInBbox } from 'marco/utils/geohash-coverage';

module('Unit | Utility | geohash-coverage', function (hooks) {
  setupTest(hooks);

  test('it returns correct prefixes for a small bounding box', function (assert) {
    // A small area in Berlin (approx)
    // 4-char geohash for Berlin is roughly 'u33d'
    // lat ~ 52.5, lon ~ 13.4
    const bbox = {
      minLat: 52.51,
      minLon: 13.38,
      maxLat: 52.52,
      maxLon: 13.4,
    };

    // Precision 4
    const prefixes = getGeohashPrefixesInBbox(bbox);

    assert.ok(prefixes.length > 0, 'Should return prefixes');
    assert.ok(
      prefixes.every((p) => p.length === 4),
      'Prefixes should be 4 chars long'
    );
    // We expect 'u33d' to be in there or neighbors
    // Berlin Alexanderplatz is u33dc1
    assert.ok(
      prefixes.some((p) => p.startsWith('u33')),
      'Should contain Berlin region prefix'
    );
  });

  test('it handles cases where steps might miss a small edge', function (assert) {
    // A bbox that is exactly one point
    const bbox = {
      minLat: 50.0,
      minLon: 10.0,
      maxLat: 50.0,
      maxLon: 10.0,
    };
    const prefixes = getGeohashPrefixesInBbox(bbox);
    assert.strictEqual(
      prefixes.length,
      1,
      'Single point should result in 1 prefix'
    );
  });
});
