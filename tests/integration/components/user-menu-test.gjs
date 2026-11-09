import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import UserMenu from 'marco/components/user-menu';

class MockOsmAuthService extends Service {
  @tracked isConfigured = true;
  @tracked isConnected = false;
  @tracked userDisplayName = null;

  loginCalled = false;
  logoutCalled = false;

  login() {
    this.loginCalled = true;
  }

  logout() {
    this.logoutCalled = true;
  }
}

class MockStorageService extends Service {
  @tracked connected = false;
  @tracked userAddress = null;
}

module('Integration | Component | user-menu', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:osmAuth', MockOsmAuthService);
    this.owner.register('service:storage', MockStorageService);
    this.osmAuth = this.owner.lookup('service:osmAuth');
  });

  test('it renders disconnected OSM state correctly', async function (assert) {
    this.osmAuth.isConnected = false;

    this.storageArg = {
      connected: false,
      userAddress: null,
    };
    this.onClose = () => {};

    await render(
      <template>
        <UserMenu @storage={{this.storageArg}} @onClose={{this.onClose}} />
      </template>
    );

    assert
      .dom('.account-list .account-item:nth-child(2) .account-info')
      .includesText('OpenStreetMap');
    assert
      .dom('.account-list .account-item:nth-child(2) button')
      .hasText('Connect');
    assert
      .dom('.account-list .account-item:nth-child(2) .account-status')
      .hasText('Not connected');

    await click('.account-list .account-item:nth-child(2) button');
    assert.true(
      this.osmAuth.loginCalled,
      'osmAuth.login() was called when Connect is clicked'
    );
  });

  test('it renders connected OSM state correctly', async function (assert) {
    this.osmAuth.isConnected = true;
    this.osmAuth.userDisplayName = 'TestMapper';

    this.storageArg = {
      connected: false,
      userAddress: null,
    };
    this.onClose = () => {};

    await render(
      <template>
        <UserMenu @storage={{this.storageArg}} @onClose={{this.onClose}} />
      </template>
    );

    assert
      .dom('.account-list .account-item:nth-child(2) .account-info')
      .includesText('OpenStreetMap');
    assert
      .dom('.account-list .account-item:nth-child(2) button')
      .hasText('Disconnect');
    assert
      .dom('.account-list .account-item:nth-child(2) .account-status')
      .hasText('TestMapper');

    await click('.account-list .account-item:nth-child(2) button');
    assert.true(
      this.osmAuth.logoutCalled,
      'osmAuth.logout() was called when Disconnect is clicked'
    );
  });

  test('it offers no sign-in button without a configured OSM client', async function (assert) {
    this.osmAuth.isConfigured = false;
    this.storageArg = { connected: false, userAddress: null };
    this.onClose = () => {};

    await render(
      <template>
        <UserMenu @storage={{this.storageArg}} @onClose={{this.onClose}} />
      </template>
    );

    assert.dom('.account-item:nth-child(2) button').doesNotExist();
    assert
      .dom('.account-item:nth-child(2) .account-status')
      .hasText('Account sign-in is unavailable on this deployment');
  });
});
