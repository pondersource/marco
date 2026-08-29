import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import Service from '@ember/service';

function makePhotoEvent({
  id,
  created_at,
  placeIdentifier = 'osm:node:123',
  url = 'https://example.com/photo.jpg',
}) {
  return {
    id,
    pubkey: 'pubkey-1',
    kind: 360,
    created_at,
    tags: [
      ['i', placeIdentifier],
      ['imeta', `url ${url}`, 'dim 800x600'],
    ],
  };
}

class MockStorageService extends Service {
  savedPlaces = [];
  findPlaceById() {
    return null;
  }
}

class MockNostrDataService extends Service {
  store = {
    timeline() {
      return {
        subscribe() {
          return { unsubscribe() {} };
        },
      };
    },
  };

  async loadMyContributions() {}
}

class MockOsmService extends Service {
  async getCachedOsmObject() {
    return null;
  }

  async fetchOsmObjectsBatch() {
    return new Map();
  }
}

module('Unit | Service | contributions', function (hooks) {
  setupTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:storage', MockStorageService);
    this.owner.register('service:nostrData', MockNostrDataService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('_updateItems groups events into entries and resolves bookmark names', function (assert) {
    const events = [makePhotoEvent({ id: 'e1', created_at: 1000 })];

    const service = this.owner.lookup('service:contributions');
    const storage = this.owner.lookup('service:storage');
    storage.savedPlaces = [{ id: '123', title: 'Bookmarked Café' }];
    storage.findPlaceById = (id) =>
      id === '123' ? { id: '123', title: 'Bookmarked Café' } : null;

    service._updateItems(events);

    assert.strictEqual(service.items.length, 1);
    assert.false(service.items[0].placeNameLoading);
    assert.strictEqual(service.items[0].placeName, 'Bookmarked Café');
  });

  test('stop clears items and resets resolver state', async function (assert) {
    const service = this.owner.lookup('service:contributions');
    const events = [makePhotoEvent({ id: 'e1', created_at: 1000 })];
    service._updateItems(events);

    assert.strictEqual(service.items.length, 1);

    service.stop();

    assert.strictEqual(service.items.length, 0, 'items cleared');
    const resolver = this.owner.lookup('service:place-name-resolver');
    assert.strictEqual(
      resolver._lastBatchSignature,
      '',
      'resolver state reset'
    );
  });

  test('multiple _updateItems calls re-group events correctly', function (assert) {
    const service = this.owner.lookup('service:contributions');
    const events1 = [makePhotoEvent({ id: 'e1', created_at: 1000 })];
    const events2 = [makePhotoEvent({ id: 'e2', created_at: 2000 })];

    service._updateItems(events1);
    assert.strictEqual(
      service.items.length,
      1,
      'first update creates one entry'
    );

    service._updateItems(events2);
    assert.strictEqual(
      service.items.length,
      1,
      'second update replaces with new group'
    );
  });
});
