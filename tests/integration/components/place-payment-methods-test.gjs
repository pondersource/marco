import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render } from '@ember/test-helpers';
import PlacePaymentMethods from 'marco/components/place-payment-methods';

module('Integration | Component | place-payment-methods', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders nothing when no payment tags are present', async function (assert) {
    await render(<template><PlacePaymentMethods @tags={{hash}} /></template>);
    assert.dom('.place-payment-methods').doesNotExist();

    const otherTags = { amenity: 'restaurant', name: 'Bistro' };
    await render(
      <template><PlacePaymentMethods @tags={{otherTags}} /></template>
    );
    assert.dom('.place-payment-methods').doesNotExist();
  });

  test('it renders cash and card icons when accepted with aria-description and no title attribute', async function (assert) {
    const tags = {
      'payment:cash': 'yes',
      'payment:cards': 'yes',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('.place-payment-methods').exists();
    assert.dom('[data-test-payment-method="cash"]').exists();
    assert
      .dom('[data-test-payment-method="cash"]')
      .doesNotHaveClass('is-denied');
    assert
      .dom('[data-test-payment-method="cash"]')
      .doesNotHaveAttribute('title');
    assert
      .dom('[data-test-payment-method="cash"]')
      .hasAttribute('aria-description', 'Cash accepted');
    assert
      .dom('[data-test-payment-method="cash"] > .icon')
      .hasAttribute('style', /width:22px;height:22px;color:currentColor/);
    assert.dom('[data-test-payment-method="cards"]').exists();
    assert
      .dom('[data-test-payment-method="cards"]')
      .doesNotHaveClass('is-denied');
    assert
      .dom('[data-test-payment-method="cards"]')
      .doesNotHaveAttribute('title');
    assert
      .dom('[data-test-payment-method="cards"]')
      .hasAttribute('aria-description', 'Cards accepted');
    assert
      .dom('[data-test-payment-method="cards"] > .icon')
      .hasAttribute('style', /width:22px;height:22px;color:currentColor/);
    assert.dom('[data-test-payment-method="bitcoin"]').doesNotExist();
  });

  test('it shows strike-through when cards are explicitly denied', async function (assert) {
    const tags = {
      'payment:cash': 'yes',
      'payment:cards': 'no',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('[data-test-payment-method="cards"]').exists();
    assert.dom('[data-test-payment-method="cards"]').hasClass('is-denied');
    assert
      .dom('[data-test-payment-method="cash"]')
      .doesNotHaveClass('is-denied');
  });

  test('it shows strike-through when cash is explicitly denied', async function (assert) {
    const tags = {
      'payment:cash': 'no',
      'payment:cards': 'yes',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('[data-test-payment-method="cash"]').exists();
    assert.dom('[data-test-payment-method="cash"]').hasClass('is-denied');
    assert
      .dom('[data-test-payment-method="cards"]')
      .doesNotHaveClass('is-denied');
  });

  test('it renders on-chain bitcoin without lightning zap badge', async function (assert) {
    const tags = {
      'currency:XBT': 'yes',
      'payment:onchain': 'yes',
      'payment:lightning': 'no',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('[data-test-payment-method="bitcoin"]').exists();
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .doesNotHaveClass('is-denied');
    assert.dom('[data-test-payment-badge="lightning"]').doesNotExist();
  });

  test('it renders bitcoin with lightning zap badge when lightning is accepted', async function (assert) {
    const tags = {
      'currency:XBT': 'yes',
      'payment:lightning': 'yes',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('[data-test-payment-method="bitcoin"]').exists();
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .doesNotHaveClass('is-denied');
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .doesNotHaveAttribute('title');
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .hasAttribute('aria-description', 'Bitcoin (Lightning)');
    assert
      .dom('[data-test-payment-method="bitcoin"] > .icon')
      .hasAttribute('style', /width:17px;height:22px;color:currentColor/);
    assert.dom('[data-test-payment-badge="lightning"]').exists();
    assert
      .dom('[data-test-payment-badge="lightning"] .icon')
      .hasClass('icon-filled');
    assert
      .dom('[data-test-payment-badge="lightning"] .icon')
      .hasAttribute('style', /width:13px/);
    assert
      .dom('[data-test-payment-badge="lightning"] .icon')
      .hasAttribute('style', /color:#fff/);
    assert
      .dom('[data-test-payment-badge="lightning"]')
      .doesNotHaveAttribute('title');
  });

  test('it renders bitcoin with strike-through when explicitly denied', async function (assert) {
    const tags = {
      'currency:XBT': 'no',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    assert.dom('[data-test-payment-method="bitcoin"]').exists();
    assert.dom('[data-test-payment-method="bitcoin"]').hasClass('is-denied');
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .doesNotHaveAttribute('title');
    assert
      .dom('[data-test-payment-method="bitcoin"]')
      .hasAttribute('aria-description', 'No Bitcoin');
  });

  test('it preserves stable order (cash, cards, bitcoin) regardless of whether denied or accepted', async function (assert) {
    const tags = {
      'payment:cash': 'no',
      'payment:cards': 'yes',
      'currency:XBT': 'yes',
      'payment:lightning': 'yes',
    };

    await render(<template><PlacePaymentMethods @tags={{tags}} /></template>);

    const methods = Array.from(
      this.element.querySelectorAll('[data-test-payment-method]')
    ).map((el) => el.getAttribute('data-test-payment-method'));

    assert.deepEqual(
      methods,
      ['cash', 'cards', 'bitcoin'],
      'icons stay in fixed positions: cash, cards, bitcoin'
    );
  });
});
