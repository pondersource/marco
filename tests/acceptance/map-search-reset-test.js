import { module, test } from 'qunit';
import { visit, currentURL, waitFor, triggerEvent } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';

module('Acceptance | map search reset', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    // Seed localStorage with a high zoom level to ensure map is interactive
    const highZoomState = {
      center: [13.4, 52.5],
      zoom: 18,
    };
    window.localStorage.setItem(
      'marco:map-view',
      JSON.stringify(highZoomState)
    );
  });

  hooks.afterEach(function () {
    window.localStorage.removeItem('marco:map-view');
  });

  test('clicking the map clears the category search parameter', async function (assert) {
    // Mock OSM Service
    class MockOsmService extends Service {
      async getCategoryPois() {
        return [
          {
            title: 'Cafe Test',
            lat: 52.52,
            lon: 13.405,
            osmId: '123',
            osmType: 'N',
          },
        ];
      }
      async getNearbyPois() {
        return [];
      }
    }
    this.owner.register('service:osm', MockOsmService);

    // Mock Storage
    this.owner.register(
      'service:storage',
      class extends Service {
        rs = { on: () => {} };
        placesInView = [];
        savedPlaces = [];
        loadPlacesInBounds() {
          return Promise.resolve();
        }
        findPlaceById() {
          return null;
        }
      }
    );

    // 1. Visit a category search URL
    await visit('/search?category=coffee&lat=52.52&lon=13.405');

    assert.dom('.sidebar-header').includesText('Results');
    assert.ok(
      currentURL().includes('category=coffee'),
      'URL should have category param'
    );

    // 2. Click the map (First click closes sidebar)
    await waitFor('canvas', { timeout: 2000 });

    const canvas = document.querySelector('canvas');
    if (canvas) {
      // First Click (Close Sidebar)
      await triggerEvent(canvas, 'pointerdown', {
        clientX: 200,
        clientY: 200,
        button: 0,
        isPrimary: true,
      });
      await triggerEvent(canvas, 'pointerup', {
        clientX: 200,
        clientY: 200,
        button: 0,
        isPrimary: true,
      });
      await triggerEvent(canvas, 'click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      });

      // Wait for transition or UI update
      await new Promise((r) => setTimeout(r, 500));

      // Sidebar should be hidden, but we should stay on the search route
      assert.dom('.sidebar').doesNotExist('Sidebar should be closed');
      assert.ok(
        currentURL().includes('category=coffee'),
        'Should have stayed on the search route with markers intact'
      );

      // Second Click (Start new search)
      // Click slightly differently to ensure fresh event
      await triggerEvent(canvas, 'pointerdown', {
        clientX: 250,
        clientY: 250,
        button: 0,
        isPrimary: true,
      });
      await triggerEvent(canvas, 'pointerup', {
        clientX: 250,
        clientY: 250,
        button: 0,
        isPrimary: true,
      });
      await triggerEvent(canvas, 'click', {
        clientX: 250,
        clientY: 250,
        bubbles: true,
      });
    }

    // 3. Wait for transition
    await new Promise((r) => setTimeout(r, 1000));

    const newUrl = currentURL();
    assert.notOk(
      newUrl.includes('category=coffee'),
      `New URL ${newUrl} should not contain category param`
    );
    assert.ok(newUrl.includes('/search'), 'Should be on search route');
  });
});
