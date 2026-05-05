import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { and, eq } from 'ember-truth-helpers';
import Blurhash from './blurhash';
import Icon from './icon';
import fadeInImage from '../modifiers/fade-in-image';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';

export default class PhotoCarousel extends Component {
  @tracked canScrollLeft = false;
  @tracked canScrollRight = false;

  internalEventId = null;
  carouselElement = null;

  get photos() {
    return this.args.photos || [];
  }

  get showChevrons() {
    // Only show chevrons if there's more than one photo
    return this.photos.length > 1;
  }

  get cannotScrollLeft() {
    return !this.canScrollLeft;
  }

  get cannotScrollRight() {
    return !this.canScrollRight;
  }

  get isGalleryMain() {
    return this.args.variant === 'gallery-main';
  }

  get isGalleryThumbnails() {
    return this.args.variant === 'gallery-thumbnails';
  }

  get variantClass() {
    return this.args.variant || 'inline';
  }

  lastResetKey = null;

  resetScrollPosition = modifier((element, [resetKey]) => {
    if (resetKey !== undefined && resetKey !== this.lastResetKey) {
      this.lastResetKey = resetKey;
      element.scrollLeft = 0;
      setTimeout(() => this.updateScrollState(), 50);
    }
  });

  scrollToNewPhoto = modifier((element, [eventId]) => {
    if (eventId && eventId !== this.lastEventId) {
      const isInitial = !this.lastEventId;
      this.lastEventId = eventId;

      // Prevent feedback loop if this carousel initiated the change
      if (this.internalEventId === eventId) {
        return;
      }

      const scrollAction = () => {
        const targetSlide = element.querySelector(
          `[data-event-id="${eventId}"]`
        );
        if (targetSlide) {
          if (isInitial) {
            const originalScrollBehavior = element.style.scrollBehavior;
            element.style.scrollBehavior = 'auto';
            element.scrollLeft = targetSlide.offsetLeft;

            // Restore smooth scroll after the jump
            setTimeout(() => {
              element.style.scrollBehavior = originalScrollBehavior;
            }, 50);
          } else {
            // Use native CSS smooth scrolling for subsequent clicks
            element.scrollLeft = targetSlide.offsetLeft;
          }
        }
      };

      if (isInitial) {
        // Execute immediately for the first render to prevent flash
        scrollAction();
      } else {
        // Allow DOM to update first for subsequent clicks
        setTimeout(scrollAction, 100);
      }
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

    let intersectionObserver;
    if (this.args.onVisiblePhotoChange && window.IntersectionObserver) {
      // Set up intersection observer to track which photo is currently "most" visible
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          for (let entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
              const eventId = entry.target.dataset.eventId;
              this.internalEventId = eventId;
              const photo = this.photos.find((p) => p.eventId === eventId);
              if (photo) {
                this.args.onVisiblePhotoChange(photo);
              }
            }
          }
        },
        {
          root: element,
          threshold: 0.5,
        }
      );

      const slides = element.querySelectorAll('.carousel-slide');
      slides.forEach((slide) => intersectionObserver.observe(slide));
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.unobserve(element);
      }
      if (intersectionObserver) {
        intersectionObserver.disconnect();
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

  @action
  handlePhotoClick(photo) {
    if (this.args.onPhotoClick) {
      this.args.onPhotoClick(photo);
    }
  }

  <template>
    {{#if this.photos.length}}
      <div class="photo-carousel {{this.variantClass}}">
        <div
          class="photo-carousel-track"
          {{this.setupCarousel}}
          {{this.resetScrollPosition @resetKey}}
          {{this.scrollToNewPhoto @scrollToEventId}}
          {{on "scroll" this.updateScrollState}}
        >
          {{#each this.photos as |photo|}}
            {{! template-lint-disable no-inline-styles no-invalid-interactive }}
            <div
              class="carousel-slide
                {{if photo.isLandscape 'landscape' 'portrait'}}
                {{if
                  (and @scrollToEventId (eq photo.eventId @scrollToEventId))
                  'active'
                }}"
              style={{photo.style}}
              data-event-id={{photo.eventId}}
              {{on "click" (fn this.handlePhotoClick photo)}}
            >
              {{#if photo.blurhash}}
                <Blurhash
                  @hash={{photo.blurhash}}
                  @width={{32}}
                  @height={{18}}
                  class="place-header-photo-blur"
                />
              {{/if}}

              {{#if this.isGalleryMain}}
                <img
                  data-src={{photo.url}}
                  class="place-header-photo
                    {{if photo.isLandscape 'landscape' 'portrait'}}"
                  alt={{@name}}
                  {{fadeInImage photo.url}}
                />
              {{else if this.isGalleryThumbnails}}
                <img
                  data-src={{if photo.thumbUrl photo.thumbUrl photo.url}}
                  class="place-header-photo
                    {{if photo.isLandscape 'landscape' 'portrait'}}"
                  alt={{@name}}
                  {{fadeInImage (if photo.thumbUrl photo.thumbUrl photo.url)}}
                />
              {{else}}
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
            <Icon
              @name="chevron-left"
              @color="currentColor"
              @size={{if (eq @variant "gallery-main") 24 16}}
            />
          </button>

          <button
            type="button"
            class="carousel-nav-btn next
              {{if this.cannotScrollRight 'disabled'}}"
            {{on "click" this.scrollRight}}
            disabled={{this.cannotScrollRight}}
            aria-label="Next photo"
          >
            <Icon
              @name="chevron-right"
              @color="currentColor"
              @size={{if (eq @variant "gallery-main") 24 16}}
            />
          </button>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
