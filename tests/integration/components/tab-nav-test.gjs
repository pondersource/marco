import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import TabNav from 'marco/components/tab-nav';

module('Integration | Component | tab-nav', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders all tab buttons with labels', async function (assert) {
    this.tabs = [
      { label: 'Home', value: 'home' },
      { label: 'Explore', value: 'explore' },
    ];
    this.active = 'home';
    this.onChange = () => {};

    await render(
      <template>
        <TabNav
          @tabs={{this.tabs}}
          @active={{this.active}}
          @onChange={{this.onChange}}
        />
      </template>
    );

    assert.dom('.tab-nav-button').exists({ count: 2 });
    const buttons = this.element.querySelectorAll('.tab-nav-button');
    assert.strictEqual(buttons[0].textContent.trim(), 'Home');
    assert.strictEqual(buttons[1].textContent.trim(), 'Explore');
  });

  test('it applies is-active class to the active tab', async function (assert) {
    this.tabs = [
      { label: 'Home', value: 'home' },
      { label: 'Explore', value: 'explore' },
    ];
    this.active = 'explore';
    this.onChange = () => {};

    await render(
      <template>
        <TabNav
          @tabs={{this.tabs}}
          @active={{this.active}}
          @onChange={{this.onChange}}
        />
      </template>
    );

    const buttons = this.element.querySelectorAll('.tab-nav-button');
    assert.false(
      buttons[0].classList.contains('is-active'),
      'first tab is not active'
    );
    assert.true(
      buttons[1].classList.contains('is-active'),
      'second tab is active'
    );
  });

  test('clicking a tab fires onChange with the tab value', async function (assert) {
    this.tabs = [
      { label: 'Home', value: 'home' },
      { label: 'Explore', value: 'explore' },
    ];
    this.active = 'home';
    this.handleChange = (value) => {
      this.active = value;
    };

    await render(
      <template>
        <TabNav
          @tabs={{this.tabs}}
          @active={{this.active}}
          @onChange={{this.handleChange}}
        />
      </template>
    );

    const buttons = this.element.querySelectorAll('.tab-nav-button');
    await click(buttons[1]);

    assert.strictEqual(this.active, 'explore', 'onChange called with explore');
  });
});
