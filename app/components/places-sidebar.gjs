import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';

export default class PlacesSidebar extends Component {
  @service storage;

  @action
  selectPlace(place) {
    if (this.args.onSelect) {
      this.args.onSelect(place);
    }
  }

  @action
  clearSelection() {
    // Going "back" clears the specific selection but keeps the sidebar open (showing list)
    if (this.args.onSelect) {
      this.args.onSelect(null);
    }
    
    // Fallback logic: if no list available, close sidebar
    if (!this.args.places || this.args.places.length === 0) {
      if (this.args.onClose) {
        this.args.onClose();
      }
    }
  }

  @action
  async toggleSave(place) {
    if (!place) return;

    if (place.createdAt) {
      // It's a saved bookmark -> Delete it
      if (confirm(`Delete "${place.title}"?`)) {
        try {
          if (place.id && place.geohash) {
            await this.storage.places.remove(place.id, place.geohash);
            console.log('Place deleted:', place.title);
            
            // Close sidebar after delete
            if (this.args.onClose) {
              this.args.onClose();
            }
          } else {
             alert('Cannot delete: Missing ID or Geohash');
          }
        } catch (e) {
          console.error('Failed to delete:', e);
          alert('Failed to delete: ' + e.message);
        }
      }
    } else {
      // It's a fresh POI -> Save it
      const placeData = {
        title: place.tags.name || place.tags['name:en'] || 'Untitled Place',
        lat: place.lat,
        lon: place.lon,
        tags: [], 
        url: place.tags.website,
        osmId: String(place.id),
      };

      try {
        const savedPlace = await this.storage.places.store(placeData);
        console.log('Place saved:', placeData.title);
        
        // Update selection to the new saved place object
        if (this.args.onSelect) {
          this.args.onSelect(savedPlace);
        }
      } catch (error) {
        console.error('Failed to save place:', error);
        alert('Failed to save place: ' + error.message);
      }
    }
  }

  <template>
    <div class="sidebar">
      <div class="sidebar-header">
        {{#if @selectedPlace}}
             <button type="button" class="back-btn" {{on "click" this.clearSelection}}>←</button>
             <h2>Details</h2>
        {{else}}
             <h2>Nearby Places</h2>
        {{/if}}
        <button type="button" class="close-btn" {{on "click" @onClose}}>×</button>
      </div>
      
      <div class="sidebar-content">
        {{#if @selectedPlace}}
          <div class="place-details">
            <h3>{{or @selectedPlace.title @selectedPlace.tags.name @selectedPlace.tags.name:en "Unnamed Place"}}</h3>
            <p class="place-meta">
              {{#if @selectedPlace.tags.amenity}}
                {{or @selectedPlace.tags.amenity @selectedPlace.tags.shop @selectedPlace.tags.tourism}}
              {{else}}
                 {{@selectedPlace.description}}
              {{/if}}
            </p>
            
            {{#if (or @selectedPlace.url @selectedPlace.tags.website)}}
              <p><a href={{or @selectedPlace.url @selectedPlace.tags.website}} target="_blank" rel="noopener noreferrer">Website</a></p>
            {{/if}}

            {{#if @selectedPlace.tags.opening_hours}}
               <p><strong>Open:</strong> {{@selectedPlace.tags.opening_hours}}</p>
            {{/if}}

            <div class="actions">
               <button type="button" class={{if @selectedPlace.createdAt "btn-secondary" "btn-primary"}} {{on "click" (fn this.toggleSave @selectedPlace)}}>
                 {{if @selectedPlace.createdAt "Saved ✓" "Save"}}
               </button>
            </div>
            
            <div class="meta-info">
               {{#if (or @selectedPlace.osmId @selectedPlace.id)}}
                 <p><small>OSM ID: <a href="https://www.openstreetmap.org/{{if @selectedPlace.type @selectedPlace.type 'node'}}/{{or @selectedPlace.osmId @selectedPlace.id}}" target="_blank" rel="noopener noreferrer">{{or @selectedPlace.osmId @selectedPlace.id}}</a></small></p>
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
