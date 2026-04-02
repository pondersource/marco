import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';

module('Unit | Service | osm-auth', function (hooks) {
  setupTest(hooks);

  let originalLocalStorage;
  let originalFetch;

  hooks.beforeEach(function () {
    // Stub localStorage
    let mockStorage = {};
    originalLocalStorage = window.localStorage;

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: (key) => mockStorage[key] || null,
        setItem: (key, value) => {
          mockStorage[key] = value.toString();
        },
        removeItem: (key) => {
          delete mockStorage[key];
        },
        clear: () => {
          mockStorage = {};
        },
      },
      writable: true,
    });

    // Stub fetch
    originalFetch = window.fetch;
    window.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          user: { display_name: 'MockedUser' },
        }),
      };
    };
  });

  hooks.afterEach(function () {
    window.localStorage = originalLocalStorage;
    window.fetch = originalFetch;
  });

  test('it restores session correctly when logged in', async function (assert) {
    let service = this.owner.factoryFor('service:osm-auth').create();

    // Stub the underlying oauthClient before it runs restoreSession (actually restoreSession runs in constructor, so we need to intercept it)
    // Because restoreSession runs in the constructor, we might need to overwrite it after, but it's async.
    // Let's just create it, let the original restoreSession fail or do nothing, and then we stub and re-call it.

    service.oauthClient.ready = Promise.resolve();
    service.oauthClient.isAuthorized = async () => true;
    window.localStorage.setItem('marco:osm_user_display_name', 'CachedName');

    await service.restoreSession();

    assert.true(service.isConnected, 'Service becomes connected');
    assert.strictEqual(
      service.userDisplayName,
      'CachedName',
      'Restores name from localStorage'
    );
  });

  test('it fetches user info when logged in but no cached name', async function (assert) {
    let service = this.owner.factoryFor('service:osm-auth').create();

    service.oauthClient.ready = Promise.resolve();
    service.oauthClient.isAuthorized = async () => true;
    service.oauthClient.getTokens = async () => ({ accessToken: 'fake-token' });
    // Ensure localStorage is empty for this key
    window.localStorage.removeItem('marco:osm_user_display_name');

    await service.restoreSession();

    assert.true(service.isConnected, 'Service becomes connected');
    assert.strictEqual(
      service.userDisplayName,
      'MockedUser',
      'Fetched name from API'
    );
    assert.strictEqual(
      window.localStorage.getItem('marco:osm_user_display_name'),
      'MockedUser',
      'Saved name to localStorage'
    );
  });

  test('it handles login()', async function (assert) {
    let service = this.owner.lookup('service:osm-auth');
    let requestCalled = false;
    service.oauthClient.requestAuthorizationCode = async () => {
      requestCalled = true;
    };

    await service.login();
    assert.true(
      requestCalled,
      'Delegates to oauthClient.requestAuthorizationCode()'
    );
  });

  test('it handles logout()', async function (assert) {
    let service = this.owner.lookup('service:osm-auth');
    service.isConnected = true;
    service.userDisplayName = 'ToBeCleared';
    window.localStorage.setItem('marco:osm_user_display_name', 'ToBeCleared');

    let resetCalled = false;
    service.oauthClient.reset = async () => {
      resetCalled = true;
    };

    await service.logout();

    assert.true(resetCalled, 'Delegates to oauthClient.reset()');
    assert.false(service.isConnected, 'isConnected is reset');
    assert.strictEqual(
      service.userDisplayName,
      null,
      'userDisplayName is reset'
    );
    assert.strictEqual(
      window.localStorage.getItem('marco:osm_user_display_name'),
      null,
      'localStorage is cleared'
    );
  });

  test('it handles the callback flow', async function (assert) {
    let service = this.owner.lookup('service:osm-auth');
    let receiveCodeCalled = false;
    let getTokensCalled = false;

    service.oauthClient.receiveCode = async () => {
      receiveCodeCalled = true;
    };
    service.oauthClient.getTokens = async () => {
      getTokensCalled = true;
      return { accessToken: 'fake-token' };
    };

    await service.handleCallback();

    assert.true(receiveCodeCalled, 'oauthClient.receiveCode was called');
    assert.true(getTokensCalled, 'oauthClient.getTokens was called');
    assert.true(service.isConnected, 'Service is connected after callback');
    assert.strictEqual(
      service.userDisplayName,
      'MockedUser',
      'User info fetched and set during callback'
    );
  });
});
