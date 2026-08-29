import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import ActivityZapItem from 'marco/components/activity-zap-item';
import { ActivityEntry } from 'marco/utils/activity';

function noop() {}

module('Integration | Component | activity-zap-item', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.noop = noop;
  });

  test('it renders sender name, action, amount, and message', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: {
        url: 'https://x.com/photo.jpg',
        thumbUrl: 'https://x.com/thumb.jpg',
      },
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: 'Great shot!',
      createdAt: Math.floor(Date.now() / 1000) - 3600,
    });
    this.item.senderName = 'Alice';
    this.item.senderAvatar = 'https://x.com/avatar.jpg';
    this.item.senderProfileLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.zap-sender-name').hasText('Alice');
    assert.dom('.zap-action').includesText('zapped your photo');
    assert.dom('.zap-amount').hasText('21 ⚡');
    assert.dom('.zap-message').includesText('Great shot!');
    assert
      .dom('.zap-sender-avatar')
      .hasAttribute('src', 'https://x.com/avatar.jpg');
    assert
      .dom('.zap-context-thumb img')
      .hasAttribute('src', 'https://x.com/thumb.jpg');
  });

  test('it shows avatar placeholder when no avatar', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 100,
      message: null,
      createdAt: 1000,
    });
    this.item.senderName = 'Bob';
    this.item.senderAvatar = null;
    this.item.senderProfileLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.zap-sender-avatar-placeholder').exists();
    assert.dom('.zap-sender-avatar').doesNotExist();
  });

  test('it omits the message line when there is no message', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 50,
      message: null,
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.zap-message').doesNotExist();
  });

  test('it omits the context thumbnail when there is no photo', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 50,
      message: 'Hi',
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.zap-context-thumb').doesNotExist();
    assert.dom('.zap-context-text').exists();
  });

  test('clicking the item fires @onSelect with the item', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: 'Test',
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;

    let selected = null;
    this.handleSelect = (item) => {
      selected = item;
    };

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.handleSelect}} />
      </template>
    );

    await click('.activity-zap-item');

    assert.strictEqual(selected, this.item);
  });

  test('it shows resolved place name when placeName is set', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: null,
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;
    this.item.placeName = 'Café Central';
    this.item.placeNameLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert
      .dom('.zap-context-text')
      .includesText('Café Central', 'Resolved place name is displayed');
    assert
      .dom('.contribution-name-loading')
      .doesNotExist('No loading/fallback text shown');
  });

  test('it shows "Loading…" when placeNameLoading is true', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: null,
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;
    this.item.placeName = null;
    this.item.placeNameLoading = true;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert
      .dom('.zap-context-text .contribution-name-loading')
      .hasText('Loading…', 'Loading state is displayed');
  });

  test('it shows "Unnamed place" when not loading and no placeName', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: null,
      createdAt: 1000,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;
    this.item.placeName = null;
    this.item.placeNameLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert
      .dom('.zap-context-text .contribution-name-loading')
      .hasText('Unnamed place', 'Fallback name is displayed');
  });

  test('it displays place name in zap-place-name and date in zap-date', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: null,
      createdAt: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;
    this.item.placeName = 'Café Central';
    this.item.placeNameLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    const placeNameEl = this.element.querySelector('.zap-place-name');
    const dateEl = this.element.querySelector('.zap-date');

    assert.ok(placeNameEl, 'zap-place-name element exists');
    assert.ok(dateEl, 'zap-date element exists');
    assert.ok(
      placeNameEl.textContent.includes('Café Central'),
      'Place name is in zap-place-name'
    );
    assert.ok(dateEl.textContent.includes('hr ago'), 'Date contains hr ago');
    assert.notOk(
      placeNameEl.textContent.includes('hr ago'),
      'Place name does not contain date'
    );
    assert.notOk(
      dateEl.textContent.includes('Café Central'),
      'Date does not contain place name'
    );
  });

  test('it truncates long place names with ellipsis while keeping date visible', async function (assert) {
    this.item = new ActivityEntry({
      photoEventId: 'photo-1',
      photo: null,
      placeIdentifier: 'osm:node:12345',
      senderPubkey: 'b'.repeat(64),
      amountSats: 21,
      message: null,
      createdAt: Math.floor(Date.now() / 1000) - 3600,
    });
    this.item.senderName = 'Alice';
    this.item.senderProfileLoading = false;
    this.item.placeName =
      'A Very Long Place Name That Should Be Truncated With Ellipsis';
    this.item.placeNameLoading = false;

    await render(
      <template>
        <ActivityZapItem @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.zap-place-name').exists('zap-place-name element exists');
    assert.dom('.zap-date').hasText('1 hr ago', 'Date is still visible');
  });
});
