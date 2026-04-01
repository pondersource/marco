import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

class MockOsmAuthService extends Service {
  handleCallbackCalled = false;

  async handleCallback() {
    this.handleCallbackCalled = true;
    return Promise.resolve();
  }
}

class MockRouterService extends Service {
  transitionToArgs = [];

  transitionTo(...args) {
    this.transitionToArgs.push(args);
  }
}

module('Unit | Route | oauth/osm-callback', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:osmAuth', MockOsmAuthService);
    this.owner.register('service:router', MockRouterService);
  });

  test('it handles the callback and transitions to index', async function (assert) {
    let route = this.owner.lookup('route:oauth/osm-callback');
    let osmAuth = this.owner.lookup('service:osmAuth');
    let router = this.owner.lookup('service:router');

    await route.model();

    assert.true(
      osmAuth.handleCallbackCalled,
      'handleCallback was called on the osmAuth service'
    );
    assert.deepEqual(
      router.transitionToArgs,
      [['index']],
      'router transitioned back to index route'
    );
  });
});
