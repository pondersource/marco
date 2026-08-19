import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click, settled } from '@ember/test-helpers';
import ContributionPhoto from 'marco/components/contribution-photo';
import { ContributionEntry } from 'marco/utils/contributions';

function noop() {}

module('Integration | Component | contribution-photo', function (hooks) {
  setupRenderingTest(hooks);

  hooks.beforeEach(function () {
    this.noop = noop;
  });

  test('it renders the place name and thumbnail', async function (assert) {
    this.item = {
      type: 'photo',
      placeIdentifier: 'osm:node:12345',
      osmType: 'node',
      osmId: '12345',
      placeName: 'Café Example',
      placeNameLoading: false,
      createdAt: Math.floor(Date.now() / 1000) - 60 * 60,
      photos: [
        {
          url: 'https://x.com/photo.jpg',
          thumbUrl: 'https://x.com/thumb.jpg',
          alt: 'A nice café',
          tags: ['food'],
        },
      ],
    };

    await render(
      <template>
        <ContributionPhoto @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.contribution-place').hasText('Café Example');
    assert
      .dom('.contribution-thumb img')
      .hasAttribute('src', 'https://x.com/thumb.jpg');
    assert.dom('.contribution-tag').hasText('food');
    assert.dom('.contribution-thumb-badge').doesNotExist();
  });

  test('it shows a +N badge when there are multiple photos', async function (assert) {
    this.item = {
      type: 'photo',
      placeIdentifier: 'osm:node:12345',
      osmType: 'node',
      osmId: '12345',
      placeName: 'Park',
      placeNameLoading: false,
      createdAt: 1000,
      photos: [
        {
          url: 'https://x.com/1.jpg',
          thumbUrl: 'https://x.com/t1.jpg',
          tags: [],
        },
        {
          url: 'https://x.com/2.jpg',
          thumbUrl: 'https://x.com/t2.jpg',
          tags: [],
        },
        {
          url: 'https://x.com/3.jpg',
          thumbUrl: 'https://x.com/t3.jpg',
          tags: [],
        },
      ],
    };

    await render(
      <template>
        <ContributionPhoto @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.contribution-thumb-badge').hasText('+2');
  });

  test('it shows a loading label when placeNameLoading is true', async function (assert) {
    this.item = {
      type: 'photo',
      placeIdentifier: 'osm:node:12345',
      osmType: 'node',
      osmId: '12345',
      placeName: null,
      placeNameLoading: true,
      createdAt: 1000,
      photos: [
        {
          url: 'https://x.com/1.jpg',
          thumbUrl: 'https://x.com/t1.jpg',
          tags: [],
        },
      ],
    };

    await render(
      <template>
        <ContributionPhoto @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.contribution-name-loading').hasText('Loading…');
  });

  test('clicking the item fires @onSelect with the item', async function (assert) {
    this.item = {
      type: 'photo',
      placeIdentifier: 'osm:node:12345',
      osmType: 'node',
      osmId: '12345',
      placeName: 'Test',
      placeNameLoading: false,
      createdAt: 1000,
      photos: [
        {
          url: 'https://x.com/1.jpg',
          thumbUrl: 'https://x.com/t1.jpg',
          tags: [],
        },
      ],
    };

    let selected = null;
    this.handleSelect = (item) => {
      selected = item;
    };

    await render(
      <template>
        <ContributionPhoto
          @item={{this.item}}
          @onSelect={{this.handleSelect}}
        />
      </template>
    );

    await click('.contribution-item');

    assert.strictEqual(selected, this.item);
  });

  test('it updates the place name when a tracked entry resolves after render', async function (assert) {
    // Regression: when a place name is resolved by the background batch fetch
    // after the entry has already been rendered as "Loading…", the component
    // must re-render with the resolved name. This requires the entry's
    // placeName/placeNameLoading to be tracked.
    this.item = new ContributionEntry({
      placeIdentifier: 'osm:node:12345',
      osmType: 'node',
      osmId: '12345',
      createdAt: 1000,
      photos: [
        {
          url: 'https://x.com/1.jpg',
          thumbUrl: 'https://x.com/t1.jpg',
          tags: [],
        },
      ],
    });

    await render(
      <template>
        <ContributionPhoto @item={{this.item}} @onSelect={{this.noop}} />
      </template>
    );

    assert.dom('.contribution-name-loading').hasText('Loading…');

    // Simulate the contributions service resolving the name after the batch fetch
    this.item.placeName = 'Resolved Café';
    this.item.placeNameLoading = false;
    await settled();

    assert.dom('.contribution-place').hasText('Resolved Café');
    assert.dom('.contribution-name-loading').doesNotExist();
  });
});
