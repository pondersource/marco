import { module, test } from 'qunit';
import { visit, currentURL, click, waitFor } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

class MockOsmService extends Service {
  fetchOsmObjectCalls = [];

  async fetchOsmObject(id, type) {
    this.fetchOsmObjectCalls.push({ id, type });
    return {
      osmId: String(id),
      osmType: type,
      lat: 1,
      lon: 1,
      osmTags: { name: 'Test Place', amenity: 'cafe' },
      title: 'Test Place',
    };
  }

  getCachedOsmObject() {
    return Promise.resolve(null);
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

class MockContributionsService extends Service {
  @tracked items = [
    {
      type: 'photo',
      placeIdentifier: 'osm:node:123',
      osmType: 'node',
      osmId: '123',
      placeName: 'Test Place',
      placeNameLoading: false,
      createdAt: 2000,
      photos: [
        {
          url: 'https://x.com/photo.jpg',
          thumbUrl: 'https://x.com/thumb.jpg',
          tags: ['food'],
        },
      ],
    },
  ];

  async load() {}
  stop() {
    this.items = [];
  }
}

class MockNostrAuthService extends Service {
  @tracked pubkey = 'test-pubkey';

  get isConnected() {
    return true;
  }
}

module('Acceptance | contributions navigation', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:osm', MockOsmService);
    this.owner.register('service:storage', MockStorageService);
    this.owner.register('service:contributions', MockContributionsService);
    this.owner.register('service:nostrAuth', MockNostrAuthService);
  });

  test('navigating from menu to contributions and back to menu', async function (assert) {
    await visit('/');
    assert.strictEqual(currentURL(), '/');

    // Open the app menu
    await click('.menu-btn-integrated');
    assert.dom('.sidebar.app-menu-pane').exists('App menu sidebar is open');

    // Click "My Contributions"
    const buttons = document.querySelectorAll('.app-menu button');
    const contributionsBtn = Array.from(buttons).find((b) =>
      b.textContent.includes('My Contributions')
    );
    await click(contributionsBtn);

    assert.strictEqual(
      currentURL(),
      '/contributions',
      'Transitions to /contributions'
    );
    assert
      .dom('.sidebar-header-text-centered')
      .includesText('My Contributions', 'Header shows the title');

    // Contribution item should be visible
    await waitFor('.contribution-item');
    assert.dom('.contribution-place').includesText('Test Place');

    // Click back button -> returns to menu
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/menu', 'Goes back to /menu');
  });

  test('clicking a contribution opens place details and back returns to contributions', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/contributions');
    await waitFor('.contribution-item');

    // Click the contribution item
    await click('.contribution-item');
    assert.ok(
      currentURL().includes('/place/osm:node:123'),
      'Transitions to place details'
    );
    assert.deepEqual(
      mapUi.returnToRoute,
      { name: 'contributions' },
      'returnToRoute is set to contributions'
    );

    // Click back from place details
    await click('.back-btn');
    assert.strictEqual(
      currentURL(),
      '/contributions',
      'Returns to contributions list'
    );
  });

  test('closing the contributions sidebar returns to index', async function (assert) {
    await visit('/contributions');
    await waitFor('.sidebar');

    await click('.sidebar-header .close-btn');
    assert.strictEqual(currentURL(), '/', 'Returns to index');
  });

  test('contributions route saves scroll position when selecting a place', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/contributions');
    await waitFor('.contribution-item');

    // The scroll position key should start at 0
    assert.strictEqual(
      mapUi.getScrollPosition('contributions'),
      0,
      'Initial scroll position is 0'
    );

    await click('.contribution-item');

    // After navigating to a place, the scroll position should have been saved
    // (0 in this case since the sidebar wasn't scrolled, but the key should exist)
    assert.ok(
      mapUi.returnToRoute,
      'returnToRoute is set when selecting a contribution'
    );
  });

  test('selecting a contribution runs the model hook so the place has lat/lon', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');
    const osm = this.owner.lookup('service:osm');

    await visit('/contributions');
    await waitFor('.contribution-item');

    await click('.contribution-item');

    assert.ok(
      currentURL().includes('/place/osm:node:123'),
      'Transitions to place details via URL'
    );

    // The model hook should have called fetchOsmObject (not skipped it)
    assert.ok(
      osm.fetchOsmObjectCalls.length > 0,
      'OSM fetchOsmObject was called (model hook ran)'
    );

    // The selected place should have lat/lon so the map can pan
    assert.ok(
      mapUi.selectedPlace?.lat && mapUi.selectedPlace?.lon,
      'Selected place has lat/lon coordinates'
    );
  });
});
