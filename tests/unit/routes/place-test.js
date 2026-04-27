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
      selectPlace() {
        selectPlaceCalled = true;
      }
      stopSearch() {}
      showSidebar() {}
      hideSidebar() {}
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
      showSidebar() {}
      hideSidebar() {}
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
      showSidebar() {}
      hideSidebar() {}
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

  test('setupController triggers checkUpdates', async function (assert) {
    let route = this.owner.lookup('route:place');

    // Stub Storage Service
    let refreshPlaceCalled = false;
    class StorageStub extends Service {
      async refreshPlace(place) {
        refreshPlaceCalled = true;
        assert.strictEqual(place.id, '123', 'Passed correct place to storage');
        return {
          ...place,
          title: 'Updated Title',
        };
      }
    }

    // Stub MapUi Service
    let selectPlaceCalled = false;
    class MapUiStub extends Service {
      selectPlace(place, options) {
        selectPlaceCalled = true;
        assert.strictEqual(
          place.title,
          'Updated Title',
          'Selected updated place'
        );
        assert.ok(options.preventZoom, 'Prevented zoom on update');
      }
      stopSearch() {}
      showSidebar() {}
      hideSidebar() {}
    }

    this.owner.register('service:storage', StorageStub);
    this.owner.register('service:map-ui', MapUiStub);

    let model = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      title: 'Original Title',
    };

    let controller = {};

    // Trigger setupController
    route.setupController(controller, model);

    // checkUpdates is async and not awaited in setupController, so we need to wait a tick
    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(refreshPlaceCalled, 'refreshPlace should be called');
    assert.ok(
      selectPlaceCalled,
      'mapUi.selectPlace should be called with update'
    );
  });
});
