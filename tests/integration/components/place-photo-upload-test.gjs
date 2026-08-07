import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click, triggerEvent } from '@ember/test-helpers';
import Service from '@ember/service';
import PlacePhotoUpload from 'marco/components/place-photo-upload';

module('Integration | Component | place-photo-upload', function (hooks) {
  setupRenderingTest(hooks);

  class MockNostrAuthService extends Service {
    get isConnected() {
      return true;
    }

    get signer() {
      return null;
    }
  }

  hooks.beforeEach(function () {
    this.owner.register('service:nostrAuth', MockNostrAuthService);
  });

  async function selectFile(element, file) {
    const input = element.querySelector('#photo-upload-input');
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true,
    });
    await triggerEvent(input, 'change');
  }

  test('it shows tag suggestions when they exist after upload selection', async function (assert) {
    this.place = {
      title: 'Cafe Alpha',
      osmId: '123',
      osmType: 'node',
      osmTags: { amenity: 'cafe' },
    };

    await render(
      <template><PlacePhotoUpload @place={{this.place}} /></template>
    );

    assert.dom('.photo-tag-suggestions').doesNotExist();

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    await selectFile(this.element, file);

    assert.dom('.photo-tag-suggestions').exists();
    assert.dom('.photo-tag-chip').exists();
    assert.dom('.photo-tag-chip').includesText('Food');
  });

  test('it only allows one selected tag at a time', async function (assert) {
    this.place = {
      title: 'Cafe Alpha',
      osmId: '123',
      osmType: 'node',
      osmTags: { amenity: 'cafe' },
    };

    await render(
      <template><PlacePhotoUpload @place={{this.place}} /></template>
    );

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    await selectFile(this.element, file);

    const chips = this.element.querySelectorAll('.photo-tag-chip');
    assert.ok(chips.length > 1, 'multiple tag chips are rendered');

    await click(chips[0]);
    assert.dom('.photo-tag-chip.is-selected').exists({ count: 1 });
    assert.dom(chips[0]).hasClass('is-selected');

    await click(chips[1]);
    assert.dom('.photo-tag-chip.is-selected').exists({ count: 1 });
    assert.dom(chips[1]).hasClass('is-selected');
    assert.dom(chips[0]).doesNotHaveClass('is-selected');
  });

  test('it hides tag suggestions when no tags are suggested', async function (assert) {
    this.place = {
      title: 'Office Beta',
      osmId: '456',
      osmType: 'node',
      osmTags: { office: 'lawyer' },
    };

    await render(
      <template><PlacePhotoUpload @place={{this.place}} /></template>
    );

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    await selectFile(this.element, file);

    assert.dom('.photo-tag-suggestions').doesNotExist();
  });

  test('it renders an optional alt text input after upload selection', async function (assert) {
    this.place = {
      title: 'Cafe Alpha',
      osmId: '123',
      osmType: 'node',
      osmTags: { amenity: 'cafe' },
    };

    await render(
      <template><PlacePhotoUpload @place={{this.place}} /></template>
    );

    assert.dom('#photo-alt-input').doesNotExist();

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    await selectFile(this.element, file);

    assert.dom('#photo-alt-input').exists();
    assert
      .dom('#photo-alt-input')
      .hasAttribute('placeholder', 'Describe this photo');
  });
});
