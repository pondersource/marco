import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { task } from 'ember-concurrency';
import { EventFactory } from 'applesauce-core';
import { encodePointer } from 'applesauce-core/helpers/pointers';
import or from 'ember-truth-helpers/helpers/or';
import config from 'marco/config/environment';
import DropdownMenu from './dropdown-menu';
import PhotoCarousel from './photo-carousel';
import ZapPhotoModal from './zap-photo-modal';
import Icon from './icon';
import formatRelativeDate from '../helpers/format-relative-date';

const MAX_NEVENT_RELAY_HINTS = 3;

const GalleryContent = <template>
  <div
    class="photo-gallery-overlay"
    role="dialog"
    tabindex="-1"
    {{on "click" @handleBackgroundClick}}
    {{@bindKeyboard @handleKeydown}}
  >
    {{! template-lint-disable no-invalid-interactive }}
    <div
      class="photo-gallery-content"
      data-current-event-id={{@currentPhoto.eventId}}
    >
      <div class="photo-gallery-header">
        <div class="actions-btn-container">
          <DropdownMenu
            @iconSize={{24}}
            @triggerIcon={{@triggerIcon}}
            @iconColor="white"
            as |closeMenu|
          >
            <button
              class="dropdown-item"
              type="button"
              {{on "click" (fn @copyEventId closeMenu)}}
            >Copy Photo Event ID</button>
            {{#if @canZapPhoto}}
              <button
                class="dropdown-item"
                type="button"
                {{on "click" (fn @openZap closeMenu)}}
              >Zap this photo</button>
            {{/if}}
            {{#if @canDeletePhoto}}
              <button
                class="dropdown-item text-danger"
                type="button"
                {{on "click" (fn @deletePhoto closeMenu)}}
              >Delete Photo</button>
            {{/if}}
          </DropdownMenu>
        </div>

        {{#if (or @uploaderName @photoDate)}}
          <div class="photo-gallery-uploader-info">
            {{#if @uploaderName}}
              <span class="photo-gallery-uploader-name">{{@uploaderName}}</span>
            {{/if}}
            {{#if @photoDate}}
              <span class="photo-gallery-uploader-date">
                {{formatRelativeDate @photoDate}}
              </span>
            {{/if}}
          </div>
        {{/if}}
      </div>

      <button
        type="button"
        class="close-btn btn-text"
        {{on "click" @handleClose}}
        aria-label="Close gallery"
        title="Close"
      >
        <Icon @name="x" @size={{24}} @color="white" />
      </button>

      <div class="main-photo-container">
        <PhotoCarousel
          @variant="gallery-main"
          @photos={{@photos}}
          @scrollToEventId={{@currentPhoto.eventId}}
          @onVisiblePhotoChange={{@handleVisiblePhotoChange}}
          @name={{@placeName}}
        />
      </div>

      <div class="thumbnail-strip-container">
        <PhotoCarousel
          @variant="gallery-thumbnails"
          @photos={{@photos}}
          @scrollToEventId={{@currentPhoto.eventId}}
          @onPhotoClick={{@selectPhoto}}
          @name={{@placeName}}
        />
      </div>
    </div>

    {{#if @zapModalOpen}}
      <ZapPhotoModal @photo={{@currentPhoto}} @onClose={{@closeZap}} />
    {{/if}}
  </div>
</template>;

export default class PhotoGallery extends Component {
  get isTesting() {
    return config.environment === 'test';
  }

  get destinationElement() {
    return document.getElementById('modal-portal') || document.body;
  }

  @service toast;
  @service nostrAuth;
  @service nostrData;
  @service nostrRelay;
  @service nostrZap;
  @service blossom;
  @service settings;

  @tracked currentPhoto = this.args.selectedPhoto || this.args.photos?.[0];
  @tracked zapModalOpen = false;

  get triggerIcon() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      return 'more-vertical';
    }
    return 'more-horizontal';
  }

  get isCreator() {
    return (
      this.currentPhoto?.pubkey &&
      this.nostrAuth.pubkey &&
      this.currentPhoto.pubkey === this.nostrAuth.pubkey
    );
  }

  get canDeletePhoto() {
    return (
      this.isCreator && this.settings.experimentalEnablePhotoDeletion === true
    );
  }

  get canZapPhoto() {
    return (
      !this.isCreator &&
      this.nostrAuth.isConnected &&
      !!this.nostrZap.getLightningAddress(this.currentPhoto?.pubkey)
    );
  }

  get uploaderName() {
    const pubkey = this.currentPhoto?.pubkey;
    if (!pubkey) return null;
    const profile = this.nostrData.getProfile?.(pubkey);
    if (!profile) return null;
    return profile.displayName || profile.display_name || profile.name || null;
  }

  get photoDate() {
    const ts = this.currentPhoto?.publishedAt || this.currentPhoto?.createdAt;
    return ts || null;
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
      e.target.closest('.photo-gallery-header') ||
      e.target.closest('.modal-overlay')
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
      let value = this.currentPhoto.eventId;
      try {
        const nevent = encodePointer({
          id: this.currentPhoto.eventId,
          relays: this.nostrData
            .getEventRelays(this.currentPhoto.eventId)
            .slice(0, MAX_NEVENT_RELAY_HINTS),
          author: this.currentPhoto.pubkey,
          kind: 360,
        });
        if (nevent) value = nevent;
      } catch (err) {
        console.warn('Failed to encode nevent, copying raw event ID:', err);
      }

      try {
        await navigator.clipboard.writeText(value);
        this.toast.show('Event ID copied to clipboard');
      } catch (err) {
        console.error('Failed to copy event ID:', err);
        this.toast.show('Failed to copy event ID');
      }
    }
    closeMenu();
  }

  @action
  openZap(closeMenu, e) {
    e?.stopPropagation();
    this.zapModalOpen = true;
    if (closeMenu) closeMenu();
  }

  @action
  closeZap() {
    this.zapModalOpen = false;
  }

  @action
  deletePhoto(closeMenu, e) {
    e?.stopPropagation();
    if (closeMenu) closeMenu();
    if (
      !confirm(
        'Are you sure you want to delete this photo? This cannot be undone.'
      )
    ) {
      return;
    }
    this.deletePhotoTask.perform();
  }

  deletePhotoTask = task(async () => {
    const deletedEventId = this.currentPhoto.eventId;
    const deletedIndex = this.args.photos?.indexOf(this.currentPhoto) ?? -1;

    try {
      // Publish Nostr kind: 5 deletion event first so we don't end up with dead blossom links on a failure
      const tags = [['e', deletedEventId]];

      if (this.currentPhoto.placeIdentifier) {
        tags.push(['i', this.currentPhoto.placeIdentifier]);
      }

      const event = await EventFactory.fromKind(5)
        .content('Deleted photo')
        .modifyPublicTags(() => tags)
        .as(this.nostrAuth.signer)
        .sign();
      const responses = await this.nostrRelay.publish(
        this.nostrData.activeWriteRelays,
        event
      );
      this.nostrData.recordPublishResult(event.id, responses);
      if (!responses?.some((res) => res.ok)) {
        throw new Error('Failed to publish deletion event.');
      }

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

      // Navigate to the next remaining photo, or close the gallery if none left.
      // this.args.photos may be stale until Glimmer re-renders, so filter locally.
      const remaining = (this.args.photos || []).filter(
        (p) => p.eventId !== deletedEventId
      );
      if (remaining.length === 0) {
        this.handleClose();
      } else {
        this.currentPhoto =
          remaining[Math.min(deletedIndex, remaining.length - 1)];
      }
    } catch (e) {
      console.error('Failed to delete photo:', e);
      this.toast.show('Failed to delete photo: ' + e.message);
    }
  });

  <template>
    {{#if this.isTesting}}
      <GalleryContent
        @handleBackgroundClick={{this.handleBackgroundClick}}
        @bindKeyboard={{this.bindKeyboard}}
        @handleKeydown={{this.handleKeydown}}
        @copyEventId={{this.copyEventId}}
        @canDeletePhoto={{this.canDeletePhoto}}
        @deletePhoto={{this.deletePhoto}}
        @handleClose={{this.handleClose}}
        @photos={{@photos}}
        @currentPhoto={{this.currentPhoto}}
        @handleVisiblePhotoChange={{this.handleVisiblePhotoChange}}
        @placeName={{@placeName}}
        @selectPhoto={{this.selectPhoto}}
        @uploaderName={{this.uploaderName}}
        @photoDate={{this.photoDate}}
        @triggerIcon={{this.triggerIcon}}
        @openZap={{this.openZap}}
        @closeZap={{this.closeZap}}
        @zapModalOpen={{this.zapModalOpen}}
        @canZapPhoto={{this.canZapPhoto}}
      />
    {{else}}
      {{#in-element this.destinationElement}}
        <GalleryContent
          @handleBackgroundClick={{this.handleBackgroundClick}}
          @bindKeyboard={{this.bindKeyboard}}
          @handleKeydown={{this.handleKeydown}}
          @copyEventId={{this.copyEventId}}
          @canDeletePhoto={{this.canDeletePhoto}}
          @deletePhoto={{this.deletePhoto}}
          @handleClose={{this.handleClose}}
          @photos={{@photos}}
          @currentPhoto={{this.currentPhoto}}
          @handleVisiblePhotoChange={{this.handleVisiblePhotoChange}}
          @placeName={{@placeName}}
          @selectPhoto={{this.selectPhoto}}
          @uploaderName={{this.uploaderName}}
          @photoDate={{this.photoDate}}
          @triggerIcon={{this.triggerIcon}}
          @openZap={{this.openZap}}
          @closeZap={{this.closeZap}}
          @zapModalOpen={{this.zapModalOpen}}
          @canZapPhoto={{this.canZapPhoto}}
        />
      {{/in-element}}
    {{/if}}
  </template>
}
