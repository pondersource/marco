import { module, test } from 'qunit';
import { visit, currentURL, click, waitFor } from '@ember/test-helpers';
import { setupApplicationTest } from 'marco/tests/helpers';
import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

class MockActivityService extends Service {
  @tracked items = [
    {
      type: 'zap',
      photoEventId: 'photo-1',
      photo: {
        url: 'https://x.com/photo.jpg',
        thumbUrl: 'https://x.com/thumb.jpg',
      },
      placeIdentifier: 'osm:node:123',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: 'Great photo!',
      createdAt: Math.floor(Date.now() / 1000) - 3600,
      senderName: 'Alice',
      senderAvatar: 'https://x.com/avatar.jpg',
      senderProfileLoading: false,
    },
  ];

  async load() {}

  stop() {
    this.items = [];
  }
}

class MockNostrAuthService extends Service {
  @tracked pubkey = 'test-pubkey';

  get isConnected() {
    return true;
  }
}

class MockStorageService extends Service {
  initialSyncDone = true;
  savedPlaces = [];
  findPlaceById() {
    return null;
  }
  isPlaceSaved() {
    return false;
  }
  loadPlacesInBounds() {
    return [];
  }
  get placesInView() {
    return [];
  }
  rs = {
    on: () => {},
  };
}

class MockOsmService extends Service {
  async fetchOsmObject() {
    return {
      osmId: '123',
      osmType: 'node',
      lat: 1,
      lon: 1,
      osmTags: { name: 'Test Place', amenity: 'cafe' },
      title: 'Test Place',
    };
  }

  getCachedOsmObject() {
    return Promise.resolve(null);
  }
}

module('Acceptance | activity', function (hooks) {
  setupApplicationTest(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:activity', MockActivityService);
    this.owner.register('service:nostrAuth', MockNostrAuthService);
    this.owner.register('service:storage', MockStorageService);
    this.owner.register('service:osm', MockOsmService);
  });

  test('visiting /activity renders the sidebar with activity items', async function (assert) {
    await visit('/activity');
    assert.strictEqual(currentURL(), '/activity');

    assert.dom('.sidebar').exists('Sidebar is rendered');
    assert.dom('.sidebar-header-text-centered').includesText('Activity');
  });

  test('activity items are rendered as zap rows', async function (assert) {
    await visit('/activity');

    await waitFor('.activity-item');
    assert.dom('.activity-item').exists({ count: 1 });
    assert.dom('.sender-name').hasText('Alice');
    assert.dom('.action').includesText('zapped your photo');
    assert.dom('.amount').includesText('21 ⚡');
    assert.dom('.message').includesText('Great photo!');
  });

  test('closing the sidebar returns to index', async function (assert) {
    await visit('/activity');
    assert.strictEqual(currentURL(), '/activity');

    await click('.sidebar-header .close-btn');
    assert.strictEqual(currentURL(), '/', 'Returns to index');
  });

  test('clicking back button returns to menu', async function (assert) {
    await visit('/activity');

    await click('.sidebar-header .back-btn');
    assert.strictEqual(currentURL(), '/menu', 'Returns to menu');
  });

  test('clicking a zap item navigates to the place', async function (assert) {
    const mapUi = this.owner.lookup('service:map-ui');

    await visit('/activity');
    await waitFor('.activity-item');

    await click('.activity-item');

    assert.ok(
      currentURL().includes('/place/osm:node:123'),
      'Transitions to place details'
    );
    assert.deepEqual(
      mapUi.returnToRoute,
      { name: 'activity' },
      'returnToRoute is set to activity'
    );
  });
});
