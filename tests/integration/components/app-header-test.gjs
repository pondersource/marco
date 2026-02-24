import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render } from '@ember/test-helpers';
import AppHeader from 'marco/components/app-header';

module('Integration | Component | app-header', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders the search box', async function (assert) {
    this.noop = () => {};
    await render(
      <template><AppHeader @onToggleMenu={{this.noop}} /></template>
    );

    assert.dom('header.app-header').exists();
    assert.dom('.search-box').exists('Search box is present in the header');
    assert.dom('.menu-btn-integrated').exists('Menu button is integrated');
  });
});
