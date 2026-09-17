import { module, test } from 'qunit';
import { visit, click, fillIn, currentURL, settled } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import { Promise } from 'rsvp';

let photonResolve;
let osmResolve;

class MockPhotonService extends Service {
  cancelAll() {}

  async search(query) {
    if (query === 'slow') {
      // Return a promise that we can manually resolve in the test
      // to avoid race conditions with native setTimeout
      return new Promise((resolve) => {
        photonResolve = () => {
          resolve([
            {
              title: 'Test Place',
              lat: 1,
              lon: 1,
              osmId: '123',
              osmType: 'node',
            },
          ]);
        };
      });
    }
    return [
      {
        title: 'Test Place',
        lat: 1,
        lon: 1,
        osmId: '123',
        osmType: 'node',
      },
    ];
  }
}

class MockOsmService extends Service {
  cancelAll() {}

  async getCategoryPois(bounds, category) {
    if (category === 'slow_category') {
      return new Promise((resolve) => {
        osmResolve = () => {
          resolve([]);
        };
      });
    }
    return [];
  }
  async getNearbyPois() {
    return new Promise((resolve) => {
      osmResolve = () => {
        resolve([
          {
            title: 'Nearby Place',
            lat: 1,
            lon: 1,
            osmId: '999',
            osmType: 'node',
          },
        ]);
      };
    });
  }
}

module('Acceptance | search loading', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    photonResolve = null;
    osmResolve = null;
    this.owner.register('service:photon', MockPhotonService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('search shows loading indicator for text, category and nearby searches', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    // 1. Text Search
    // Start a search and check for loading state immediately
    const searchPromise = visit('/search?q=slow');

    // We can't easily check the DOM mid-transition in acceptance tests without complicated helpers,
    // so we check the service state which drives the UI.
    // Wait a tiny bit for the route to start processing
    await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(
      mapUi.loadingState,
      { type: 'text', value: 'slow' },
      'Loading state is set for text search'
    );

    // Resolve the manual promise so the task can finish deterministically
    photonResolve();

    await searchPromise;
    await settled(); // Wait for ember-concurrency tasks to fully settle

    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared after text search'
    );

    // 2. Category Search
    const catPromise = visit('/search?category=slow_category&lat=1&lon=1');
    await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(
      mapUi.loadingState,
      { type: 'category', value: 'slow_category' },
      'Loading state is set for category search'
    );

    // Resolve the manual promise
    osmResolve();

    await catPromise;
    await settled();

    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared after category search'
    );

    // 3. Nearby Search
    const nearbyPromise = visit('/search?category=nearby&lat=1&lon=1');
    await new Promise((r) => setTimeout(r, 10));

    assert.deepEqual(
      mapUi.loadingState,
      { type: 'nearby', value: 'nearby' },
      'Loading state is set for nearby search'
    );

    // Resolve the manual promise
    osmResolve();

    await nearbyPromise;
    await settled();

    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared after nearby search'
    );
  });

  test('clearing search stops loading indicator', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    // 1. Start from index
    await visit('/');

    // 2. Type "slow" to trigger autocomplete (which is async)
    await fillIn('.search-input', 'slow');

    // 3. Submit search to trigger route loading
    click('.search-submit-btn'); // Intentionally no await to not block on transition

    // Wait for loading state to activate
    await new Promise((r) => setTimeout(r, 100));

    assert.deepEqual(
      mapUi.loadingState,
      { type: 'text', value: 'slow' },
      'Loading state is set'
    );

    // 4. Click the clear button (should be visible since input has value)
    await click('.search-clear-btn');
    // Wait for the click and transition to settle

    // Verify loading state is cleared immediately
    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared immediately after clicking clear'
    );

    // Clean up the dangling promise
    if (photonResolve) {
      photonResolve();
    }

    // Verify we are back on index (or at least query is gone)
    assert.strictEqual(currentURL(), '/', 'Navigated to index');
  });

  test('quick search pills visibility during category search transition', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');
    mapUi.currentZoom = 15;

    // Seed localStorage with a high zoom level to ensure quick search buttons show
    const highZoomState = {
      center: [13.4, 52.5],
      zoom: 18,
    };
    window.localStorage.setItem(
      'marco:map-view',
      JSON.stringify(highZoomState)
    );

    try {
      // Make sure quick search buttons setting is enabled
      const settings = this.owner.lookup('service:settings');
      settings.showQuickSearchButtons = true;

      // 1. Visit slowly loading category search
      const catPromise = visit('/search?category=slow_category&lat=1&lon=1');
      await new Promise((r) => setTimeout(r, 10));

      // Verify loading state is set and pills are visible (i.e. header-center does NOT have .searching)
      assert.ok(mapUi.loadingState, 'Search is loading');
      assert
        .dom('.header-center')
        .doesNotHaveClass(
          'searching',
          'Pills remain visible while search is loading'
        );

      // Resolve the promise with empty results
      osmResolve();
      await catPromise;
      await settled();

      // Verify search completed and since results are empty, pills are still visible
      assert.strictEqual(mapUi.searchResults.length, 0, 'No results found');
      assert
        .dom('.header-center')
        .doesNotHaveClass(
          'searching',
          'Pills remain visible after search completes with no results'
        );

      // 2. Now simulate a fast category search that returns results
      const osmService = this.owner.lookup('service:osm');
      osmService.getCategoryPois = async () => [
        {
          title: 'Latte Art Cafe',
          lat: 1,
          lon: 1,
          osmId: '101',
          osmType: 'N',
        },
      ];

      await visit('/search?category=coffee&lat=1&lon=1');

      // Verify search completed with results, so pills are hidden
      assert.ok(mapUi.searchResults.length > 0, 'Results found');
      assert
        .dom('.header-center')
        .hasClass(
          'searching',
          'Pills are hidden after search completes with results'
        );
    } finally {
      window.localStorage.removeItem('marco:map-view');
    }
  });
});
