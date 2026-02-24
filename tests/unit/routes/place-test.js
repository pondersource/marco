import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

module('Unit | Route | place', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let route = this.owner.lookup('route:place');
    assert.ok(route);
  });

  test('afterModel enriches model with missing geometry', async function (assert) {
    let route = this.owner.lookup('route:place');

    // Mock Services
    let fetchCalled = false;
    let selectPlaceCalled = false;

    class OsmStub extends Service {
      async fetchOsmObject(id, type) {
        fetchCalled = true;
        assert.strictEqual(id, '123', 'Correct ID passed');
        assert.strictEqual(type, 'way', 'Correct Type passed');
        return {
          osmId: '123',
          osmType: 'way',
          geojson: { type: 'Polygon', coordinates: [] },
          tags: { updated: 'true' },
        };
      }
    }

    class MapUiStub extends Service {
      selectPlace(place) {
        selectPlaceCalled = true;
      }
      stopSearch() {}
    }

    this.owner.register('service:osm', OsmStub);
    this.owner.register('service:map-ui', MapUiStub);

    // Initial partial model (from search)
    let model = {
      osmId: '123',
      osmType: 'way',
      title: 'Partial Place',
      // No geojson
    };

    await route.afterModel(model);

    assert.ok(fetchCalled, 'fetchOsmObject should be called');
    assert.ok(selectPlaceCalled, 'selectPlace should be called');
    assert.ok(model.geojson, 'Model should now have geojson');
    assert.strictEqual(
      model.tags.updated,
      'true',
      'Model should have updated tags'
    );
  });

  test('afterModel skips fetch if geometry exists', async function (assert) {
    let route = this.owner.lookup('route:place');

    let fetchCalled = false;

    class OsmStub extends Service {
      async fetchOsmObject() {
        fetchCalled = true;
        return null;
      }
    }

    class MapUiStub extends Service {
      selectPlace() {}
      stopSearch() {}
    }

    this.owner.register('service:osm', OsmStub);
    this.owner.register('service:map-ui', MapUiStub);

    let model = {
      osmId: '456',
      osmType: 'relation',
      geojson: { type: 'MultiLineString' },
    };

    await route.afterModel(model);

    assert.notOk(
      fetchCalled,
      'fetchOsmObject should NOT be called if geojson exists'
    );
  });

  test('afterModel skips fetch for nodes even if geometry is missing', async function (assert) {
    let route = this.owner.lookup('route:place');

    let fetchCalled = false;

    class OsmStub extends Service {
      async fetchOsmObject() {
        fetchCalled = true;
        return null;
      }
    }

    class MapUiStub extends Service {
      selectPlace() {}
      stopSearch() {}
    }

    this.owner.register('service:osm', OsmStub);
    this.owner.register('service:map-ui', MapUiStub);

    let model = {
      osmId: '789',
      osmType: 'node',
      // No geojson, but it's a node
    };

    await route.afterModel(model);

    assert.notOk(fetchCalled, 'fetchOsmObject should NOT be called for nodes');
  });
});
