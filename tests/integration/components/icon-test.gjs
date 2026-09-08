import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render } from '@ember/test-helpers';
import Icon from 'marco/components/icon';

module('Integration | Component | icon', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders default 16px square dimensions', async function (assert) {
    await render(<template><Icon @name="zap" /></template>);

    assert.dom('.icon').exists();
    assert.dom('.icon').hasAttribute('style', /width:16px;height:16px;/);
  });

  test('it renders custom square size with @size', async function (assert) {
    await render(<template><Icon @name="zap" @size={{24}} /></template>);

    assert.dom('.icon').hasAttribute('style', /width:24px;height:24px;/);
  });

  test('it supports custom @width and @height', async function (assert) {
    await render(
      <template><Icon @name="bitcoin" @width={{17}} @height={{22}} /></template>
    );

    assert.dom('.icon').hasAttribute('style', /width:17px;height:22px;/);
  });

  test('it allows @width to override while @height falls back to @size', async function (assert) {
    await render(
      <template><Icon @name="bitcoin" @width={{17}} @size={{22}} /></template>
    );

    assert.dom('.icon').hasAttribute('style', /width:17px;height:22px;/);
  });

  test('it allows @height to override while @width falls back to @size', async function (assert) {
    await render(
      <template><Icon @name="bitcoin" @height={{22}} @size={{18}} /></template>
    );

    assert.dom('.icon').hasAttribute('style', /width:18px;height:22px;/);
  });

  test('it supports explicit string units for width and height', async function (assert) {
    await render(
      <template><Icon @name="zap" @width="100%" @height="2rem" /></template>
    );

    assert.dom('.icon').hasAttribute('style', /width:100%;height:2rem;/);
  });

  test('it splats HTML attributes to the icon element', async function (assert) {
    await render(
      <template><Icon @name="zap" data-test-custom-icon="true" /></template>
    );

    assert.dom('[data-test-custom-icon="true"]').exists();
  });
});
