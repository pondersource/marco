import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, fillIn, click, waitFor, focus } from '@ember/test-helpers';
import SearchBox from 'marco/components/search-box';
import Service from '@ember/service';

module('Integration | Component | search-box', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders and handles search input', async function (assert) {
    // Mock Photon Service
    class MockPhotonService extends Service {
      async search(query) {
        if (query === 'test') {
          return [
            {
              title: 'Test Place',
              description: 'A test description',
              lat: 10,
              lon: 20,
              osmId: '123',
              osmType: 'node',
            },
          ];
        }
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, ...args) {
        assert.step(`transitionTo: ${routeName} ${JSON.stringify(args)}`);
      }
    }
    this.owner.register('service:router', MockRouterService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    assert.dom('.search-input').exists();
    assert.dom('.search-results-popover').doesNotExist();

    // Type 'test'
    await fillIn('.search-input', 'test');

    // Wait for debounce and async search
    await waitFor('.search-results-popover', { timeout: 2000 });

    assert.dom('.search-result-item').exists({ count: 1 });
    assert.dom('.result-title').hasText('Test Place');
    assert.dom('.result-desc').hasText('A test description');

    // Click result
    await click('.search-result-item');

    assert.verifySteps(['transitionTo: place ["osm:node:123"]']);
    assert
      .dom('.search-results-popover')
      .doesNotExist('Popover closes after selection');
  });

  test('it handles submit for full search', async function (assert) {
    // Mock Photon Service
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, options) {
        assert.step(`transitionTo: ${routeName} ${JSON.stringify(options)}`);
      }
    }
    this.owner.register('service:router', MockRouterService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    await fillIn('.search-input', 'berlin');
    await click('.search-input'); // Focus
    // Trigger submit event on the form
    await this.element
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    assert.verifySteps([
      'transitionTo: search {"queryParams":{"q":"berlin","selected":null,"category":null,"lat":"52.5200","lon":"13.4050"}}',
    ]);
  });

  test('it uses map center for biased search', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search(query, lat, lon) {
        assert.step(`search: ${query}, ${lat}, ${lon}`);
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    await fillIn('.search-input', 'cafe');

    // Wait for debounce (300ms) + execution
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await delay(400);

    assert.verifySteps(['search: cafe, 52.52, 13.405']);
  });

  test('it allows typing even when controlled by parent with a query argument', async function (assert) {
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    this.query = '';
    this.updateQuery = (val) => {
      this.set('query', val);
    };
    this.noop = () => {};

    await render(
      <template>
        <SearchBox
          @query={{this.query}}
          @onQueryChange={{this.updateQuery}}
          @onToggleMenu={{this.noop}}
        />
      </template>
    );

    // Initial state
    assert.dom('.search-input').hasValue('');

    // Simulate typing
    await fillIn('.search-input', 't');
    assert.dom('.search-input').hasValue('t', 'Input should show "t"');

    await fillIn('.search-input', 'te');
    assert.dom('.search-input').hasValue('te', 'Input should show "te"');

    // Simulate external update (e.g. chip click)
    this.set('query', 'restaurant');
    // wait for re-render
    await click('.search-input'); // just to trigger a change cycle or ensure stability
    assert
      .dom('.search-input')
      .hasValue('restaurant', 'Input should update from external change');
  });

  test('it triggers category search with current location when clicking category result', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 51.5074, lon: -0.1278 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, options) {
        assert.step(`transitionTo: ${routeName} ${JSON.stringify(options)}`);
      }
    }
    this.owner.register('service:router', MockRouterService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    // Type "Resta" to trigger "Restaurants" category match
    await focus('.search-input');
    await fillIn('.search-input', 'Resta');

    await waitFor('.search-result-item');

    const resultItems = Array.from(
      this.element.querySelectorAll('.search-result-item')
    );
    const categoryResult = resultItems.find((item) =>
      item.textContent.includes('Restaurants')
    );

    assert.ok(categoryResult, 'Restaurants category result is shown');

    // Click the result
    await click(categoryResult);

    // Assert transition with lat/lon from map center
    assert.verifySteps([
      'transitionTo: search {"queryParams":{"q":"Restaurants","category":"restaurants","selected":null,"lat":"51.5074","lon":"-0.1278"}}',
    ]);
  });

  test('it includes, deduplicates, and prioritizes saved places in search results', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, id) {
        assert.step(`transitionTo: ${routeName} ["${id}"]`);
      }
    }
    this.owner.register('service:router', MockRouterService);

    // Mock Storage Service
    class MockStorageService extends Service {
      lists = [{ id: 'favs', title: 'Favorites' }];
      savedPlaces = [
        {
          title: 'Awesome Coffee',
          lat: 52.5,
          lon: 13.4,
          osmId: '999',
          osmType: 'node',
          _listIds: ['favs'],
        },
      ];
    }
    this.owner.register('service:storage', MockStorageService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search(query) {
        if (query === 'coffee') {
          return [
            {
              title: 'Awesome Coffee',
              osmId: '999',
              osmType: 'node',
              description: 'Duplicate to be removed',
            },
            {
              title: 'Other Coffee',
              osmId: '888',
              osmType: 'node',
              description: 'A different coffee shop',
            },
          ];
        }
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    // Type "coffee" to trigger matches in Category, Saved, and Photon
    await fillIn('.search-input', 'coffee');
    await waitFor('.search-results-popover', { timeout: 2000 });

    const resultItems = Array.from(
      this.element.querySelectorAll('.search-result-item')
    );

    // Should be exactly 3 items:
    // 1. Category (Coffee)
    // 2. Saved (Awesome Coffee)
    // 3. Photon (Other Coffee)
    // (The Photon duplicate of "Awesome Coffee" is removed)
    assert.strictEqual(resultItems.length, 3, 'Renders exactly 3 items');

    // 1. Category
    assert.ok(
      resultItems[0].textContent.includes('Coffee'),
      'First item is the category match'
    );
    assert
      .dom(resultItems[0].querySelector('.result-icon svg'))
      .hasClass('feather-search', 'Category uses search icon');

    // 2. Saved Place
    assert.ok(
      resultItems[1].textContent.includes('Awesome Coffee'),
      'Second item is the saved place match'
    );
    assert.ok(
      resultItems[1].textContent.includes('Saved place'),
      'Saved place has correct description text'
    );
    assert
      .dom(resultItems[1].querySelector('.result-icon svg'))
      .hasClass('feather-bookmark', 'Saved place uses bookmark icon');

    // 3. Photon Match
    assert.ok(
      resultItems[2].textContent.includes('Other Coffee'),
      'Third item is the unique photon result'
    );

    // Click the Saved Place
    await click(resultItems[1]);

    assert.verifySteps(['transitionTo: place ["osm:node:999"]']);
  });

  test('it requires 3 or more characters to match saved places', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo() {}
    }
    this.owner.register('service:router', MockRouterService);

    // Mock Storage Service
    class MockStorageService extends Service {
      lists = [{ id: 'favs', title: 'Favorites' }];
      savedPlaces = [
        {
          title: 'Awesome Coffee',
          lat: 52.5,
          lon: 13.4,
          osmId: '999',
          osmType: 'node',
          _listIds: ['favs'],
        },
      ];
    }
    this.owner.register('service:storage', MockStorageService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search(query) {
        if (query === 'aw' || query === 'awe') {
          return [
            {
              title: 'Aww Some Place',
              osmId: '111',
              osmType: 'node',
            },
          ];
        }
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    // Type "aw" (2 characters)
    await fillIn('.search-input', 'aw');
    await waitFor('.search-results-popover', { timeout: 2000 });

    let resultItems = Array.from(
      this.element.querySelectorAll('.search-result-item')
    );

    // Should only show Photon match since 'aw' is < 3 characters
    assert.strictEqual(
      resultItems.length,
      1,
      'Renders exactly 1 item for 2 chars'
    );
    assert.ok(
      resultItems[0].textContent.includes('Aww Some Place'),
      'Shows photon match'
    );
    assert.notOk(
      resultItems.some((item) => item.textContent.includes('Awesome Coffee')),
      'Saved place is NOT shown for 2 char query'
    );

    // Type "awe" (3 characters)
    await fillIn('.search-input', 'awe');
    await waitFor('.search-results-popover', { timeout: 2000 });

    resultItems = Array.from(
      this.element.querySelectorAll('.search-result-item')
    );

    // Should now show Saved Place and Photon match
    assert.strictEqual(
      resultItems.length,
      2,
      'Renders exactly 2 items for 3 chars'
    );
    assert.ok(
      resultItems.some((item) => item.textContent.includes('Awesome Coffee')),
      'Saved place is now shown'
    );
    assert.ok(
      resultItems.some((item) =>
        item.textContent.includes('Saved place (Favorites)')
      ),
      'List names are appended to the description'
    );
  });

  test('it navigates to internal ID for custom saved places without an OSM ID', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
      setSearchBoxFocus() {}
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, id) {
        assert.step(`transitionTo: ${routeName} ["${id}"]`);
      }
    }
    this.owner.register('service:router', MockRouterService);

    // Mock Storage Service (Custom Place)
    class MockStorageService extends Service {
      savedPlaces = [
        {
          id: 'custom-1234',
          title: 'My Custom Home',
          lat: 52.5,
          lon: 13.4,
          // Notice NO osmId or osmType
        },
      ];
    }
    this.owner.register('service:storage', MockStorageService);

    // Mock Photon Service
    class MockPhotonService extends Service {
      async search() {
        return [];
      }
    }
    this.owner.register('service:photon', MockPhotonService);

    this.noop = () => {};
    await render(
      <template><SearchBox @onToggleMenu={{this.noop}} /></template>
    );

    // Type 3 chars to trigger saved place match
    await fillIn('.search-input', 'cus');
    await waitFor('.search-results-popover', { timeout: 2000 });

    const resultItems = Array.from(
      this.element.querySelectorAll('.search-result-item')
    );

    // Ensure our custom place is rendered
    const customResult = resultItems.find((item) =>
      item.textContent.includes('My Custom Home')
    );
    assert.ok(customResult, 'Custom place is rendered');

    // Click it
    await click(customResult);

    // Verify it navigated using the internal ID, NOT a search query
    assert.verifySteps(['transitionTo: place ["custom-1234"]']);
  });
});
