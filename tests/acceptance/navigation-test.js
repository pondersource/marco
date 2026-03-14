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

  test('navigating from search results to place and back uses history', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');
    const backStub = sinon.stub(window.history, 'back');

    try {
      await visit('/search?lat=1&lon=1');
      assert.strictEqual(currentURL(), '/search?lat=1&lon=1');

      await click('.place-item');
      assert.ok(currentURL().includes('/place/'), 'Navigated to place');
      assert.true(mapUi.returnToSearch, 'Flag returnToSearch is set');

      // Click the back button in the sidebar
      await click('.back-btn');

      assert.true(backStub.calledOnce, 'window.history.back() was called');
    } finally {
      backStub.restore();
    }
  });

  test('closing the sidebar resets the returnToSearch flag', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/search?lat=1&lon=1');
    await click('.place-item'); // Sets returnToSearch = true

    assert.true(mapUi.returnToSearch, 'Flag is set upon entering place');

    // Click the Close (X) button
    await click('.close-btn');

    assert.strictEqual(currentURL(), '/', 'Returned to index');
    assert.false(mapUi.returnToSearch, 'Flag is reset after closing sidebar');
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
});
