import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';

module('Unit | Service | map-ui', function (hooks) {
  setupTest(hooks);

  test('it handles loading state correctly', function (assert) {
    let service = this.owner.lookup('service:map-ui');

    // Initial state
    assert.strictEqual(
      service.loadingState,
      null,
      'loadingState starts as null'
    );

    // Start loading search A
    service.startLoading('search', 'A');
    assert.deepEqual(
      service.loadingState,
      { type: 'search', value: 'A' },
      'loadingState is set to search A'
    );

    // Stop loading search A (successful case)
    service.stopLoading('search', 'A');
    assert.strictEqual(
      service.loadingState,
      null,
      'loadingState is cleared when stopped with matching parameters'
    );
  });

  test('it handles race condition: stopLoading only clears if parameters match', function (assert) {
    let service = this.owner.lookup('service:map-ui');

    // 1. Start loading search A
    service.startLoading('search', 'A');
    assert.deepEqual(service.loadingState, { type: 'search', value: 'A' });

    // 2. Start loading search B (interruption)
    // In a real app, search B would start before search A finishes.
    service.startLoading('search', 'B');
    assert.deepEqual(
      service.loadingState,
      { type: 'search', value: 'B' },
      'loadingState updates to search B'
    );

    // 3. Search A finishes and tries to stop loading
    // The service should ignore this because current loading state is for B
    service.stopLoading('search', 'A');

    assert.deepEqual(
      service.loadingState,
      { type: 'search', value: 'B' },
      'loadingState remains search B even after stopping search A'
    );

    // 4. Search B finishes
    service.stopLoading('search', 'B');
    assert.strictEqual(
      service.loadingState,
      null,
      'loadingState is cleared when search B stops'
    );
  });
});
