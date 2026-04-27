import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from './icon';
import PhotoCarousel from './photo-carousel';

export default class PhotoGallery extends Component {
  @tracked currentPhoto = this.args.selectedPhoto || this.args.photos?.[0];

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
      e.target.closest('.close-btn')
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

  <template>
    <div
      class="photo-gallery-overlay"
      role="dialog"
      tabindex="-1"
      {{on "click" this.handleBackgroundClick}}
    >
      {{! template-lint-disable no-invalid-interactive }}
      <div class="photo-gallery-content">
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
