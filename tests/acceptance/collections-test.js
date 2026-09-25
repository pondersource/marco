import { module, test } from 'qunit';
import { visit, currentURL, click, waitFor } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';

class MockOsmService extends Service {
  async fetchOsmObject() {
    return null;
  }
}

class MockStorageService extends Service {
  initialSyncDone = true;
  savedPlaces = [
    {
      id: 'place-123',
      title: 'Mountain Trail',
      geohash: 'u33dc0',
      createdAt: '2023-01-02T12:00:00.000Z',
      osmTags: { name: 'Mountain Trail' },
    },
    {
      id: 'place-456',
      title: 'Beach View',
      geohash: 'u33dc1',
      createdAt: '2023-01-03T12:00:00.000Z',
      osmTags: { name: 'Beach View' },
    },
  ];
  lists = [
    {
      id: 'to-go',
      title: 'Want to go',
      color: '#2e9e4f',
      placeRefs: [{ id: 'place-123', geohash: 'u33dc0' }],
    },
    { id: 'to-do', title: 'To do', color: '#2a7fff', placeRefs: [] },
  ];

  findPlaceById(id) {
    if (id === 'place-123') {
      return this.savedPlaces[0];
    }
    return null;
  }

  isPlaceSaved() {
    return true;
  }

  loadPlacesInBounds() {
    return [];
  }

  getPlacesInList(listId) {
    if (listId === 'to-go') {
      return Promise.resolve([this.savedPlaces[0]]);
    }
    return Promise.resolve([]);
  }

  rs = {
    on: () => {},
  };
}

module('Acceptance | collections navigation', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:osm', MockOsmService);
    this.owner.register('service:storage', MockStorageService);
  });

  test('navigating through the collections menu hierarchy, viewing list places, and going back', async function (assert) {
    // 1. Visit Home Map
    await visit('/');
    assert.strictEqual(currentURL(), '/');

    // 2. Open the App Menu overlay
    await click('.menu-btn-integrated');
    assert.dom('.sidebar.app-menu-pane').exists('App menu sidebar is open');
    assert
      .dom('.app-menu')
      .includesText('Saved Places', 'Menu contains Saved Places link');

    // 3. Transition to Saved Places index (list of lists)
    await click(document.querySelectorAll('.app-menu button')[0]); // Click "Saved Places"
    assert.strictEqual(currentURL(), '/lists', 'Transitions to /lists index');
    assert
      .dom('.sidebar-header-text-centered')
      .includesText(
        'Saved Places',
        'Header is centered and titled Saved Places'
      );
    assert
      .dom('.lists-index-item')
      .exists({ count: 3 }, 'Renders Saved plus our 2 mocked list items');
    assert
      .dom(document.querySelectorAll('.lists-index-item')[0])
      .includesText('Saved', 'Saved appears as the first list item');
    assert
      .dom(document.querySelectorAll('.lists-index-item')[0])
      .includesText('2 places', 'Saved shows the total saved places count');

    // 4. Transition to the synthetic Saved list
    await click(document.querySelectorAll('.lists-index-item')[0]);
    assert.strictEqual(
      currentURL(),
      '/lists/saved',
      'Transitions to /lists/saved'
    );

    await waitFor('.places-list');
    assert
      .dom(document.querySelectorAll('.places-list .place-name')[0])
      .hasText('Beach View', 'Saved Places shows newest saved place first');
    assert
      .dom(document.querySelectorAll('.places-list .place-name')[1])
      .hasText('Mountain Trail', 'Saved Places includes all saved places');

    // 5. Go back to the Saved Places index
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/lists', 'Goes back to /lists index');

    // 6. Transition to a specific real list (Want to go)
    await click(document.querySelectorAll('.lists-index-item')[1]); // Click "Want to go"
    assert.strictEqual(
      currentURL(),
      '/lists/to-go',
      'Transitions instantly to /lists/to-go'
    );

    // 7. Verify background loading spinner shows up, then results populate
    await waitFor('.places-list');
    assert
      .dom('.places-list .place-name')
      .hasText('Mountain Trail', 'Renders the saved place from the list');
    assert
      .dom('.places-list .place-type')
      .hasText('Saved place', 'Place type displays Saved place correctly');

    // 8. Click back button in collection list header
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/lists', 'Goes back to /lists index');

    // 9. Click back button in collections index header
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/menu', 'Goes back to main menu route');

    // 10. Close sidebar
    await click('.sidebar-header .close-btn');
    assert.strictEqual(currentURL(), '/', 'Sidebar closed and returned home');
  });

  test('clicking a place inside Saved Places sets returnToRoute and returns gracefully on back click', async function (assert) {
    await visit('/lists/saved');
    await waitFor('.places-list');

    await click('.place-item');
    assert.ok(
      currentURL().includes('/place/place-456'),
      'Transitions to the newest saved place details route'
    );

    await click('.back-btn');
    assert.strictEqual(
      currentURL(),
      '/lists/saved',
      'Returns gracefully back to the Saved Places view'
    );
  });

  test('clicking a place inside a collection sets returnToRoute and returns gracefully on back click', async function (assert) {
    await visit('/lists/to-go');
    await waitFor('.places-list');

    // Click on the place item to view details
    await click('.place-item');
    assert.ok(
      currentURL().includes('/place/place-123'),
      'Transitions to place details route'
    );

    // Click back from place details
    await click('.back-btn');
    assert.strictEqual(
      currentURL(),
      '/lists/to-go',
      'Returns gracefully back to lists/to-go list view'
    );
  });

  test('places inside Saved Places are sorted by createdAt descending', async function (assert) {
    class SortedMockStorageService extends Service {
      initialSyncDone = true;
      savedPlaces = [
        {
          id: 'place-oldest',
          title: 'Oldest Place',
          geohash: 'u33dc0',
          createdAt: '2023-01-01T12:00:00.000Z',
          osmTags: { name: 'Oldest Place' },
        },
        {
          id: 'place-newest',
          title: 'Newest Place',
          geohash: 'u33dc0',
          createdAt: '2023-01-03T12:00:00.000Z',
          osmTags: { name: 'Newest Place' },
        },
        {
          id: 'place-middle',
          title: 'Middle Place',
          geohash: 'u33dc0',
          createdAt: '2023-01-02T12:00:00.000Z',
          updatedAt: '2023-01-04T12:00:00.000Z',
          osmTags: { name: 'Middle Place' },
        },
      ];
      lists = [
        {
          id: 'to-go',
          title: 'Want to go',
          color: '#2e9e4f',
          placeRefs: [
            { id: 'place-oldest', geohash: 'u33dc0' },
            { id: 'place-newest', geohash: 'u33dc0' },
            { id: 'place-middle', geohash: 'u33dc0' },
          ],
        },
      ];

      findPlaceById(id) {
        return this.savedPlaces.find((p) => p.id === id) || null;
      }

      isPlaceSaved() {
        return true;
      }

      loadPlacesInBounds() {
        return [];
      }

      getPlacesInList(listId) {
        if (listId === 'to-go') {
          return Promise.resolve(this.savedPlaces);
        }
        return Promise.resolve([]);
      }

      rs = {
        on: () => {},
      };
    }

    this.owner.unregister('service:storage');
    this.owner.register('service:storage', SortedMockStorageService);

    await visit('/lists/saved');
    await waitFor('.places-list');

    const placeNames = Array.from(
      document.querySelectorAll('.places-list .place-name')
    ).map((el) => el.textContent.trim());

    assert.deepEqual(
      placeNames,
      ['Newest Place', 'Middle Place', 'Oldest Place'],
      'Saved Places are ordered by createdAt in descending order'
    );
  });

  test('returning from place details preserves scroll position without a loading flash', async function (assert) {
    const places = Array.from({ length: 40 }, (_, i) => ({
      id: `place-${i}`,
      title: `Place ${i}`,
      geohash: 'u33dc0',
      lat: 48.1,
      lon: 11.5,
      createdAt: new Date(2023, 0, 1, 12, 0, i).toISOString(),
      osmTags: { name: `Place ${i}` },
    }));

    class ManyPlacesStorageService extends Service {
      initialSyncDone = true;
      savedPlaces = places;
      lists = [
        {
          id: 'to-go',
          title: 'Want to go',
          color: '#2e9e4f',
          placeRefs: places.map((p) => ({ id: p.id, geohash: p.geohash })),
        },
      ];

      findPlaceById(id) {
        return this.savedPlaces.find((p) => p.id === id) || null;
      }

      isPlaceSaved() {
        return true;
      }

      loadPlacesInBounds() {
        return [];
      }

      getPlacesInList(listId) {
        if (listId === 'to-go') {
          return Promise.resolve(this.savedPlaces);
        }
        return Promise.resolve([]);
      }

      rs = {
        on: () => {},
      };
    }

    this.owner.unregister('service:storage');
    this.owner.register('service:storage', ManyPlacesStorageService);

    await visit('/lists/to-go');
    await waitFor('.places-list');

    const sidebarContent = document.querySelector('.sidebar-content');
    sidebarContent.scrollTop = 300;
    assert.strictEqual(sidebarContent.scrollTop, 300, 'List is scrolled');

    // Open place details from an item that is currently visible so the browser
    // does not scroll it back into view (which would reset our saved position),
    // then return via the back button.
    const visibleItem = document.querySelectorAll('.place-item')[5];
    await click(visibleItem);
    await waitFor('.sidebar-content');
    await click('.back-btn');
    await waitFor('.places-list');

    // Allow the restore-scroll requestAnimationFrame to run
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const restored = document.querySelector('.sidebar-content');
    assert.strictEqual(
      restored.scrollTop,
      300,
      'Scroll position is restored on return'
    );
    assert
      .dom('.sidebar-loading')
      .doesNotExist('No loading spinner flashes when returning');
  });
});
