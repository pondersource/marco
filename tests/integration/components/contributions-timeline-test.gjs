import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import ContributionsTimeline from 'marco/components/contributions-timeline';

function noop() {}

module('Integration | Component | contributions-timeline', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.noop = noop;
    this.emptyItems = [];
  });

  test('it renders a loading state', async function (assert) {
    await render(
      <template>
        <ContributionsTimeline
          @items={{this.emptyItems}}
          @isLoading={{true}}
          @isConnected={{true}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onSelect={{this.noop}}
        />
      </template>
    );

    assert.dom('.sidebar-loading').exists();
    assert.dom('.contributions-list').doesNotExist();
  });

  test('it renders a not-connected state', async function (assert) {
    await render(
      <template>
        <ContributionsTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{false}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onSelect={{this.noop}}
        />
      </template>
    );

    assert.dom('.empty-state').includesText('Connect your Nostr account');
  });

  test('it renders an empty state when connected but no contributions', async function (assert) {
    await render(
      <template>
        <ContributionsTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onSelect={{this.noop}}
        />
      </template>
    );

    assert.dom('.empty-state').includesText('No contributions yet');
  });

  test('it renders contribution items', async function (assert) {
    this.items = [
      {
        type: 'photo',
        placeIdentifier: 'osm:node:111',
        osmType: 'node',
        osmId: '111',
        placeName: 'Café One',
        placeNameLoading: false,
        createdAt: 2000,
        photos: [
          {
            url: 'https://x.com/1.jpg',
            thumbUrl: 'https://x.com/t1.jpg',
            tags: ['food'],
          },
        ],
      },
      {
        type: 'photo',
        placeIdentifier: 'osm:node:222',
        osmType: 'node',
        osmId: '222',
        placeName: 'Park Two',
        placeNameLoading: false,
        createdAt: 1000,
        photos: [
          {
            url: 'https://x.com/2.jpg',
            thumbUrl: 'https://x.com/t2.jpg',
            tags: [],
          },
        ],
      },
    ];

    await render(
      <template>
        <ContributionsTimeline
          @items={{this.items}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onBack={{this.noop}}
          @onClose={{this.noop}}
          @onSelect={{this.noop}}
        />
      </template>
    );

    assert.dom('.contribution-item').exists({ count: 2 });
    assert.dom(this.element).includesText('Café One');
    assert.dom(this.element).includesText('Park Two');
  });

  test('clicking the back button fires @onBack', async function (assert) {
    let backClicked = false;
    this.handleBack = () => {
      backClicked = true;
    };

    await render(
      <template>
        <ContributionsTimeline
          @items={{this.emptyItems}}
          @isLoading={{false}}
          @isConnected={{true}}
          @onBack={{this.handleBack}}
          @onClose={{this.noop}}
          @onSelect={{this.noop}}
        />
      </template>
    );

    await click('.sidebar-header .back-btn');
    assert.true(backClicked);
  });
});
