import { module, test } from 'qunit';
import { visit, currentURL, waitFor, triggerEvent } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import sinon from 'sinon';

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

    // Stub window.fetch using Sinon
    // We want to intercept map style requests and let everything else through
    this.fetchStub = sinon.stub(window, 'fetch');

    this.fetchStub.callsFake(async (input, init) => {
      let url = input;
      if (typeof input === 'object' && input !== null && 'url' in input) {
        url = input.url;
      }

      if (
        typeof url === 'string' &&
        url.includes('tiles.openfreemap.org/styles/liberty')
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            version: 8,
            name: 'Liberty',
            sources: {
              openmaptiles: {
                type: 'vector',
                url: 'https://tiles.openfreemap.org/planet',
              },
            },
            layers: [
              {
                id: 'background',
                type: 'background',
                paint: {
                  'background-color': '#123456',
                },
              },
            ],
            glyphs:
              'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
            sprite: 'https://tiles.openfreemap.org/sprites/liberty',
          }),
        };
      }

      // Pass through to the original implementation
      return this.fetchStub.wrappedMethod(input, init);
    });
  });

  hooks.afterEach(function () {
    window.localStorage.removeItem('marco:map-view');
    // Restore the original fetch
    this.fetchStub.restore();
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

      // Wait for transition to index
      await new Promise((r) => setTimeout(r, 500));
      assert.strictEqual(
        currentURL(),
        '/',
        'Should have transitioned to index (closed sidebar)'
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
