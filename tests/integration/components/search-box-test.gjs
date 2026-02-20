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

    await render(<template><SearchBox /></template>);

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
    }
    this.owner.register('service:map-ui', MockMapUiService);

    // Mock Router Service
    class MockRouterService extends Service {
      transitionTo(routeName, options) {
        assert.step(
          `transitionTo: ${routeName} ${JSON.stringify(options)}`
        );
      }
    }
    this.owner.register('service:router', MockRouterService);

    await render(<template><SearchBox /></template>);

    await fillIn('.search-input', 'berlin');
    await click('.search-input'); // Focus
    // Trigger submit event on the form
    await this.element
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    assert.verifySteps([
      'transitionTo: search {"queryParams":{"q":"berlin","selected":null,"lat":"52.5200","lon":"13.4050"}}',
    ]);
  });

  test('it uses map center for biased search', async function (assert) {
    // Mock MapUi Service
    class MockMapUiService extends Service {
      currentCenter = { lat: 52.52, lon: 13.405 };
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

    await render(<template><SearchBox /></template>);

    await fillIn('.search-input', 'cafe');
    
    // Wait for debounce (300ms) + execution
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await delay(400);

    assert.verifySteps(['search: cafe, 52.52, 13.405']);
  });
});
