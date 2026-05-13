import { module, test } from 'qunit';
import { setupRenderingTest } from 'marco/tests/helpers';
import { render, click, triggerKeyEvent } from '@ember/test-helpers';
import Service from '@ember/service';
import PhotoGallery from 'marco/components/photo-gallery';
import { setupNostrMocks } from 'marco/tests/helpers/mock-nostr';
import sinon from 'sinon';

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

    this.photos = [
      {
        eventId: 'event1',
        pubkey: 'userA',
        placeIdentifier: 'osm:node:12345',
        url: 'https://example.com/a3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1.jpg',
        thumbUrl:
          'https://example.com/b3b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1.jpg',
      },
      {
        eventId: 'event2',
        pubkey: 'userB',
        placeIdentifier: 'osm:node:12345',
        url: 'photo2.jpg',
      },
    ];
  });

  hooks.afterEach(function () {
    sinon.restore();
  });

  test('it does not show delete button if user is not creator', async function (assert) {
    this.nostrAuth.pubkey = 'userB'; // Different from photo1's pubkey
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

  test('it shows delete button if user is creator', async function (assert) {
    this.nostrAuth.pubkey = 'userA'; // Matches photo1's pubkey
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
      .exists('Delete button is visible for creator');
    assert.dom('.dropdown-item.text-danger').hasText('Delete Photo');
  });

  test('it handles cancellation of deletion', async function (assert) {
    this.nostrAuth.pubkey = 'userA';
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
    this.nostrAuth.pubkey = 'userA';
    // Override the mock's getter just for this test
    Object.defineProperty(this.nostrAuth, 'signer', {
      configurable: true,
      get: () => ({
        signEvent: async (e) => ({
          ...e,
          id: 'signed-id',
          sig: 'sig',
          pubkey: 'userA',
        }),
        getPublicKey: async () => 'userA',
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
    this.nostrAuth.pubkey = 'userA';
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

    // Let carousel settle
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Right Arrow
    await triggerKeyEvent(document, 'keydown', 'ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Let's just assert that currentPhoto was updated internally, which trickles down.
    // The actual DOM update for the main image might be tricky if the carousel relies on scroll events.
    // We can at least check if the thumbnail selection changed, as that is directly driven by currentPhoto
    assert
      .dom('.thumbnail-strip-container .carousel-slide.active img')
      .hasAttribute('data-src', 'photo2.jpg');

    // Right Arrow again
    await triggerKeyEvent(document, 'keydown', 'ArrowRight');
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert
      .dom('.thumbnail-strip-container .carousel-slide.active img')
      .hasAttribute('data-src', 'photo3.jpg');

    // Left Arrow
    await triggerKeyEvent(document, 'keydown', 'ArrowLeft');
    await new Promise((resolve) => setTimeout(resolve, 150));

    assert
      .dom('.thumbnail-strip-container .carousel-slide.active img')
      .hasAttribute('data-src', 'photo2.jpg');
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
});
