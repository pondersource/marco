import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';
import PlaceDetails from './place-details';

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
      if (confirm(`Delete "${place.title}"?`)) {
        try {
          await this.storage.removePlace(place);
          console.log('Place deleted:', place.title);

          // Notify parent to refresh map bookmarks
          if (this.args.onBookmarkChange) {
            this.args.onBookmarkChange();
          }

          // Update selection to the new saved place object
          // This updates the local UI state immediately without a route refresh
          if (this.args.onUpdate) {
             // When deleting, we revert to a "fresh" object or just close.
             // Since we close the sidebar below, we might not strictly need to update local state,
             // but it's good practice.
             // Reconstruct the "original" place without ID/Geohash/CreatedAt
             const freshPlace = {
                ...place,
                id: undefined,
                geohash: undefined,
                createdAt: undefined
             };
             this.args.onUpdate(freshPlace);
          }

           // Also fire onSelect if it exists (for list view)
          if (this.args.onSelect) {
             // Similar logic for select if needed, but we usually close.
             this.args.onSelect(null);
          }

          // Close sidebar after delete
          if (this.args.onClose) {
            this.args.onClose();
          }
        } catch (e) {
          console.error('Failed to delete:', e);
          alert('Failed to delete: ' + e.message);
        }
      }
    } else {
      // It's a fresh POI -> Save it
      const placeData = {
        title: place.osmTags.name || place.osmTags['name:en'] || 'Untitled Place',
        lat: place.lat,
        lon: place.lon,
        tags: [],
        url: place.osmTags.website,
        osmId: String(place.osmId || place.id), // Ensure we grab osmId if available, or fallback to id
        osmType: place.osmType,
        osmTags: place.osmTags,
      };

      try {
        const savedPlace = await this.storage.storePlace(placeData);
        console.log('Place saved:', placeData.title);

        // Notify parent to refresh map bookmarks
        if (this.args.onBookmarkChange) {
          this.args.onBookmarkChange();
        }

        // Update selection to the new saved place object
        if (this.args.onUpdate) {
          this.args.onUpdate(savedPlace);
        }

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
          <button
            type="button"
            class="back-btn"
            {{on "click" this.clearSelection}}
          >←</button>
          <h2>Details</h2>
        {{else}}
          <h2>Nearby Places</h2>
        {{/if}}
        <button
          type="button"
          class="close-btn"
          {{on "click" @onClose}}
        >×</button>
      </div>

      <div class="sidebar-content">
        {{#if @selectedPlace}}
          <PlaceDetails
            @place={{@selectedPlace}}
            @onToggleSave={{this.toggleSave}}
          />
        {{else}}
          {{#if @places}}
            <ul class="places-list">
              {{#each @places as |place|}}
                <li>
                  <button
                    type="button"
                    class="place-item"
                    {{on "click" (fn this.selectPlace place)}}
                  >
                    <div class="place-name">{{or
                        place.title
                        place.osmTags.name
                        place.osmTags.name:en
                        "Unnamed Place"
                      }}</div>
                    <div class="place-type">{{or
                        place.osmTags.amenity
                        place.osmTags.shop
                        place.osmTags.tourism
                        place.osmTags.leisure
                        place.osmTags.historic
                      }}</div>
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
