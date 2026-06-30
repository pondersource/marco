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
      osmTags: { name: 'Mountain Trail' },
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
      .includesText('Collections', 'Menu contains Collections link');

    // 3. Transition to Collections Index (List of lists)
    await click(document.querySelectorAll('.app-menu button')[0]); // Click "Collections"
    assert.strictEqual(currentURL(), '/lists', 'Transitions to /lists index');
    assert
      .dom('.sidebar-header-text-centered')
      .includesText('Collections', 'Header is centered and titled Collections');
    assert
      .dom('.lists-index-item')
      .exists({ count: 2 }, 'Renders our 2 mocked list items');

    // 4. Transition to a specific list (Want to go)
    await click(document.querySelectorAll('.lists-index-item')[0]); // Click "Want to go"
    assert.strictEqual(
      currentURL(),
      '/lists/to-go',
      'Transitions instantly to /lists/to-go'
    );

    // 5. Verify background loading spinner shows up, then results populate
    await waitFor('.places-list');
    assert
      .dom('.places-list .place-name')
      .hasText('Mountain Trail', 'Renders the saved place from the list');
    assert
      .dom('.places-list .place-type')
      .hasText('Saved place', 'Place type displays Saved place correctly');

    // 6. Click back button in collection list header
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/lists', 'Goes back to /lists index');

    // 7. Click back button in collections index header
    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/menu', 'Goes back to main menu route');

    // 8. Close sidebar
    await click('.sidebar-header .close-btn');
    assert.strictEqual(currentURL(), '/', 'Sidebar closed and returned home');
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
});
