import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import Service from '@ember/service';
import PlaceDetails from 'marco/components/place-details';

module('Integration | Component | place-details', function (hooks) {
  setupRenderingTest(hooks);

  class StorageService extends Service {
    lists = [
      { id: 'to-go', title: 'Want to go', color: '#ff00ff' },
      { id: 'to-do', title: 'To do', color: '#008000' },
    ];

    async storePlace(place) {
      return { ...place, id: '123', createdAt: new Date().toISOString() };
    }

    async removePlace() {
      return true;
    }

    async togglePlaceList() {
      return true;
    }
  }

  hooks.beforeEach(function () {
    this.owner.register('service:storage', StorageService);
  });

  test('it formats coordinates correctly', async function (assert) {
    const place = {
      title: 'Test Place',
      lat: 52.520006789,
      lon: 13.404954123,
      description: 'A place for testing.',
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    assert.dom('.place-details').exists();
    assert.dom('.place-details h3').hasText('Test Place');

    // Check for the formatted coordinates link text
    // "52.520007, 13.404954" (rounded)
    assert.dom('.meta-info a[href*="geo:"]').hasText('52.520007, 13.404954');
  });

  test('it handles missing coordinates gracefully', async function (assert) {
    const place = {
      title: 'Place without Coords',
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    assert.dom('.place-details h3').hasText('Place without Coords');
    assert.dom('.meta-info a[href*="geo:"]').doesNotExist();
  });

  test('it reveals the list manager when save is clicked', async function (assert) {
    const place = {
      title: 'Cool Cafe',
      lat: 10,
      lon: 10,
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Manager is initially hidden
    assert.dom('.place-lists-manager').doesNotExist();

    // Find the Save button
    // It's the first button in .actions
    const saveBtn = this.element.querySelector('.actions button');
    await click(saveBtn);

    // Manager should be visible now
    assert.dom('.place-lists-manager').exists();

    // Check for default lists from mock service
    assert.dom('.place-lists-manager').includesText('Want to go');
    assert.dom('.place-lists-manager').includesText('To do');
    assert.dom('.place-lists-manager').includesText('Saved');
  });

  test('it handles saving a new place via master toggle', async function (assert) {
    let storedPlace = null;

    // Override mock service specifically for this test to spy on storePlace
    class MockStorage extends Service {
      lists = [];
      async storePlace(place) {
        storedPlace = place;
        return { ...place, id: 'new-id', createdAt: new Date().toISOString() };
      }
    }
    this.owner.register('service:storage', MockStorage);

    const place = {
      title: 'New Spot',
      lat: 20,
      lon: 20,
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Open manager
    await click('.actions button');

    // Find master "Saved" toggle
    const masterToggle = this.element.querySelector(
      '.place-lists-manager .master-toggle input'
    );

    // It should be unchecked initially for a new place
    assert.dom(masterToggle).isNotChecked();

    // Click it to save
    await click(masterToggle);

    // Verify storePlace was called
    assert.ok(storedPlace, 'storePlace was called');
    assert.strictEqual(storedPlace.title, 'New Spot');
  });

  test('it handles removing a saved place via master toggle', async function (assert) {
    let removedPlace = null;
    let confirmCalled = false;

    // Mock confirm
    const originalConfirm = window.confirm;
    window.confirm = () => {
      confirmCalled = true;
      return true;
    };

    class MockStorage extends Service {
      lists = [];
      async removePlace(place) {
        removedPlace = place;
      }
    }
    this.owner.register('service:storage', MockStorage);

    const place = {
      id: 'saved-id',
      title: 'Saved Spot',
      lat: 30,
      lon: 30,
      createdAt: '2023-01-01', // Marks it as saved
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Open manager
    await click('.actions button');

    // Find master "Saved" toggle
    const masterToggle = this.element.querySelector(
      '.place-lists-manager .master-toggle input'
    );

    // It should be checked initially for a saved place
    assert.dom(masterToggle).isChecked();

    // Click it to remove
    await click(masterToggle);

    assert.ok(confirmCalled, 'confirm dialog was shown');
    assert.strictEqual(removedPlace.id, 'saved-id', 'removePlace was called');

    // Restore confirm
    window.confirm = originalConfirm;
  });

  test('it adds place to a list', async function (assert) {
    let listId = null;
    let placeArg = null;
    let shouldAdd = null;

    class MockStorage extends Service {
      lists = [{ id: 'favs', title: 'Favorites', color: 'red' }];
      async togglePlaceList(place, id, add) {
        placeArg = place;
        listId = id;
        shouldAdd = add;
      }
    }
    this.owner.register('service:storage', MockStorage);

    // Provide a place that is already saved
    const place = {
      id: 'p1',
      title: 'My Spot',
      createdAt: '2023-01-01',
      _listIds: [], // Not in any list yet
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Open manager
    await click('.actions button');

    // Find the checkbox for "Favorites"
    const checkbox = this.element.querySelectorAll(
      '.place-lists-manager input[type="checkbox"]'
    )[1]; // Index 1 because 0 is master toggle

    await click(checkbox);

    assert.strictEqual(listId, 'favs');
    assert.strictEqual(placeArg.id, 'p1');
    assert.true(shouldAdd);
  });
});
