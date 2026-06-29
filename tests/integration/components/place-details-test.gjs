import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import Service from '@ember/service';
import PlaceDetails from 'marco/components/place-details';

module('Integration | Component | place-details', function (hooks) {
  setupRenderingTest(hooks);

  class StorageService extends Service {
    lists = [
      { id: 'to-go', title: 'Want to go', color: '#2e9e4f' },
      { id: 'to-do', title: 'To do', color: '#2a7fff' },
    ];

    isPlaceSaved() {
      return false;
    }

    findPlaceById() {
      return null;
    }

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

    // Mock Router for all tests
    class MockRouter extends Service {
      transitionTo() {}
    }
    this.owner.register('service:router', MockRouter);
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
      isPlaceSaved() {
        return false;
      }
      findPlaceById() {
        return null;
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
    let removedPlaceId = null;

    class MockStorage extends Service {
      lists = [];
      async removePlace(place) {
        removedPlaceId = place.id;
      }
      isPlaceSaved() {
        return true;
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

    assert.strictEqual(removedPlaceId, 'saved-id', 'removePlace was called');

    assert.deepEqual(place._listIds, [], '_listIds was cleared on the object');
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
      isPlaceSaved() {
        return true;
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

  test('it respects storage service state over stale place object', async function (assert) {
    class MockStorage extends Service {
      lists = [];
      isPlaceSaved() {
        return false;
      }
      findPlaceById() {
        return null;
      }
    }
    this.owner.register('service:storage', MockStorage);

    const place = {
      id: 'stale-id',
      title: 'Stale Place',
      createdAt: '2023-01-01', // Looks saved
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Button should say "Save", not "Saved" because isPlaceSaved returns false
    assert.dom('.actions button').hasText('Save');
    assert.dom('.actions button').doesNotHaveClass('btn-secondary');
  });

  test('it aggregates phone and mobile tags without duplicates', async function (assert) {
    const place = {
      title: 'Phone Shop',
      osmTags: {
        phone: '+1-234-567-8900',
        'contact:phone': '+1-234-567-8900; +1 000 000 0000',
        mobile: '+1 987 654 3210',
        'contact:mobile': '+1 987 654 3210',
      },
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    // Use specific selector for the phone block since there's no cuisine or opening_hours
    const metaInfos = Array.from(
      this.element.querySelectorAll('.meta-info .content-with-icon')
    );
    const phoneBlock = metaInfos.find((el) => {
      const iconSpan = el.querySelector('span.icon[title="Phone"]');
      return !!iconSpan;
    });

    assert.ok(phoneBlock, 'Phone block is rendered');

    const links = phoneBlock.querySelectorAll('a[href^="tel:"]');
    assert.strictEqual(
      links.length,
      3,
      'Rendered exactly 3 unique phone links'
    );

    assert.strictEqual(links[0].getAttribute('href'), 'tel:+12345678900');
    assert.strictEqual(links[1].getAttribute('href'), 'tel:+10000000000');
    assert.strictEqual(links[2].getAttribute('href'), 'tel:+19876543210');

    assert.dom(links[0]).hasText('+1-234-567-8900');
    assert.dom(links[1]).hasText('+1 000 000 0000');
    assert.dom(links[2]).hasText('+1 987 654 3210');
  });

  test('it formats whatsapp tags into wa.me links', async function (assert) {
    const place = {
      title: 'Chat Shop',
      osmTags: {
        'contact:whatsapp': '+1 234-567 8900',
        whatsapp: '+44 987 654 321', // Also tests multiple values
      },
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    const metaInfos = Array.from(
      this.element.querySelectorAll('.meta-info .content-with-icon')
    );
    const whatsappBlock = metaInfos.find((el) => {
      const iconSpan = el.querySelector('span.icon[title="WhatsApp"]');
      return !!iconSpan;
    });

    assert.ok(whatsappBlock, 'WhatsApp block is rendered');

    const links = whatsappBlock.querySelectorAll('a[href^="https://wa.me/"]');
    assert.strictEqual(links.length, 2, 'Rendered exactly 2 WhatsApp links');

    // Verify it stripped the dashes and spaces for the wa.me URL
    assert.strictEqual(
      links[0].getAttribute('href'),
      'https://wa.me/+44987654321'
    );
    assert.strictEqual(
      links[1].getAttribute('href'),
      'https://wa.me/+12345678900'
    );

    // Verify it kept the dashes and spaces for the visible text
    assert.dom(links[0]).hasText('+44 987 654 321');
    assert.dom(links[1]).hasText('+1 234-567 8900');
  });

  test('it renders correct OpenStreetMap link for an OSM place', async function (assert) {
    const place = {
      title: 'OSM Place',
      osmId: '12345',
      osmType: 'node',
      lat: 52.520008,
      lon: 13.404954,
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    const osmLink = this.element.querySelector(
      '.meta-info a[href^="https://www.openstreetmap.org/node/12345"]'
    );
    assert.ok(osmLink, 'OpenStreetMap link is rendered');
    assert.strictEqual(
      osmLink.getAttribute('href'),
      'https://www.openstreetmap.org/node/12345'
    );

    assert.dom('button.btn-link').hasText('Add a photo');
  });

  test('it renders correct search-based OpenStreetMap link for a custom saved place', async function (assert) {
    class MockMapUi extends Service {
      currentCenter = { lat: 52.5, lon: 13.4 };
      currentZoom = 15.6;
    }
    this.owner.register('service:map-ui', MockMapUi);

    const place = {
      title: 'Custom Place',
      lat: 52.520008,
      lon: 13.404954,
    };

    await render(<template><PlaceDetails @place={{place}} /></template>);

    const osmLink = this.element.querySelector(
      '.meta-info a[href^="https://www.openstreetmap.org/search"]'
    );
    assert.ok(osmLink, 'OpenStreetMap search link is rendered');
    assert.strictEqual(
      osmLink.getAttribute('href'),
      'https://www.openstreetmap.org/search?lat=52.520008&lon=13.404954&zoom=16#map=16/52.50000/13.40000'
    );

    assert.dom('button.btn-link').doesNotExist();
  });
});
