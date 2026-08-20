import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click, fillIn, waitFor } from '@ember/test-helpers';
import Service from '@ember/service';
import ZapPhotoModal from 'marco/components/zap-photo-modal';
import { setupNostrMocks } from 'marco/tests/helpers/mock-nostr';
import sinon from 'sinon';

const USER_A = 'a'.repeat(64);

class MockToastService extends Service {
  show() {}
}

module('Integration | Component | zap-photo-modal', function (hooks) {
  setupRenderingTest(hooks);
  setupNostrMocks(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:toast', MockToastService);

    this.nostrZap = this.owner.lookup('service:nostrZap');
    this.toast = this.owner.lookup('service:toast');

    this.photo = {
      eventId: 'event1',
      pubkey: USER_A,
      url: 'https://example.com/photo.jpg',
    };
  });

  hooks.afterEach(function () {
    sinon.restore();
  });

  test('it renders the amount slider when lightning address is available', async function (assert) {
    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    assert.dom('.zap-slider').exists('slider is rendered');
    assert.dom('.zap-amount').exists('amount is displayed');
    assert
      .dom('.lightning-address-text')
      .hasText('user@example.com', 'lightning address is shown');
    assert.dom('.lightning-badge').hasText('Lightning', 'badge is shown');
  });

  test('it shows error when user has no lightning address', async function (assert) {
    this.nostrZap._lightningAddress = null;

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    assert
      .dom('.alert-error')
      .exists('error message is shown when no lightning address');
    assert
      .dom('.edit-actions .btn-primary')
      .isDisabled('zap button is disabled when no address');
  });

  test('it shows error when LNURL does not support Nostr zaps', async function (assert) {
    this.nostrZap._endpoint = {
      ...this.nostrZap._endpoint,
      allowsNostr: false,
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    assert.dom('.alert-error').exists('error shown when allowsNostr is false');
    assert
      .dom('.edit-actions .btn-primary')
      .isDisabled('zap button is disabled');
  });

  test('it performs zap flow when Zap button is clicked', async function (assert) {
    const zapSpy = sinon.spy(this.nostrZap, 'zap');
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} @onClose={{this.handleClose}} />
      </template>
    );

    assert
      .dom('.edit-actions .btn-primary')
      .isNotDisabled('zap button is enabled when endpoint is valid');

    await click('.edit-actions .btn-primary');

    assert.ok(zapSpy.calledOnce, 'nostrZap.zap was called');
    assert.deepEqual(
      zapSpy.firstCall.args[0],
      this.photo,
      'zap was called with the photo'
    );
    assert.strictEqual(
      zapSpy.firstCall.args[1],
      1_000_000,
      'zap amount is 1000 sats in millisats'
    );

    await waitFor('.qr-code-container');

    assert.dom('.qr-code-container').exists('QR code is shown');
    assert.dom('.zap-pay-prompt').exists('payment prompt is shown');
    assert.notOk(closed, 'modal was not closed by clicking the Zap button');
  });

  test('it passes the message to the zap call', async function (assert) {
    const zapSpy = sinon.spy(this.nostrZap, 'zap');

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    await fillIn('.form-group textarea', 'Great photo!');

    await click('.edit-actions .btn-primary');

    assert.ok(zapSpy.calledOnce, 'nostrZap.zap was called');
    assert.strictEqual(
      zapSpy.firstCall.args[2],
      'Great photo!',
      'message is passed to zap'
    );
  });

  test('it shows WebLN button when available', async function (assert) {
    this.nostrZap._webLNAvailable = true;

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    await click('.edit-actions .btn-primary');
    await waitFor('.webln-pay-btn');

    assert.dom('.webln-pay-btn').exists('WebLN button is shown when available');
  });

  test('it shows success after WebLN payment', async function (assert) {
    this.nostrZap._webLNAvailable = true;

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    await click('.edit-actions .btn-primary');
    await waitFor('.webln-pay-btn');
    await click('.webln-pay-btn');

    await waitFor('.zap-success');

    assert.dom('.zap-success').exists('success state is shown');
    assert.dom('.zap-success h4').hasText('Zap Sent!', 'success title');
  });

  test('it shows success when a matching zap receipt is received', async function (assert) {
    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} />
      </template>
    );

    await click('.edit-actions .btn-primary');
    await waitFor('.qr-code-container');

    assert.dom('.qr-code-container').exists('QR code is shown');

    assert.ok(
      this.nostrZap._receiptCallback,
      'receipt subscription was started'
    );

    this.nostrZap._receiptCallback();

    await waitFor('.zap-success');

    assert.dom('.zap-success').exists('success state is shown after receipt');
    assert.notOk(
      this.nostrZap._receiptCallback,
      'receipt subscription was cleaned up'
    );
  });

  test('it calls onClose when close button is clicked', async function (assert) {
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} @onClose={{this.handleClose}} />
      </template>
    );

    await click('.close-modal-btn');

    assert.ok(closed, 'onClose was called');
  });

  test('it calls onClose when Cancel button is clicked', async function (assert) {
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} @onClose={{this.handleClose}} />
      </template>
    );

    await click('.edit-actions .btn-outline');

    assert.ok(closed, 'onClose was called from Cancel button');
  });

  test('it does not close when clicking inside the modal body', async function (assert) {
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} @onClose={{this.handleClose}} />
      </template>
    );

    await click('.zap-photo-modal');

    assert.notOk(closed, 'onClose was not called when clicking inside modal');
  });

  test('it closes when clicking the overlay background', async function (assert) {
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="modal-portal"></div>
        <ZapPhotoModal @photo={{this.photo}} @onClose={{this.handleClose}} />
      </template>
    );

    await click('.modal-overlay');

    assert.ok(closed, 'onClose was called when clicking overlay');
  });
});
