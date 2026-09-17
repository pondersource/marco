import { module, test } from 'qunit';
import { visit, currentURL, click } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';

module('Acceptance | search', function (hooks) {
  setupApplicationTest(hooks);

  test('visiting /search with q parameter performs text search', async function (assert) {
    // Mock Photon Service
    class MockPhotonService extends Service {
      async search(query) {
        if (query === 'Berlin') {
          return [
            {
              title: 'Berlin',
              lat: 52.52,
              lon: 13.405,
              osmId: '123',
              osmType: 'R',
              description: 'City in Germany',
            },
            {
              title: 'Berlin Alexanderplatz',
              lat: 52.521,
              lon: 13.41,
              osmId: '456',
              osmType: 'N',
              description: 'Square in Berlin',
            },
          ];
        }
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock Storage Service (empty)
    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = {
        on: () => {},
      };
      // Add placesInView since map component accesses it
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }

    this.owner.register('service:storage', MockStorageService);

    await visit('/search?q=Berlin');

    assert.strictEqual(currentURL(), '/search?q=Berlin');
    assert.dom('.sidebar-header h2').includesText('Results');
    assert.dom('.places-list li').exists({ count: 2 });
    assert.dom('.places-list li:first-child .place-name').hasText('Berlin');
  });

  test('visiting /search with lat/lon performs nearby search', async function (assert) {
    // Mock Osm Service
    class MockOsmService extends Service {
      async getNearbyPois() {
        return [
          {
            title: 'Nearby Cafe',
            lat: 52.521,
            lon: 13.406,
            osmId: '789',
            osmType: 'N',
            _distance: 100, // Pre-calculated or ignored if mocked
          },
        ];
      }
    }
    this.owner.register('service:osm', MockOsmService);

    // Mock Storage Service (empty)
    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = {
        on: () => {},
      };
      // Add placesInView since map component accesses it
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }

    this.owner.register('service:storage', MockStorageService);

    await visit('/search?lat=52.52&lon=13.405');

    assert.strictEqual(currentURL(), '/search?lat=52.52&lon=13.405');
    assert.dom('.sidebar-header h2').includesText('Nearby');
    assert.dom('.places-list li').exists({ count: 1 });
    assert.dom('.places-list li .place-name').hasText('Nearby Cafe');
  });

  test('local bookmarks are merged into search results', async function (assert) {
    // Mock Photon Service
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock Storage Service with a bookmark
    class MockStorageService extends Service {
      savedPlaces = [
        {
          title: 'My Secret Base',
          lat: 50.0,
          lon: 10.0,
          osmId: '999',
          osmType: 'N',
          description: 'Top Secret',
        },
      ];
      findPlaceById(id) {
        if (id === '999') return this.savedPlaces[0];
        return null;
      }
      isPlaceSaved(id) {
        return !!this.findPlaceById(id);
      }
      rs = {
        on: () => {},
      };
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }
    this.owner.register('service:storage', MockStorageService);

    await visit('/search?q=Secret');

    assert.strictEqual(currentURL(), '/search?q=Secret');
    assert.dom('.places-list li').exists({ count: 1 });
    assert.dom('.places-list li .place-name').hasText('My Secret Base');
  });

  test('visiting /search with category parameter performs category search', async function (assert) {
    // Mock Osm Service
    class MockOsmService extends Service {
      async getCategoryPois(bounds, categoryId) {
        if (categoryId === 'coffee') {
          return [
            {
              title: 'Latte Art Cafe',
              lat: 52.52,
              lon: 13.405,
              osmId: '101',
              osmType: 'N',
              description: 'Best Coffee',
            },
          ];
        }
        return [];
      }
    }
    this.owner.register('service:osm', MockOsmService);

    // Mock Storage Service (empty)
    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = { on: () => {} };
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }
    this.owner.register('service:storage', MockStorageService);

    // Mock Map Service (needed for bounds)
    class MockMapService extends Service {
      getBounds() {
        return {
          minLat: 52.5,
          minLon: 13.4,
          maxLat: 52.6,
          maxLon: 13.5,
        };
      }
    }
    this.owner.register('service:map', MockMapService);

    await visit('/search?category=coffee&lat=52.52&lon=13.405');

    assert.strictEqual(
      currentURL(),
      '/search?category=coffee&lat=52.52&lon=13.405'
    );
    assert.dom('.places-list li').exists({ count: 1 });
    assert.dom('.places-list li .place-name').hasText('Latte Art Cafe');
    // Ensure it shows "Results" not "Nearby"
    assert.dom('.sidebar-header h2').includesText('Results');
  });

  test('search error handling prevents opening empty panel and shows toast', async function (assert) {
    // Mock Osm Service to throw an error
    class MockOsmService extends Service {
      async getCategoryPois() {
        throw new Error('Overpass request failed');
      }
    }
    this.owner.register('service:osm', MockOsmService);

    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = { on: () => {} };
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }
    this.owner.register('service:storage', MockStorageService);

    class MockMapService extends Service {
      getBounds() {
        return {
          minLat: 52.5,
          minLon: 13.4,
          maxLat: 52.6,
          maxLon: 13.5,
        };
      }
    }
    this.owner.register('service:map', MockMapService);

    await visit('/');

    try {
      await visit('/search?category=coffee&lat=52.52&lon=13.405');
    } catch {
      // Aborted transition throws, which is expected
    }

    assert.dom('.toast-notification').exists('Toast should be visible');
    assert
      .dom('.toast-notification')
      .hasText('Search request failed. Please try again.');
    assert.dom('.places-sidebar').doesNotExist('Results panel should not open');
  });

  test('search box query synchronized with active route query parameters', async function (assert) {
    // Mock Osm Service
    class MockOsmService extends Service {
      async getCategoryPois() {
        return [];
      }
    }
    this.owner.register('service:osm', MockOsmService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock Storage Service
    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = { on: () => {} };
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }
    this.owner.register('service:storage', MockStorageService);

    // Mock Map Service
    class MockMapService extends Service {
      getBounds() {
        return {
          minLat: 52.5,
          minLon: 13.4,
          maxLat: 52.6,
          maxLon: 13.5,
        };
      }
    }
    this.owner.register('service:map', MockMapService);

    // 1. Visit a search URL directly
    await visit('/search?q=Berlin');
    assert
      .dom('.search-input')
      .hasValue(
        'Berlin',
        'Search input is populated with search term on direct load'
      );

    // 2. Visit a category search URL
    await visit('/search?category=coffee&lat=52.52&lon=13.405');
    assert
      .dom('.search-input')
      .hasValue(
        'Coffee',
        'Search input is populated with mapped category label'
      );

    // 3. Go back to index
    await visit('/');
    assert
      .dom('.search-input')
      .hasValue('', 'Search input is cleared on transitioning to index');
  });

  test('closing the drawer clears the search route when there are no results', async function (assert) {
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    class MockStorageService extends Service {
      savedPlaces = [];
      findPlaceById() {
        return null;
      }
      isPlaceSaved() {
        return false;
      }
      rs = { on: () => {} };
      placesInView = [];
      loadPlacesInBounds() {
        return Promise.resolve();
      }
    }
    this.owner.register('service:storage', MockStorageService);

    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/search?q=nowhere');

    assert.dom('.empty-state').hasText('No results found.');
    assert.strictEqual(
      mapUi.currentSearch,
      null,
      'An empty search is not kept as a restorable search context'
    );

    await click('.close-btn');

    assert.dom('.sidebar').doesNotExist('Sidebar should be closed');
    assert.strictEqual(currentURL(), '/', 'Search route is cleared');
    assert.strictEqual(mapUi.searchResults.length, 0, 'Results are cleared');
  });
});
