import { module, test } from 'qunit';
import { visit, currentURL, click } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import sinon from 'sinon';

class MockOsmService extends Service {
  async getNearbyPois() {
    return [
      {
        osmId: '123',
        lat: 1,
        lon: 1,
        osmTags: { name: 'Test Place', amenity: 'cafe' },
        osmType: 'node',
      },
    ];
  }
  async getPoiById() {
    return {
      osmId: '123',
      lat: 1,
      lon: 1,
      osmTags: { name: 'Test Place', amenity: 'cafe' },
      osmType: 'node',
    };
  }
  async fetchOsmObject(id, type) {
    return {
      osmId: id,
      osmType: type,
      lat: 1,
      lon: 1,
      osmTags: { name: 'Test Place', amenity: 'cafe' },
      title: 'Test Place',
    };
  }
}

class MockStorageService extends Service {
  initialSyncDone = true;
  savedPlaces = [];
  findPlaceById() {
    return null;
  }
  isPlaceSaved() {
    return false;
  }
  loadPlacesInBounds() {
    return [];
  }
  get placesInView() {
    return [];
  }
  rs = {
    on: () => {},
  };
}

module('Acceptance | navigation', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:osm', MockOsmService);
    this.owner.register('service:storage', MockStorageService);
  });

  test('navigating from search results to place and back returns to search', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/search?lat=1&lon=1');
    assert.strictEqual(currentURL(), '/search?lat=1&lon=1');

    await click('.place-item');
    assert.ok(currentURL().includes('/place/'), 'Navigated to place');
    assert.true(mapUi.returnToSearch, 'Flag returnToSearch is set');

    // Click the back button in the sidebar
    await click('.back-btn');

    assert.strictEqual(
      currentURL(),
      '/search?lat=1&lon=1',
      'Returned to search results'
    );
  });

  test('closing the sidebar transitions back to search route when opened from search results', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/search?lat=1&lon=1');
    await click('.place-item'); // Sets returnToSearch = true

    assert.true(mapUi.returnToSearch, 'Flag is set upon entering place');

    // Click the Close (X) button
    await click('.close-btn');

    assert.dom('.sidebar').doesNotExist('Sidebar should be closed');
    assert.strictEqual(
      currentURL(),
      '/search?lat=1&lon=1',
      'Should transition back to search route'
    );
  });

  test('closing the sidebar when visiting a place directly transitions to index', async function (assert) {
    await visit('/place/osm:node:123');
    assert.ok(currentURL().includes('/place/'), 'Visited place directly');

    // Click the Close (X) button
    await click('.close-btn');

    assert.dom('.sidebar').doesNotExist('Sidebar should be closed');
    assert.strictEqual(currentURL(), '/', 'Should transition back to index');
  });

  test('navigating directly to place and back closes sidebar', async function (assert) {
    const backStub = sinon.stub(window.history, 'back');
    try {
      await visit('/place/osm:node:123');
      assert.ok(currentURL().includes('/place/'), 'Visited place directly');

      await click('.back-btn');

      assert.strictEqual(currentURL(), '/', 'Returned to index/map');
      assert.true(backStub.notCalled, 'window.history.back() was NOT called');
    } finally {
      backStub.restore();
    }
  });

  test('an empty search is not restored when navigating back from a place', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    // Nearby search that yields no results, but with a fetchable place
    this.owner.register(
      'service:osm',
      class extends Service {
        async getNearbyPois() {
          return [];
        }
        async fetchOsmObject(id, type) {
          return {
            osmId: id,
            osmType: type,
            lat: 1,
            lon: 1,
            osmTags: { name: 'Test Place', amenity: 'cafe' },
            title: 'Test Place',
          };
        }
      }
    );

    await visit('/search?lat=1&lon=1');
    assert.strictEqual(
      mapUi.currentSearch,
      null,
      'Empty search is not restorable'
    );

    // Simulate opening a place while the (empty) search route is active
    mapUi.returnToSearch = true;

    await visit('/place/osm:node:123');
    await click('.back-btn');

    assert.strictEqual(
      currentURL(),
      '/',
      'Back navigation does not reopen the empty search'
    );
  });
});
