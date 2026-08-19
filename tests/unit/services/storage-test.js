import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

module('Unit | Service | storage', function (hooks) {
  setupTest(hooks);

  test('refreshPlace skips invalid places', async function (assert) {
    let service = this.owner.lookup('service:storage');
    let result = await service.refreshPlace({});
    assert.strictEqual(result, null);
  });

  test('refreshPlace detects coordinate drift', async function (assert) {
    let service = this.owner.lookup('service:storage');

    // Stub OSM Service
    let capturedOptions;
    class OsmStub extends Service {
      async fetchOsmObject(id, type, options) {
        capturedOptions = options;
        return {
          osmId: id,
          osmType: type,
          lat: 52.5201, // Changed significantly from 52.5200
          lon: 13.405,
          osmTags: { name: 'Foo' },
        };
      }
    }
    this.owner.register('service:osm', OsmStub);

    // Mock storage update
    let updatePlaceCalled = false;
    service.updatePlace = async (place) => {
      updatePlaceCalled = true;
      return place;
    };

    let place = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: { name: 'Foo' },
      title: 'Foo',
    };

    let result = await service.refreshPlace(place);

    assert.ok(updatePlaceCalled, 'updatePlace should be called');
    assert.strictEqual(result.lat, 52.5201, 'Latitude updated');
    assert.ok(
      capturedOptions?.forceFresh,
      'refreshPlace fetches fresh OSM data (forceFresh: true)'
    );
  });

  test('refreshPlace ignores tiny coordinate drift', async function (assert) {
    let service = this.owner.lookup('service:storage');

    class OsmStub extends Service {
      async fetchOsmObject(id, type) {
        return {
          osmId: id,
          osmType: type,
          lat: 52.5200005, // Tiny change (< 0.00001)
          lon: 13.405,
          osmTags: { name: 'Foo' },
        };
      }
    }
    this.owner.register('service:osm', OsmStub);

    let updatePlaceCalled = false;
    service.updatePlace = async () => {
      updatePlaceCalled = true;
    };

    let place = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: { name: 'Foo' },
      title: 'Foo',
    };

    await service.refreshPlace(place);

    assert.notOk(updatePlaceCalled, 'updatePlace should NOT be called');
  });

  test('refreshPlace detects tag changes', async function (assert) {
    let service = this.owner.lookup('service:storage');

    class OsmStub extends Service {
      async fetchOsmObject(id, type) {
        return {
          osmId: id,
          osmType: type,
          lat: 52.52,
          lon: 13.405,
          osmTags: { name: 'Bar' }, // Changed name
        };
      }
    }
    this.owner.register('service:osm', OsmStub);

    let updatePlaceCalled = false;
    service.updatePlace = async (place) => {
      updatePlaceCalled = true;
      return place;
    };

    let place = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: { name: 'Foo' },
      title: 'Foo',
    };

    let result = await service.refreshPlace(place);

    assert.ok(updatePlaceCalled, 'updatePlace should be called');
    assert.strictEqual(result.osmTags.name, 'Bar', 'Tags updated');
  });

  test('refreshPlace updates title if it was default', async function (assert) {
    let service = this.owner.lookup('service:storage');

    class OsmStub extends Service {
      async fetchOsmObject(id, type) {
        return {
          osmId: id,
          osmType: type,
          lat: 52.52,
          lon: 13.405,
          osmTags: { name: 'New Name' },
        };
      }
    }
    this.owner.register('service:osm', OsmStub);

    service.updatePlace = async (place) => place;

    let place = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: { name: 'Old Name' },
      title: 'Old Name', // Matches default
    };

    let result = await service.refreshPlace(place);

    assert.strictEqual(result.title, 'New Name', 'Title should update');
  });

  test('refreshPlace preserves custom title', async function (assert) {
    let service = this.owner.lookup('service:storage');

    class OsmStub extends Service {
      async fetchOsmObject(id, type) {
        return {
          osmId: id,
          osmType: type,
          lat: 52.52,
          lon: 13.405,
          osmTags: { name: 'New Name' },
        };
      }
    }
    this.owner.register('service:osm', OsmStub);

    service.updatePlace = async (place) => place;

    let place = {
      id: '123',
      osmId: '456',
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: { name: 'Old Name' },
      title: 'My Custom Place', // User renamed it
    };

    let result = await service.refreshPlace(place);

    assert.strictEqual(
      result.title,
      'My Custom Place',
      'Title should NOT update'
    );
    assert.strictEqual(
      result.osmTags.name,
      'New Name',
      'Tags should still update'
    );
  });
});
