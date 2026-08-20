import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click, triggerKeyEvent } from '@ember/test-helpers';
import Service from '@ember/service';
import PhotoGallery from 'marco/components/photo-gallery';
import { setupNostrMocks } from 'marco/tests/helpers/mock-nostr';
import sinon from 'sinon';

const USER_A = 'a'.repeat(64);
const USER_B = 'b'.repeat(64);

class MockBlossomService extends Service {
  async delete() {
    return true;
  }
}

class MockToastService extends Service {
  show() {}
}

module('Integration | Component | photo-gallery', function (hooks) {
  setupRenderingTest(hooks);
  setupNostrMocks(hooks);

  hooks.beforeEach(function () {
    this.owner.register('service:blossom', MockBlossomService);
    this.owner.register('service:toast', MockToastService);

    this.blossom = this.owner.lookup('service:blossom');
    this.nostrAuth = this.owner.lookup('service:nostrAuth');
    this.nostrData = this.owner.lookup('service:nostrData');
    this.nostrRelay = this.owner.lookup('service:nostrRelay');
    this.toast = this.owner.lookup('service:toast');
    this.settings = this.owner.lookup('service:settings');

    this.photos = [
      {
        eventId: 'event1',
        pubkey: USER_A,
        placeIdentifier: 'osm:node:12345',
        url: 'https://example.com/a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1.jpg',
        thumbUrl:
          'https://example.com/b3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1.jpg',
      },
      {
        eventId: 'event2',
        pubkey: USER_B,
        placeIdentifier: 'osm:node:12345',
        url: 'photo2.jpg',
      },
    ];
  });

  hooks.afterEach(function () {
    sinon.restore();
    localStorage.removeItem('marco:settings');
  });

  test('it does not show delete button if user is not creator', async function (assert) {
    this.nostrAuth.pubkey = USER_B; // Different from photo1's pubkey
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    // Open dropdown
    await click('.dropdown-trigger-btn');

    assert.dom('.dropdown-popover').exists('Dropdown opened');
    assert
      .dom('.dropdown-item.text-danger')
      .doesNotExist('Delete button is hidden for non-creator');
  });

  test('it shows delete button if user is creator and setting is enabled', async function (assert) {
    this.nostrAuth.pubkey = USER_A; // Matches photo1's pubkey
    this.settings.update('experimentalEnablePhotoDeletion', true); // Enable the setting
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    // Open dropdown
    await click('.dropdown-trigger-btn');

    assert.dom('.dropdown-popover').exists('Dropdown opened');
    assert
      .dom('.dropdown-item.text-danger')
      .exists('Delete button is visible for creator when setting is enabled');
  });

  test('it handles cancellation of deletion', async function (assert) {
    this.nostrAuth.pubkey = USER_A;
    this.settings.update('experimentalEnablePhotoDeletion', true);
    this.selectedPhoto = this.photos[0];

    const confirmStub = sinon.stub(window, 'confirm').returns(false);
    const blossomSpy = sinon.spy(this.blossom, 'delete');

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    await click('.dropdown-trigger-btn');
    await click('.dropdown-item.text-danger');

    assert.ok(confirmStub.calledOnce, 'confirmation dialog was shown');
    assert.ok(blossomSpy.notCalled, 'blossom.delete was NOT called');
  });

  test('it performs full deletion flow when confirmed', async function (assert) {
    this.nostrAuth.pubkey = USER_A;
    this.settings.update('experimentalEnablePhotoDeletion', true);
    // Override the mock's getter just for this test
    Object.defineProperty(this.nostrAuth, 'signer', {
      configurable: true,
      get: () => ({
        signEvent: async (e) => ({
          ...e,
          id: 'a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
          sig: 'b3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
          pubkey: USER_A,
        }),
        getPublicKey: async () => USER_A,
      }),
    });
    this.selectedPhoto = this.photos[0];

    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    const confirmStub = sinon.stub(window, 'confirm').returns(true);
    const blossomStub = sinon.stub(this.blossom, 'delete').resolves();
    const publishStub = sinon.stub(this.nostrRelay, 'publish').resolves();
    const storeStub = sinon.stub(this.nostrData.store, 'add');
    const toastSpy = sinon.spy(this.toast, 'show');

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
            @onClose={{this.handleClose}}
          />
        </div>
      </template>
    );

    await click('.dropdown-trigger-btn');
    await click('.dropdown-item.text-danger');

    assert.ok(confirmStub.calledOnce, 'confirmation dialog was shown');

    // Check blossom deletions
    assert.ok(
      blossomStub.calledTwice,
      'blossom.delete was called twice (main + thumb)'
    );
    assert.strictEqual(
      blossomStub.firstCall.args[0],
      'a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
      'extracted correct hash for main image'
    );
    assert.strictEqual(
      blossomStub.secondCall.args[0],
      'b3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1',
      'extracted correct hash for thumb image'
    );

    // Check Nostr kind 5
    assert.ok(publishStub.calledOnce, 'nostrRelay.publish was called');
    const publishedEvent = publishStub.firstCall.args[1];
    assert.strictEqual(publishedEvent.kind, 5, 'published event is kind 5');
    assert.deepEqual(
      publishedEvent.tags[0],
      ['e', 'event1'],
      'event tags reference the deleted photo'
    );
    assert.deepEqual(
      publishedEvent.tags[1],
      ['i', 'osm:node:12345'],
      'event tags include the place identifier'
    );

    // Check store update
    assert.ok(storeStub.calledOnce, 'nostrData.store.add was called');
    assert.strictEqual(
      storeStub.firstCall.args[0].kind,
      5,
      'added kind 5 event to local store'
    );

    // Check UX
    assert.ok(
      toastSpy.calledWith('Photo deleted successfully'),
      'success toast was shown'
    );
    assert.ok(closed, 'gallery was closed after deletion');
  });

  test('it copies event id to clipboard', async function (assert) {
    this.nostrAuth.pubkey = USER_A;
    this.selectedPhoto = this.photos[0];

    const clipboardStub = sinon
      .stub(navigator.clipboard, 'writeText')
      .resolves();
    const toastSpy = sinon.spy(this.toast, 'show');

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    await click('.dropdown-trigger-btn');

    // Find the copy button (it should be the first one)
    const items = document.querySelectorAll('.dropdown-item');
    let copyBtn;
    items.forEach((item) => {
      if (item.textContent.includes('Copy Photo Event ID')) {
        copyBtn = item;
      }
    });

    await click(copyBtn);

    assert.ok(clipboardStub.calledWith('event1'), 'copied correct event id');
    assert.ok(
      toastSpy.calledWith('Event ID copied to clipboard'),
      'success toast was shown'
    );
  });

  test('keyboard navigation changes photos', async function (assert) {
    this.photos = [
      { eventId: 'event1', url: 'photo1.jpg' },
      { eventId: 'event2', url: 'photo2.jpg' },
      { eventId: 'event3', url: 'photo3.jpg' },
    ];
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    assert
      .dom('.photo-gallery-content')
      .hasAttribute('data-current-event-id', 'event1');

    // Right Arrow
    await triggerKeyEvent(document, 'keydown', 'ArrowRight');

    assert
      .dom('.photo-gallery-content')
      .hasAttribute('data-current-event-id', 'event2');

    // Right Arrow again
    await triggerKeyEvent(document, 'keydown', 'ArrowRight');

    assert
      .dom('.photo-gallery-content')
      .hasAttribute('data-current-event-id', 'event3');

    // Left Arrow
    await triggerKeyEvent(document, 'keydown', 'ArrowLeft');

    assert
      .dom('.photo-gallery-content')
      .hasAttribute('data-current-event-id', 'event2');
  });

  test('escape key closes gallery', async function (assert) {
    this.selectedPhoto = this.photos[0];
    let closed = false;
    this.handleClose = () => {
      closed = true;
    };

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
            @onClose={{this.handleClose}}
          />
        </div>
      </template>
    );

    await triggerKeyEvent(document, 'keydown', 'Escape');
    assert.ok(closed, 'gallery was closed on escape key');
  });

  test('it renders uploader name and date when profile is loaded', async function (assert) {
    const displayName = 'Alice';
    const publishedAt = Math.floor(Date.now() / 1000) - 60 * 60 * 24; // 1 day ago

    this.nostrData.profiles = {
      [USER_A]: { displayName, display_name: 'ignored', name: 'ignored' },
    };

    this.photos = [
      {
        eventId: 'event1',
        pubkey: USER_A,
        placeIdentifier: 'osm:node:12345',
        url: 'https://example.com/photo.jpg',
        publishedAt,
        createdAt: publishedAt + 10,
      },
    ];
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    assert
      .dom('.photo-gallery-uploader-name')
      .hasText(displayName, 'uploader name is rendered');
    assert
      .dom('.photo-gallery-uploader-date')
      .exists('date element is rendered');
  });

  test('it prefers published_at over created_at for the date', async function (assert) {
    this.nostrData.profiles = {
      [USER_A]: { displayName: 'Alice' },
    };

    const publishedAt = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 3; // 3 days ago
    const createdAt = Math.floor(Date.now() / 1000) - 60; // 1 min ago

    this.photos = [
      {
        eventId: 'event1',
        pubkey: USER_A,
        url: 'https://example.com/photo.jpg',
        publishedAt,
        createdAt,
      },
    ];
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    // Should show "3 days ago" (publishedAt), not "just now" (createdAt)
    assert.dom('.photo-gallery-uploader-date').hasText('3 days ago');
  });

  test('it does not render uploader info when profile is missing', async function (assert) {
    this.nostrData.profiles = {};

    this.photos = [
      {
        eventId: 'event1',
        pubkey: USER_A,
        url: 'https://example.com/photo.jpg',
        createdAt: Math.floor(Date.now() / 1000),
      },
    ];
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    assert
      .dom('.photo-gallery-uploader-name')
      .doesNotExist('uploader name is not rendered without profile');
    // Date should still render since createdAt is present
    assert.dom('.photo-gallery-uploader-date').exists('date is still rendered');
  });

  test('it falls back through displayName -> display_name -> name', async function (assert) {
    this.nostrData.profiles = {
      [USER_A]: { display_name: 'Bob', name: 'Robert' },
    };

    this.photos = [
      {
        eventId: 'event1',
        pubkey: USER_A,
        url: 'https://example.com/photo.jpg',
        createdAt: Math.floor(Date.now() / 1000) - 60,
      },
    ];
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    assert
      .dom('.photo-gallery-uploader-name')
      .hasText('Bob', 'falls back to display_name when displayName is missing');
  });

  test('it shows Zap this photo in the dropdown', async function (assert) {
    this.nostrAuth.pubkey = USER_A;
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    await click('.dropdown-trigger-btn');

    let zapBtn;
    document.querySelectorAll('.dropdown-item').forEach((item) => {
      if (item.textContent.includes('Zap this photo')) {
        zapBtn = item;
      }
    });

    assert.ok(zapBtn, 'Zap this photo dropdown item exists');
  });

  test('it opens zap modal when Zap this photo is clicked', async function (assert) {
    this.nostrAuth.pubkey = USER_A;
    this.selectedPhoto = this.photos[0];

    await render(
      <template>
        <div id="test-container">
          <div id="modal-portal"></div>
          <PhotoGallery
            @photos={{this.photos}}
            @selectedPhoto={{this.selectedPhoto}}
          />
        </div>
      </template>
    );

    await click('.dropdown-trigger-btn');

    let zapBtn;
    document.querySelectorAll('.dropdown-item').forEach((item) => {
      if (item.textContent.includes('Zap this photo')) {
        zapBtn = item;
      }
    });

    await click(zapBtn);

    assert.dom('.zap-photo-modal').exists('zap modal is rendered');
  });
});
