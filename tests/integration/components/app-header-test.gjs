import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, fillIn } from '@ember/test-helpers';
import AppHeader from 'marco/components/app-header';
import Service from '@ember/service';

module('Integration | Component | app-header', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the search box', async function (assert) {
    this.noop = () => {};

    class MockPhotonService extends Service {}
    class MockRouterService extends Service {}
    class MockMapUiService extends Service {}
    class MockMapService extends Service {}
    class MockSettingsService extends Service {
      showQuickSearchButtons = true;
    }

    this.owner.register('service:photon', MockPhotonService);
    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:map-ui', MockMapUiService);
    this.owner.register('service:map', MockMapService);
    this.owner.register('service:settings', MockSettingsService);

    await render(
      <template><AppHeader @onToggleMenu={{this.noop}} /></template>
    );

    assert.dom('header.app-header').exists();
    assert.dom('.search-box').exists('Search box is present in the header');
    assert.dom('.menu-btn-integrated').exists('Menu button is integrated');
  });

  test('typing in search box toggles .searching class on header-center', async function (assert) {
    this.noop = () => {};

    class MockPhotonService extends Service {
      search() {
        return [];
      }
    }
    class MockRouterService extends Service {}
    class MockMapUiService extends Service {
      setSearchBoxFocus() {}
      currentCenter = null;
    }
    class MockMapService extends Service {}
    class MockSettingsService extends Service {
      showQuickSearchButtons = true;
    }

    this.owner.register('service:photon', MockPhotonService);
    this.owner.register('service:router', MockRouterService);
    this.owner.register('service:map-ui', MockMapUiService);
    this.owner.register('service:map', MockMapService);
    this.owner.register('service:settings', MockSettingsService);

    await render(
      <template><AppHeader @onToggleMenu={{this.noop}} /></template>
    );

    assert.dom('.header-center').doesNotHaveClass('searching');

    await fillIn('.search-input', 'test');

    assert.dom('.header-center').hasClass('searching');

    await fillIn('.search-input', '');

    assert.dom('.header-center').doesNotHaveClass('searching');
  });
});
