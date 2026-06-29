import Component from '@glimmer/component';
import { service } from '@ember/service';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { humanizeOsmTag } from '../utils/format-text';
import { getLocalizedName, getPlaceType } from '../utils/osm';
import { mapToStorageSchema } from '../utils/place-mapping';
import { getSocialInfo } from '../utils/social-links';
import { parsePlacePhotos } from '../utils/nostr';
import Icon from '../components/icon';
import PlaceEditForm from './place-edit-form';
import PlaceListsManager from './place-lists-manager';
import PlacePhotoUpload from './place-photo-upload';
import NostrConnect from './nostr-connect';
import Modal from './modal';
import PhotoCarousel from './photo-carousel';
import PhotoGallery from './photo-gallery';

import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PlaceDetails extends Component {
  @service storage;
  @service nostrAuth;
  @service nostrData;
  @service mapUi;
  @tracked isEditing = false;
  @tracked showLists = false;
  @tracked isPhotoUploadActive = false;
  @tracked isConnectingNostr = false;
  @tracked isGalleryOpen = false;
  @tracked selectedGalleryPhoto = null;
  @tracked isPhotoUploadModalOpen = false;
  @tracked isNostrConnectModalOpen = false;
  @tracked newlyUploadedPhotoId = null;

  @action
  handleUploadStateChange(isActive) {
    this.isPhotoUploadActive = isActive;
  }

  @action
  openPhotoUploadModal(e) {
    if (e) {
      e.preventDefault();
    }
    if (!this.nostrAuth.isConnected) {
      this.isNostrConnectModalOpen = true;
    } else {
      this.isPhotoUploadModalOpen = true;
    }
  }

  @action
  closePhotoUploadModal(eventId) {
    if (this.isPhotoUploadActive) return;
    this.isPhotoUploadModalOpen = false;
    if (typeof eventId === 'string') {
      this.newlyUploadedPhotoId = eventId;

      // Allow DOM to update first, then scroll to the top to show the new photo in the carousel
      setTimeout(() => {
        const sidebar = document.querySelector('.sidebar-content');
        if (sidebar) {
          sidebar.scrollTop = 0;
        }
      }, 50);
    }
  }

  @action
  closeNostrConnectModal() {
    this.isNostrConnectModalOpen = false;
  }

  @action
  onNostrConnected() {
    this.isNostrConnectModalOpen = false;
    this.isPhotoUploadModalOpen = true;
  }

  get isSaved() {
    return this.storage.isPlaceSaved(this.place.id || this.place.osmId);
  }

  get place() {
    return this.args.place || {};
  }

  get saveablePlace() {
    if (this.place.createdAt) {
      return this.place;
    }

    return mapToStorageSchema(this.place);
  }

  get tags() {
    return this.place.osmTags || {};
  }

  get name() {
    return this.place.title || getLocalizedName(this.tags) || 'Unnamed Place';
  }

  get photos() {
    const rawPhotos = this.nostrData.placePhotos;
    const parsedPhotos = parsePlacePhotos(rawPhotos);

    return parsedPhotos.map((photo) => ({
      ...photo,
      style: htmlSafe(`--slide-ratio: ${photo.aspectRatio};`),
    }));
  }

  @action
  startEditing() {
    if (!this.isSaved) return; // Only allow editing saved places
    this.isEditing = true;
  }

  @action
  cancelEditing() {
    this.isEditing = false;
  }

  @action
  toggleLists(event) {
    // Prevent this click from propagating to the document listener
    // which handles the "click outside" logic.
    if (event) {
      event.stopPropagation();
    }
    this.showLists = !this.showLists;
  }

  @action
  closeLists() {
    this.showLists = false;
  }

  @action
  async saveChanges(changes) {
    if (this.args.onSave) {
      await this.args.onSave({
        ...this.place,
        ...changes,
      });
    }
    this.isEditing = false;
  }

  get type() {
    return getPlaceType(this.tags);
  }

  get address() {
    const t = this.tags;
    const parts = [];

    // Helper to get value from multiple keys
    const get = (...keys) => {
      for (const k of keys) {
        if (t[k]) return t[k];
      }
      return null;
    };

    // Street + Number
    let street = get('addr:street', 'street');
    const number = get('addr:housenumber', 'housenumber');

    if (street) {
      if (number) {
        street = `${street} ${number}`;
      }
      parts.push(street);
    }

    // Postcode + City
    let city = get('addr:city', 'city');
    const postcode = get('addr:postcode', 'postcode');

    if (city) {
      if (postcode) {
        city = `${postcode} ${city}`;
      }
      parts.push(city);
    }

    // State + Country (if not already covered)
    const state = get('addr:state', 'state');
    const country = get('addr:country', 'country');

    if (state && state !== city) parts.push(state);
    if (country) parts.push(country);

    if (parts.length === 0) return null;
    return parts.join(', ');
  }

  formatMultiLine(val, type) {
    if (!val) return null;
    const parts = [
      ...new Set(
        val
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];
    if (parts.length === 0) return null;

    if (type === 'phone') {
      return htmlSafe(
        parts
          .map((p) => {
            const safeTel = p.replace(/[\s-]+/g, '');
            return `<a href="tel:${safeTel}">${p}</a>`;
          })
          .join('<br>')
      );
    }

    if (type === 'email') {
      return htmlSafe(
        parts.map((p) => `<a href="mailto:${p}">${p}</a>`).join('<br>')
      );
    }

    if (type === 'whatsapp') {
      return htmlSafe(
        parts
          .map((p) => {
            const safeTel = p.replace(/[\s-]+/g, '');
            return `<a href="https://wa.me/${safeTel}" target="_blank" rel="noopener noreferrer">${p}</a>`;
          })
          .join('<br>')
      );
    }

    if (type === 'url') {
      return htmlSafe(
        parts
          .map(
            (url) =>
              `<a href="${url}" target="_blank" rel="noopener noreferrer">${this.getDomain(
                url
              )}</a>`
          )
          .join('<br>')
      );
    }

    return htmlSafe(parts.join('<br>'));
  }

  get phone() {
    const rawValues = [
      this.tags.phone,
      this.tags['contact:phone'],
      this.tags.mobile,
      this.tags['contact:mobile'],
    ].filter(Boolean);

    if (rawValues.length === 0) return null;

    return this.formatMultiLine(rawValues.join(';'), 'phone');
  }

  get whatsapp() {
    const rawValues = [
      this.tags.whatsapp,
      this.tags['contact:whatsapp'],
    ].filter(Boolean);

    if (rawValues.length === 0) return null;

    return this.formatMultiLine(rawValues.join(';'), 'whatsapp');
  }

  get email() {
    const val = this.tags.email || this.tags['contact:email'];
    return this.formatMultiLine(val, 'email');
  }

  get website() {
    const val =
      this.place.url || this.tags.website || this.tags['contact:website'];
    return this.formatMultiLine(val, 'url');
  }

  getDomain(urlStr) {
    try {
      const url = new URL(urlStr);
      return url.hostname;
    } catch {
      return urlStr;
    }
  }

  get openingHours() {
    const val = this.tags.opening_hours;
    return this.formatMultiLine(val);
  }

  get cuisine() {
    if (!this.tags.cuisine) return null;
    return this.tags.cuisine
      .split(';')
      .map((c) => humanizeOsmTag(c))
      .join(', ');
  }

  get facebook() {
    return getSocialInfo(this.tags, 'facebook');
  }

  get instagram() {
    return getSocialInfo(this.tags, 'instagram');
  }

  get wikipedia() {
    const val = this.tags.wikipedia;
    if (!val) return null;
    return val
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)[0];
  }

  get geoLink() {
    const lat = this.place.lat;
    const lon = this.place.lon;
    if (!lat || !lon) return '#';
    const label = encodeURIComponent(this.name);
    return `geo:${lat},${lon}?q=${lat},${lon}(${label})`;
  }

  get visibleGeoLink() {
    const lat = this.place.lat;
    const lon = this.place.lon;
    if (!lat || !lon) return '';
    return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
  }

  get osmUrl() {
    const id = this.place.osmId;
    if (id) {
      const type = this.place.osmType || 'node';
      return `https://www.openstreetmap.org/${type}/${id}`;
    }

    const lat = this.place.lat;
    const lon = this.place.lon;
    if (!lat || !lon) return null;

    const viewLat = this.mapUi.currentCenter?.lat ?? lat;
    const viewLon = this.mapUi.currentCenter?.lon ?? lon;
    const zoom = this.mapUi.currentZoom ?? 17;
    const roundedZoom = Math.round(zoom);

    return `https://www.openstreetmap.org/search?lat=${lat}&lon=${lon}&zoom=${roundedZoom}#map=${roundedZoom}/${Number(viewLat).toFixed(5)}/${Number(viewLon).toFixed(5)}`;
  }

  get gmapsUrl() {
    const id = this.place.gmapsId || this.place.osmId;
    if (!id) return null;
    return `https://www.google.com/maps/search/?api=1&query=${this.name}&query=${this.place.lat},${this.place.lon}`;
  }

  get showDescription() {
    // If it's a Photon result, the description IS the address.
    // Since we are showing the address in the meta section (bottom),
    // we should hide the description to avoid duplication.
    if (this.place.source === 'photon') return false;

    // Otherwise (e.g. saved place with custom description), show it.
    return !!this.place.description;
  }

  @action
  openGallery(photo) {
    this.selectedGalleryPhoto = photo;
    this.isGalleryOpen = true;
  }

  @action
  closeGallery() {
    this.isGalleryOpen = false;
    this.selectedGalleryPhoto = null;
  }

  <template>
    <div class="place-details">
      {{#if this.isEditing}}
        <PlaceEditForm
          @place={{this.place}}
          @onSave={{this.saveChanges}}
          @onCancel={{this.cancelEditing}}
        />
      {{else}}
        <PhotoCarousel
          @variant="inline"
          @photos={{this.photos}}
          @name={{this.name}}
          @resetKey={{this.place.osmId}}
          @scrollToEventId={{this.newlyUploadedPhotoId}}
          @onPhotoClick={{this.openGallery}}
        />
        <h3>{{this.name}}</h3>
        <p class="place-type">
          {{this.type}}
        </p>
        {{#if this.showDescription}}
          <p class="place-description">
            {{this.place.description}}
          </p>
        {{/if}}
      {{/if}}

      <div class="actions">
        <div class="save-button-wrapper">
          <button
            type="button"
            class={{if this.isSaved "btn btn-secondary" "btn btn-outline"}}
            {{on "click" this.toggleLists}}
          >
            <Icon
              @name="bookmark"
              @color={{if this.isSaved "currentColor" "var(--link-color)"}}
            />
            {{if this.isSaved "Saved" "Save"}}
          </button>

          {{#if this.showLists}}
            <PlaceListsManager
              @place={{this.saveablePlace}}
              @onClose={{this.closeLists}}
              @isSaved={{this.isSaved}}
            />
          {{/if}}
        </div>

        {{#if this.isSaved}}
          <button
            type="button"
            class="btn btn-outline"
            title="Edit"
            disabled={{this.isEditing}}
            {{on "click" this.startEditing}}
          >
            <Icon @name="edit" @color="var(--link-color)" />
            Edit
          </button>
        {{/if}}
      </div>

      <div class="meta-info">

        {{#if this.cuisine}}
          <p class="content-with-icon">
            <Icon @name="fork-and-knife" @title="Cuisine" />
            <span>
              {{this.cuisine}}
            </span>
          </p>
        {{/if}}

        {{#if this.openingHours}}
          <p class="content-with-icon">
            <Icon @name="clock" @title="Opening hours" />
            <span>
              {{this.openingHours}}
            </span>
          </p>
        {{/if}}

        {{#if this.phone}}
          <p class="content-with-icon">
            <Icon @name="phone" @title="Phone" />
            <span>
              {{this.phone}}
            </span>
          </p>
        {{/if}}

        {{#if this.whatsapp}}
          <p class="content-with-icon">
            <Icon @name="whatsapp" @title="WhatsApp" />
            <span>
              {{this.whatsapp}}
            </span>
          </p>
        {{/if}}

        {{#if this.website}}
          <p class="content-with-icon">
            <Icon @name="globe" @title="Website" />
            <span>
              {{this.website}}
            </span>
          </p>
        {{/if}}

        {{#if this.email}}
          <p class="content-with-icon">
            <Icon @name="mail" @title="Email" />
            <span>
              {{this.email}}
            </span>
          </p>
        {{/if}}

        {{#if this.facebook}}
          <p class="content-with-icon">
            <Icon @name="facebook" @title="Facebook" />
            <span>
              <a
                href={{this.facebook.url}}
                target="_blank"
                rel="noopener noreferrer"
              >
                {{this.facebook.username}}
              </a>
            </span>
          </p>
        {{/if}}

        {{#if this.instagram}}
          <p class="content-with-icon">
            <Icon @name="instagram" @title="Instagram" />
            <span>
              <a
                href={{this.instagram.url}}
                target="_blank"
                rel="noopener noreferrer"
              >
                {{this.instagram.username}}
              </a>
            </span>
          </p>
        {{/if}}

        {{#if this.wikipedia}}
          <p class="content-with-icon">
            <Icon @name="wikipedia" @title="Wikipedia" />
            <span>
              <a
                href="https://wikipedia.org/wiki/{{this.wikipedia}}"
                target="_blank"
                rel="noopener noreferrer"
              >
                Wikipedia
              </a>
            </span>
          </p>
        {{/if}}

      </div>
      <div class="meta-info">

        {{#if this.address}}
          <p class="content-with-icon">
            <Icon @name="home" @title="Address" />
            <span>{{this.address}}</span>
          </p>
        {{/if}}

        <p class="content-with-icon">
          <Icon @name="map-pin" @title="Geo link" />
          <span>
            <a href={{this.geoLink}} target="_blank" rel="noopener noreferrer">
              {{this.visibleGeoLink}}
            </a>
          </span>
        </p>

        {{#if this.osmUrl}}
          <p class="content-with-icon">
            <Icon @name="map" />
            <span>
              <a href={{this.osmUrl}} target="_blank" rel="noopener noreferrer">
                OpenStreetMap
              </a>
            </span>
          </p>
        {{/if}}

        {{#if this.gmapsUrl}}
          <p class="content-with-icon">
            <Icon @name="map" />
            <span>
              <a
                href={{this.gmapsUrl}}
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Maps
              </a>
            </span>
          </p>
        {{/if}}

      </div>

      {{#if this.place.osmId}}
        <div class="meta-info">
          <p class="content-with-icon">
            <Icon @name="feather-camera" />
            <span>
              <button
                type="button"
                class="btn-link"
                {{on "click" this.openPhotoUploadModal}}
              >
                Add a photo
              </button>
            </span>
          </p>
        </div>
      {{/if}}
    </div>

    {{#if this.isPhotoUploadModalOpen}}
      <Modal
        @onClose={{this.closePhotoUploadModal}}
        @disableClose={{this.isPhotoUploadActive}}
      >
        <PlacePhotoUpload
          @place={{this.saveablePlace}}
          @onClose={{this.closePhotoUploadModal}}
          @onUploadStateChange={{this.handleUploadStateChange}}
        />
      </Modal>
    {{/if}}

    {{#if this.isNostrConnectModalOpen}}
      <Modal @onClose={{this.closeNostrConnectModal}}>
        <NostrConnect @onConnect={{this.onNostrConnected}} />
      </Modal>
    {{/if}}

    {{#if this.isGalleryOpen}}
      <PhotoGallery
        @photos={{this.photos}}
        @selectedPhoto={{this.selectedGalleryPhoto}}
        @placeName={{this.name}}
        @onClose={{this.closeGallery}}
      />
    {{/if}}
  </template>
}
