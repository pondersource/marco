import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';

export default class PlacesSidebar extends Component {
  @service storage;
  @tracked selectedPlace = null;

  constructor() {
    super(...arguments);
    // If a specific place was passed in (pre-selected by map), show it immediately
    if (this.args.initialPlace) {
      this.selectedPlace = this.args.initialPlace;
    }
  }

  @action
  selectPlace(place) {
    this.selectedPlace = place;
  }

  @action
  clearSelection() {
    this.selectedPlace = null;
    // If we were initialized with a single place (direct click), 
    // going "back" might mean closing or showing the list if available.
    // Logic: if we have a list (@places), go back to list.
    // If we only had one place (@initialPlace) and no list, maybe close?
    // For now, assuming @places is always passed if we want a list fallback.
    if (!this.args.places || this.args.places.length === 0) {
      this.args.onClose();
    }
  }

  @action
  async savePlace(poi) {
    if (!poi) return;

    // Map Overpass POI to our Place schema
    const placeData = {
      title: poi.tags.name || poi.tags['name:en'] || 'Untitled Place',
      lat: poi.lat,
      lon: poi.lon,
      tags: [], 
      url: poi.tags.website,
      osmId: String(poi.id),
      // We rely on the module to generate ID and Geohash
    };

    try {
      await this.storage.places.store(placeData);
      console.log('Place saved:', placeData.title);
      alert('Place saved!'); // Quick feedback for now
      
      // Notify the map component to refresh bookmarks if possible.
      // Since we don't have a direct callback here yet, we might rely on 
      // RemoteStorage events or just simple refresh if the map listens.
      if (this.args.onBookmarkSaved) {
        this.args.onBookmarkSaved();
      }
      
      if (this.args.onClose) {
        this.args.onClose();
      }
    } catch (error) {
      console.error('Failed to save place:', error);
      alert('Failed to save place: ' + error.message);
    }
  }

  <template>
    <div class="sidebar">
      <div class="sidebar-header">
        {{#if this.selectedPlace}}
             <button type="button" class="back-btn" {{on "click" this.clearSelection}}>←</button>
             <h2>Details</h2>
        {{else}}
             <h2>Nearby Places</h2>
        {{/if}}
        <button type="button" class="close-btn" {{on "click" @onClose}}>×</button>
      </div>
      
      <div class="sidebar-content">
        {{#if this.selectedPlace}}
          <div class="place-details">
            <h3>{{or this.selectedPlace.title this.selectedPlace.tags.name this.selectedPlace.tags.name:en "Unnamed Place"}}</h3>
            <p class="place-meta">
              {{#if this.selectedPlace.tags.amenity}}
                {{or this.selectedPlace.tags.amenity this.selectedPlace.tags.shop this.selectedPlace.tags.tourism}}
              {{else}}
                 {{!-- If it is a bookmark, it might just have an array of tags or description --}}
                 {{this.selectedPlace.description}}
              {{/if}}
            </p>
            
            {{#if (or this.selectedPlace.url this.selectedPlace.tags.website)}}
              <p><a href={{or this.selectedPlace.url this.selectedPlace.tags.website}} target="_blank" rel="noopener noreferrer">Website</a></p>
            {{/if}}

            {{#if this.selectedPlace.tags.opening_hours}}
               <p><strong>Open:</strong> {{this.selectedPlace.tags.opening_hours}}</p>
            {{/if}}

            <div class="actions">
               {{!-- Only show save button if it doesn't look like a saved bookmark (bookmarks have 'createdAt') --}}
               {{#unless this.selectedPlace.createdAt}}
                  <button type="button" class="btn-primary" {{on "click" (fn this.savePlace this.selectedPlace)}}>
                    Save Bookmark
                  </button>
               {{else}}
                  <button type="button" class="btn-secondary" disabled>
                    Saved ✓
                  </button>
               {{/unless}}
            </div>
            
            <div class="meta-info">
               {{#if (or this.selectedPlace.osmId this.selectedPlace.id)}}
                 <p><small>OSM ID: <a href="https://www.openstreetmap.org/{{if this.selectedPlace.type this.selectedPlace.type 'node'}}/{{or this.selectedPlace.osmId this.selectedPlace.id}}" target="_blank" rel="noopener noreferrer">{{or this.selectedPlace.osmId this.selectedPlace.id}}</a></small></p>
               {{/if}}
            </div>
          </div>
        {{else}}
          {{#if @places}}
            <ul class="places-list">
              {{#each @places as |place|}}
                <li>
                  <button type="button" class="place-item" {{on "click" (fn this.selectPlace place)}}>
                    <div class="place-name">{{or place.tags.name place.tags.name:en "Unnamed Place"}}</div>
                    <div class="place-type">{{or place.tags.amenity place.tags.shop place.tags.tourism "Point of Interest"}}</div>
                  </button>
                </li>
              {{/each}}
            </ul>
          {{else}}
            <p class="empty-state">No places found nearby.</p>
          {{/if}}
        {{/if}}
      </div>
    </div>
  </template>
}
