import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import capitalize from '../helpers/capitalize';
import Icon from '../components/icon';

import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PlaceDetails extends Component {
  @tracked isEditing = false;
  @tracked editTitle = '';
  @tracked editDescription = '';

  constructor() {
    super(...arguments);
    this.resetEditFields();
  }

  get place() {
    return this.args.place || {};
  }

  get tags() {
    return this.place.osmTags || {};
  }

  get name() {
    return (
      this.place.title ||
      this.tags.name ||
      this.tags['name:en'] ||
      'Unnamed Place'
    );
  }

  @action
  resetEditFields() {
    this.editTitle = this.name;
    this.editDescription = this.place.description || '';
  }

  @action
  startEditing() {
    if (!this.place.createdAt) return; // Only allow editing saved places
    this.resetEditFields();
    this.isEditing = true;
  }

  @action
  cancelEditing() {
    this.isEditing = false;
  }

  @action
  async saveChanges(event) {
    event.preventDefault();
    if (this.args.onSave) {
      await this.args.onSave({
        ...this.place,
        title: this.editTitle,
        description: this.editDescription,
      });
    }
    this.isEditing = false;
  }

  @action
  updateTitle(e) {
    this.editTitle = e.target.value;
  }

  @action
  updateDescription(e) {
    this.editDescription = e.target.value;
  }

  get type() {
    return (
      this.tags.amenity ||
      this.tags.shop ||
      this.tags.tourism ||
      this.tags.leisure ||
      this.tags.historic ||
      'Point of Interest'
    );
  }

  get address() {
    const t = this.tags;
    const parts = [];

    // Street + Number
    if (t['addr:street']) {
      let street = t['addr:street'];
      if (t['addr:housenumber']) {
        street += ` ${t['addr:housenumber']}`;
      }
      parts.push(street);
    }

    // Postcode + City
    if (t['addr:city']) {
      let city = t['addr:city'];
      if (t['addr:postcode']) {
        city = `${t['addr:postcode']} ${city}`;
      }
      parts.push(city);
    }

    if (parts.length === 0) return null;
    return parts.join(', ');
  }

  get phone() {
    return this.tags.phone || this.tags['contact:phone'];
  }

  get website() {
    return this.place.url || this.tags.website || this.tags['contact:website'];
  }

  get websiteDomain() {
    const url = new URL(this.website);
    return url.hostname;
  }

  get openingHours() {
    return this.tags.opening_hours;
  }

  get cuisine() {
    if (!this.tags.cuisine) return null;
    return this.tags.cuisine
      .split(';')
      .map((c) => capitalize.compute([c]))
      .map((c) => c.replace('_', ' '))
      .join(', ');
  }

  get wikipedia() {
    return this.tags.wikipedia;
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
    return `${lat}, ${lon}`;
  }

  get osmUrl() {
    const id = this.place.osmId;
    if (!id) return null;
    const type = this.place.osmType || 'node';
    return `https://www.openstreetmap.org/${type}/${id}`;
  }

  get gmapsUrl() {
    return `https://www.google.com/maps/search/?api=1&query=${this.name}&query=${this.place.lat},${this.place.lon}`;
  }

  <template>
    <div class="place-details">
      {{#if this.isEditing}}
        <form class="edit-form" {{on "submit" this.saveChanges}}>
          <div class="form-group">
            <label for="edit-title">Title</label>
            <input
              id="edit-title"
              type="text"
              value={{this.editTitle}}
              {{on "input" this.updateTitle}}
              class="form-control"
            />
          </div>
          <div class="form-group">
            <label for="edit-desc">Description</label>
            <textarea
              id="edit-desc"
              value={{this.editDescription}}
              {{on "input" this.updateDescription}}
              class="form-control"
              rows="3"
            ></textarea>
          </div>
          <div class="edit-actions">
            <button type="submit" class="btn btn-blue">Save</button>
            <button type="button" class="btn btn-outline" {{on "click" this.cancelEditing}}>Cancel</button>
          </div>
        </form>
      {{else}}
        <h3>{{this.name}}</h3>
        <p class="place-type">
          {{this.type}}
        </p>
        {{#if this.place.description}}
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
          <p>
            <strong>Cuisine:</strong>
            {{this.cuisine}}
          </p>
        {{/if}}

        {{#if this.openingHours}}
          <p class="content-with-icon">
            <Icon @name="clock" @title="Opening hours" />
            <span>{{this.openingHours}}</span>
          </p>
        {{/if}}

        {{#if this.phone}}
          <p class="content-with-icon">
            <Icon @name="phone" @title="Phone" />
            <span><a href="tel:{{this.phone}}">{{this.phone}}</a></span>
          </p>
        {{/if}}

        {{#if this.website}}
          <p class="content-with-icon">
            <Icon @name="globe" @title="Website" />
            <span><a
                href={{this.website}}
                target="_blank"
                rel="noopener noreferrer"
              >{{this.websiteDomain}}</a></span>
          </p>
        {{/if}}

        {{#if this.wikipedia}}
          <p>
            <strong>Wikipedia:</strong>
            <a
              href="https://wikipedia.org/wiki/{{this.wikipedia}}"
              target="_blank"
              rel="noopener noreferrer"
            >Article</a>
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
            <Icon @name="map" @title="OSM ID" />
            <span>
              <a href={{this.osmUrl}} target="_blank" rel="noopener noreferrer">
                OpenStreetMap
              </a>
            </span>
          </p>
        {{/if}}

        <p class="content-with-icon">
          <Icon @name="map" @title="OSM ID" />
          <span>
            <a href={{this.gmapsUrl}} target="_blank" rel="noopener noreferrer">
              Google Maps
            </a>
          </span>
        </p>

      </div>
    </div>
  </template>
}
