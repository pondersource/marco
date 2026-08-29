import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import ActivityTimeline from 'marco/components/activity-timeline';
import { setupNostrMocks } from 'marco/tests/helpers/mock-nostr';

function noop() {}

module('Integration | Component | activity-timeline', function (hooks) {
  setupRenderingTest(hooks);
  setupNostrMocks(hooks);

  hooks.beforeEach(function () {
    this.noop = noop;
    this.emptyItems = [];
  });

  test('it renders a loading state', async function (assert) {
    await render(
      <template>
        <ActivityTimeline
          @items={{this.emptyItems}}
          @isLoading={{true}}
          @isConnected={{true}}
          @onSelect={{this.noop}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    assert.dom('.sidebar-loading').exists();
    assert.dom('.activity-list').doesNotExist();
  });

  test('it renders a not-connected state', async function (assert) {
    await render(
      <template>
        <ActivityTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{false}}
          @onSelect={{this.noop}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    assert.dom('.empty-state').includesText('Connect your Nostr account');
  });

  test('clicking "Connect your Nostr account" opens the Nostr connect modal', async function (assert) {
    await render(
      <template>
        <div id="modal-portal"></div>
        <ActivityTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{false}}
          @onSelect={{this.noop}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    assert.dom('.nostr-connect-modal').doesNotExist();

    await click('.empty-state a');

    assert.dom('.nostr-connect-modal').exists();
  });

  test('it renders an empty state when connected but no activity', async function (assert) {
    await render(
      <template>
        <ActivityTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onSelect={{this.noop}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    assert.dom('.empty-state').includesText('No activity yet');
  });

  test('it renders activity zap items', async function (assert) {
    this.items = [
      {
        type: 'zap',
        photoEventId: 'photo-1',
        photo: {
          url: 'https://x.com/photo.jpg',
          thumbUrl: 'https://x.com/thumb.jpg',
        },
        placeIdentifier: 'osm:node:111',
        senderPubkey: 'b'.repeat(64),
        amountSats: 21,
        message: 'Nice!',
        createdAt: 2000,
        senderName: 'Alice',
        senderAvatar: 'https://x.com/avatar.jpg',
        senderProfileLoading: false,
      },
      {
        type: 'zap',
        photoEventId: 'photo-2',
        photo: {
          url: 'https://x.com/photo2.jpg',
          thumbUrl: 'https://x.com/thumb2.jpg',
        },
        placeIdentifier: 'osm:node:222',
        senderPubkey: 'c'.repeat(64),
        amountSats: 100,
        message: null,
        createdAt: 1000,
        senderName: 'Bob',
        senderAvatar: null,
        senderProfileLoading: false,
      },
    ];

    await render(
      <template>
        <ActivityTimeline
          @items={{this.items}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onSelect={{this.noop}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    assert.dom('.activity-zap-item').exists({ count: 2 });
    assert.dom(this.element).includesText('Alice');
    assert.dom(this.element).includesText('21 ⚡');
    assert.dom(this.element).includesText('Bob');
    assert.dom(this.element).includesText('100 ⚡');
  });

  test('clicking the back button fires @onBack', async function (assert) {
    let backClicked = false;
    this.handleBack = () => {
      backClicked = true;
    };

    await render(
      <template>
        <ActivityTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onSelect={{this.noop}}
          @onBack={{this.handleBack}}
          @onClose={{this.noop}}
          @onNostrConnected={{this.noop}}
        />
      </template>
    );

    await click('.sidebar-header .back-btn');
    assert.true(backClicked);
  });
});
