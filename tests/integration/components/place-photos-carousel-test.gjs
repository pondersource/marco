import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click } from '@ember/test-helpers';
import PlacePhotosCarousel from 'marco/components/place-photos-carousel';

module('Integration | Component | place-photos-carousel', function (hooks) {
  setupRenderingTest(hooks);

  test('it renders gracefully with no photos', async function (assert) {
    this.photos = [];

    await render(
      <template><PlacePhotosCarousel @photos={{this.photos}} /></template>
    );

    assert
      .dom('.place-photos-carousel-wrapper')
      .doesNotExist('it does not render the wrapper when there are no photos');
  });

  test('it renders a single photo without navigation chevrons', async function (assert) {
    this.photos = [
      {
        url: 'photo1.jpg',
        thumbUrl: 'thumb1.jpg',
        blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
        ratio: 1.5,
        isLandscape: true,
      },
    ];

    await render(
      <template>
        <div class="test-container">
          <PlacePhotosCarousel @photos={{this.photos}} />
        </div>
      </template>
    );

    assert
      .dom('.place-photos-carousel-wrapper')
      .exists('it renders the wrapper');
    assert.dom('.carousel-slide').exists({ count: 1 }, 'it renders one slide');
    assert
      .dom('img.place-header-photo')
      .hasAttribute('src', 'photo1.jpg', 'it renders the photo');

    // There should be no chevrons when there's only 1 photo
    assert
      .dom('.carousel-nav-btn')
      .doesNotExist('it does not render chevrons for a single photo');
  });

  test('it renders multiple photos and shows chevrons', async function (assert) {
    this.photos = [
      {
        url: 'photo1.jpg',
        thumbUrl: 'thumb1.jpg',
        blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
        ratio: 1.5,
        isLandscape: true,
      },
      {
        url: 'photo2.jpg',
        thumbUrl: 'thumb2.jpg',
        blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
        ratio: 1.0,
        isLandscape: false,
      },
      {
        url: 'photo3.jpg',
        thumbUrl: 'thumb3.jpg',
        blurhash: 'LKO2?U%2Tw=w]~RBVZRi};RPxuwH',
        ratio: 0.8,
        isLandscape: false,
      },
    ];

    await render(
      <template>
        <div class="test-container">
          <PlacePhotosCarousel @photos={{this.photos}} />
        </div>
      </template>
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.dom('.carousel-slide').exists({ count: 3 }, 'it renders all slides');
    assert
      .dom('.carousel-nav-btn')
      .exists({ count: 2 }, 'it renders both chevrons');

    // Initially, it shouldn't be able to scroll left
    assert
      .dom('.carousel-nav-btn.prev')
      .hasClass('disabled', 'the prev button is disabled initially');
    assert
      .dom('.carousel-nav-btn.next')
      .doesNotHaveClass('disabled', 'the next button is enabled initially');

    // We can't perfectly test native scroll behavior easily in JSDOM/QUnit without mocking the DOM elements' scroll properties,
    // but we can test that clicking the next button triggers the scrolling method.
    // However, since we mock scrollLeft in the component logic implicitly via template action, let's at least ensure clicking doesn't throw.
    await click('.carousel-nav-btn.next');

    assert.ok(true, 'clicking next button does not throw');
  });
});
