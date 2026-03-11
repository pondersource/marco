import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { humanizeOsmTag } from '../utils/format-text';
import { getLocalizedName, getPlaceType } from '../utils/osm';
import { getSocialInfo } from '../utils/social-links';
import Icon from '../components/icon';
import PlaceEditForm from './place-edit-form';

import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PlaceDetails extends Component {
  @tracked isEditing = false;

  get place() {
    return this.args.place || {};
  }

  get tags() {
    return this.place.osmTags || {};
  }

  get name() {
    return this.place.title || getLocalizedName(this.tags) || 'Unnamed Place';
  }

  @action
  startEditing() {
    if (!this.place.createdAt) return; // Only allow editing saved places
    this.isEditing = true;
  }

  @action
  cancelEditing() {
    this.isEditing = false;
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
    const parts = val
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;

    if (type === 'phone') {
      return htmlSafe(
        parts.map((p) => `<a href="tel:${p}">${p}</a>`).join('<br>')
      );
    }

    if (type === 'email') {
      return htmlSafe(
        parts.map((p) => `<a href="mailto:${p}">${p}</a>`).join('<br>')
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
    const val = this.tags.phone || this.tags['contact:phone'];
    return this.formatMultiLine(val, 'phone');
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
    if (!id) return null;
    const type = this.place.osmType || 'node';
    return `https://www.openstreetmap.org/${type}/${id}`;
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

  <template>
    <div class="place-details">
      {{#if this.isEditing}}
        <PlaceEditForm
          @place={{this.place}}
          @onSave={{this.saveChanges}}
          @onCancel={{this.cancelEditing}}
        />
      {{else}}
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
        <button
          type="button"
          class={{if
            this.place.createdAt
            "btn btn-secondary"
            "btn btn-outline"
          }}
          {{on "click" (fn @onToggleSave this.place)}}
        >
          <Icon
            @name="bookmark"
            @color={{if this.place.createdAt "currentColor" "#007bff"}}
          />
          {{if this.place.createdAt "Saved" "Save"}}
        </button>

        {{#if this.place.createdAt}}
          <button
            type="button"
            class="btn btn-outline"
            title="Edit"
            {{on "click" this.startEditing}}
          >
            <Icon @name="edit" @color="#007bff" />
            Edit
          </button>
        {{/if}}
      </div>

      <div class="meta-info">

        {{#if this.cuisine}}
          <p class="cuisine-info">
            <strong>Cuisine:</strong>
            {{this.cuisine}}
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
            <Icon @name="wikipedia" @title="Wikipedia" @filled={{true}} />
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
    </div>
  </template>
}
