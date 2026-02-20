import { module, test } from 'qunit';
import { visit, currentURL } from '@ember/test-helpers';
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
});
