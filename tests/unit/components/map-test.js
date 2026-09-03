import MapComponent from 'marco/components/map';
import { module, test } from 'qunit';

module('Unit | Component | map', function () {
  test('it decodes Planetiler vector tile POI ids into OSM ids and types', function (assert) {
    const feature = {
      get(key) {
        if (key === 'mvt:layer') return 'poi';
        return undefined;
      },
      getId() {
        return 12342;
      },
    };

    const result = MapComponent.prototype.decodeVectorTileOsmFeature(feature);

    assert.deepEqual(result, {
      decoded: {
        osmId: '1234',
        osmType: 'way',
      },
      reason: null,
    });
  });

  test('it ignores non-POI vector tile features', function (assert) {
    const feature = {
      get(key) {
        if (key === 'mvt:layer') return 'transportation';
        return undefined;
      },
      getId() {
        return 12342;
      },
    };

    assert.deepEqual(MapComponent.prototype.decodeVectorTileOsmFeature(feature), {
      decoded: null,
      reason: 'unsupported source layer: transportation',
    });
  });

  test('it ignores unsupported or invalid vector tile ids', function (assert) {
    const feature = {
      get(key) {
        if (key === 'mvt:layer') return 'poi';
        return undefined;
      },
      getId() {
        return 12340;
      },
    };

    assert.deepEqual(MapComponent.prototype.decodeVectorTileOsmFeature(feature), {
      decoded: null,
      reason: 'feature id suffix 0 is not an OSM type',
    });
  });
});
