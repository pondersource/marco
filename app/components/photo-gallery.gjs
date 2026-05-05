import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { fn } from '@ember/helper';
import { task } from 'ember-concurrency';
import { EventFactory } from 'applesauce-core';
import Icon from '#components/icon';
import PhotoCarousel from './photo-carousel';
import DropdownMenu from '#components/dropdown-menu';

export default class PhotoGallery extends Component {
  @service toast;
  @service nostrAuth;
  @service nostrData;
  @service nostrRelay;
  @service blossom;

  @tracked currentPhoto = this.args.selectedPhoto || this.args.photos?.[0];

  get isCreator() {
    return (
      this.currentPhoto?.pubkey &&
      this.nostrAuth.pubkey &&
      this.currentPhoto.pubkey === this.nostrAuth.pubkey
    );
  }

  bindKeyboard = modifier((element, [handler]) => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  });

  @action
  handleClose() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  handleBackgroundClick(e) {
    // Don't close if clicking on thumbnails, nav buttons, or the close button itself
    if (
      e.target.closest('.thumbnail-strip-container') ||
      e.target.closest('.carousel-nav-btn') ||
      e.target.closest('.close-btn') ||
      e.target.closest('.actions-btn-container')
    ) {
      return;
    }

    this.handleClose();
  }

  @action
  selectPhoto(photo) {
    this.currentPhoto = photo;
  }

  @action
  handleVisiblePhotoChange(photo) {
    if (this.currentPhoto !== photo) {
      this.currentPhoto = photo;
    }
  }

  @action
  handleKeydown(e) {
    if (!this.args.photos || this.args.photos.length === 0) return;

    if (e.key === 'Escape') {
      this.handleClose();
      return;
    }

    const currentIndex = this.args.photos.indexOf(this.currentPhoto);
    if (currentIndex === -1) return;

    if (e.key === 'ArrowLeft' && currentIndex > 0) {
      this.currentPhoto = this.args.photos[currentIndex - 1];
    } else if (
      e.key === 'ArrowRight' &&
      currentIndex < this.args.photos.length - 1
    ) {
      this.currentPhoto = this.args.photos[currentIndex + 1];
    }
  }

  @action
  async copyEventId(closeMenu) {
    if (this.currentPhoto?.eventId) {
      try {
        await navigator.clipboard.writeText(this.currentPhoto.eventId);
        this.toast.show('Event ID copied to clipboard');
      } catch (err) {
        console.error('Failed to copy event ID:', err);
        this.toast.show('Failed to copy event ID');
      }
    }
    closeMenu();
  }

  deletePhotoTask = task(async (closeMenu) => {
    if (
      !confirm(
        'Are you sure you want to delete this photo? This cannot be undone.'
      )
    ) {
      if (closeMenu) closeMenu();
      return;
    }

    try {
      const eventId = this.currentPhoto.eventId;

      // Publish Nostr kind: 5 deletion event first so we don't end up with dead blossom links on a failure
      const factory = new EventFactory({ signer: this.nostrAuth.signer });
      const tags = [['e', eventId]];

      if (this.currentPhoto.placeIdentifier) {
        tags.push(['i', this.currentPhoto.placeIdentifier]);
      }

      const template = {
        kind: 5,
        created_at: Math.floor(Date.now() / 1000),
        content: 'Deleted photo',
        tags,
      };

      const event = await factory.sign(template);
      await this.nostrRelay.publish(this.nostrData.activeWriteRelays, event);

      // Remove from local store by adding the kind 5 to it
      this.nostrData.store.add(event);

      // Now that the event is published, try to delete from Blossom
      const hashRegex = /[0-9a-f]{64}/i;

      if (this.currentPhoto.url) {
        const match = this.currentPhoto.url.match(hashRegex);
        if (match) {
          try {
            await this.blossom.delete(match[0]);
          } catch (e) {
            console.warn('Failed to delete main image from blossom:', e);
          }
        }
      }

      if (this.currentPhoto.thumbUrl) {
        const match = this.currentPhoto.thumbUrl.match(hashRegex);
        if (match) {
          try {
            await this.blossom.delete(match[0]);
          } catch (e) {
            console.warn('Failed to delete thumb image from blossom:', e);
          }
        }
      }

      this.toast.show('Photo deleted successfully');

      if (closeMenu) closeMenu();
      this.handleClose();
    } catch (e) {
      console.error('Failed to delete photo:', e);
      this.toast.show('Failed to delete photo: ' + e.message);
      if (closeMenu) closeMenu();
    }
  });

  <template>
    <div
      class="photo-gallery-overlay"
      role="dialog"
      tabindex="-1"
      {{on "click" this.handleBackgroundClick}}
      {{this.bindKeyboard this.handleKeydown}}
    >
      {{! template-lint-disable no-invalid-interactive }}
      <div class="photo-gallery-content">
        <div class="actions-btn-container">
          <DropdownMenu
            @iconSize={{24}}
            @triggerIcon="more-horizontal"
            @iconColor="white"
            as |closeMenu|
          >
            <button
              class="dropdown-item"
              type="button"
              {{on "click" (fn this.copyEventId closeMenu)}}
            >Copy Photo Event ID</button>
            {{#if this.isCreator}}
              <button
                class="dropdown-item text-danger"
                type="button"
                {{on "click" (fn this.deletePhotoTask.perform closeMenu)}}
              >Delete Photo</button>
            {{/if}}
          </DropdownMenu>
        </div>

        <button
          type="button"
          class="close-btn btn-text"
          {{on "click" this.handleClose}}
          aria-label="Close gallery"
          title="Close"
        >
          <Icon @name="x" @size={{24}} @color="white" />
        </button>

        <div class="main-photo-container">
          <PhotoCarousel
            @variant="gallery-main"
            @photos={{@photos}}
            @scrollToEventId={{this.currentPhoto.eventId}}
            @onVisiblePhotoChange={{this.handleVisiblePhotoChange}}
            @name={{@placeName}}
          />
        </div>

        <div class="thumbnail-strip-container">
          <PhotoCarousel
            @variant="gallery-thumbnails"
            @photos={{@photos}}
            @scrollToEventId={{this.currentPhoto.eventId}}
            @onPhotoClick={{this.selectPhoto}}
            @name={{@placeName}}
          />
        </div>
      </div>
    </div>
  </template>
}
