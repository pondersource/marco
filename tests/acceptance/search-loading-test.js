import { module, test } from 'qunit';
import {
  visit,
  click,
  fillIn,
  triggerEvent,
  currentURL,
} from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import { Promise } from 'rsvp';

class MockPhotonService extends Service {
  cancelAll() {}

  async search(query) {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (query === 'slow') {
      await new Promise((resolve) => setTimeout(resolve, 200));
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
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (category === 'slow_category') {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return [];
  }
  async getNearbyPois() {
    return [];
  }
}

module('Acceptance | search loading', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:photon', MockPhotonService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('search shows loading indicator but nearby search does not', async function (assert) {
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

    await searchPromise;
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

    await catPromise;
    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared after category search'
    );

    // 3. Nearby Search
    await visit('/search?lat=1&lon=1');
    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is NOT set for nearby search'
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

    // Verify loading state is cleared immediately
    assert.strictEqual(
      mapUi.loadingState,
      null,
      'Loading state is cleared immediately after clicking clear'
    );

    // Verify we are back on index (or at least query is gone)
    assert.strictEqual(currentURL(), '/', 'Navigated to index');
  });
});
