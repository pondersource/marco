import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, fillIn, click, waitFor } from '@ember/test-helpers';
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
    await fillIn('.search-input', 'Resta');

    // Wait for debounce (300ms) + execution
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await delay(400);

    // The first result should be the category match
    assert.dom('.search-result-item').exists({ count: 1 });
    assert.dom('.result-title').hasText('Restaurants');

    // Click the result
    await click('.search-result-item');

    // Assert transition with lat/lon from map center
    assert.verifySteps([
      'transitionTo: search {"queryParams":{"q":"Restaurants","category":"restaurants","selected":null,"lat":"51.5074","lon":"-0.1278"}}',
    ]);
  });
});
