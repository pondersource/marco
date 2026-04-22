import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import Blurhash from './blurhash';
import Icon from './icon';
import fadeInImage from '../modifiers/fade-in-image';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';

export default class PlacePhotosCarousel extends Component {
  @tracked canScrollLeft = false;
  @tracked canScrollRight = false;

  carouselElement = null;

  get photos() {
    return this.args.photos || [];
  }

  get showChevrons() {
    return this.photos.length > 1;
  }

  get cannotScrollLeft() {
    return !this.canScrollLeft;
  }

  get cannotScrollRight() {
    return !this.canScrollRight;
  }

  scrollToNewPhoto = modifier((element, [eventId]) => {
    if (eventId && eventId !== this.lastEventId) {
      this.lastEventId = eventId;
      // Allow DOM to update first since the photo was *just* added to the store
      setTimeout(() => {
        const targetSlide = element.querySelector(
          `[data-event-id="${eventId}"]`
        );
        if (targetSlide) {
          element.scrollLeft = targetSlide.offsetLeft;
        }
      }, 100);
    }
  });

  setupCarousel = modifier((element) => {
    this.carouselElement = element;

    // Defer the initial calculation slightly to ensure CSS and images have applied
    setTimeout(() => {
      this.updateScrollState();
    }, 50);

    let resizeObserver;
    if (window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => this.updateScrollState());
      resizeObserver.observe(element);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.unobserve(element);
      }
    };
  });

  @action
  updateScrollState() {
    if (!this.carouselElement) return;

    const { scrollLeft, scrollWidth, clientWidth } = this.carouselElement;
    // tolerance of 1px for floating point rounding issues
    this.canScrollLeft = scrollLeft > 1;
    this.canScrollRight = scrollLeft + clientWidth < scrollWidth - 1;
  }

  @action
  scrollLeft() {
    if (!this.carouselElement) return;
    this.carouselElement.scrollBy({
      left: -this.carouselElement.clientWidth,
      behavior: 'smooth',
    });
  }

  @action
  scrollRight() {
    if (!this.carouselElement) return;
    this.carouselElement.scrollBy({
      left: this.carouselElement.clientWidth,
      behavior: 'smooth',
    });
  }

  <template>
    {{#if this.photos.length}}
      <div class="place-photos-carousel-wrapper">
        <div
          class="place-photos-carousel-track"
          {{this.setupCarousel}}
          {{this.scrollToNewPhoto @scrollToEventId}}
          {{on "scroll" this.updateScrollState}}
        >
          {{#each this.photos as |photo|}}
            {{! template-lint-disable no-inline-styles }}
            <div
              class="carousel-slide"
              style={{photo.style}}
              data-event-id={{photo.eventId}}
            >
              {{#if photo.blurhash}}
                <Blurhash
                  @hash={{photo.blurhash}}
                  @width={{32}}
                  @height={{18}}
                  class="place-header-photo-blur"
                />
              {{/if}}

              {{#if photo.isLandscape}}
                <picture>
                  {{#if photo.thumbUrl}}
                    <source
                      media="(max-width: 768px)"
                      data-srcset={{photo.thumbUrl}}
                    />
                  {{/if}}
                  <img
                    data-src={{photo.url}}
                    class="place-header-photo landscape"
                    alt={{@name}}
                    {{fadeInImage photo.url}}
                  />
                </picture>
              {{else}}
                {{! Portrait uses thumb everywhere if available }}
                <img
                  data-src={{if photo.thumbUrl photo.thumbUrl photo.url}}
                  class="place-header-photo portrait"
                  alt={{@name}}
                  {{fadeInImage (if photo.thumbUrl photo.thumbUrl photo.url)}}
                />
              {{/if}}
            </div>
          {{/each}}

          <div class="carousel-placeholder"></div>
        </div>

        {{#if this.showChevrons}}
          <button
            type="button"
            class="carousel-nav-btn prev
              {{if this.cannotScrollLeft 'disabled'}}"
            {{on "click" this.scrollLeft}}
            disabled={{this.cannotScrollLeft}}
            aria-label="Previous photo"
          >
            <Icon @name="chevron-left" @color="currentColor" />
          </button>

          <button
            type="button"
            class="carousel-nav-btn next
              {{if this.cannotScrollRight 'disabled'}}"
            {{on "click" this.scrollRight}}
            disabled={{this.cannotScrollRight}}
            aria-label="Next photo"
          >
            <Icon @name="chevron-right" @color="currentColor" />
          </button>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
