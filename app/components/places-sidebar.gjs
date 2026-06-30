import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';
import eq from 'ember-truth-helpers/helpers/eq';
import and from 'ember-truth-helpers/helpers/and';
import not from 'ember-truth-helpers/helpers/not';
import PlaceDetails from './place-details';
import Icon from './icon';
import humanizeOsmTag from '../helpers/humanize-osm-tag';
import { getLocalizedName, getPlaceType } from '../utils/osm';
import restoreScroll from '../modifiers/restore-scroll';

export default class PlacesSidebar extends Component {
  @service storage;
  @service router;
  @service mapUi;
  @service nostrData;

  @action
  createNewPlace() {
    const qp = this.router.currentRoute.queryParams;
    const lat = qp.lat;
    const lon = qp.lon;

    if (lat && lon) {
      this.router.transitionTo('place.new', { queryParams: { lat, lon } });
    } else {
      // Fallback (shouldn't happen in search context)
      this.router.transitionTo('place.new', {
        queryParams: { lat: 0, lon: 0 },
      });
    }
  }

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
  }

  @action
  async toggleSave(place) {
    if (!place) return;

    if (place.createdAt) {
      // Direct delete without confirmation
      try {
        await this.storage.removePlace(place);
        console.debug('Place deleted:', place.title);

        // Notify parent to refresh map bookmarks
        if (this.args.onBookmarkChange) {
          this.args.onBookmarkChange();
        }

        if (this.args.onUpdate) {
          // Reconstruct the "original" place without ID/Geohash/CreatedAt
          const freshPlace = {
            ...place,
            id: undefined,
            geohash: undefined,
            createdAt: undefined,
          };
          this.args.onUpdate(freshPlace);
        }

        // Also fire onSelect if it exists (for list view)
        if (this.args.onSelect) {
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
    } else {
      // It's a fresh POI -> Save it
      const placeData = {
        title: getLocalizedName(place.osmTags, 'Untitled Place'),
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
        console.debug('Place saved:', placeData.title);

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

  @action
  async updateBookmark(updatedPlace) {
    try {
      const savedPlace = await this.storage.updatePlace(updatedPlace);
      console.debug('Place updated:', savedPlace.title);

      // Notify parent to refresh map/lists
      if (this.args.onBookmarkChange) {
        this.args.onBookmarkChange();
      }

      // Update local view
      if (this.args.onUpdate) {
        this.args.onUpdate(savedPlace);
      }
    } catch (e) {
      console.error('Failed to update place:', e);
      alert('Failed to update place: ' + e.message);
    }
  }

  get isNearbySearch() {
    const qp = this.router.currentRoute.queryParams;
    return !qp.q && !qp.category && qp.lat && qp.lon;
  }

  get hasHeaderPhoto() {
    return (
      this.args.selectedPlace &&
      this.nostrData.placePhotos &&
      this.nostrData.placePhotos.length > 0
    );
  }

  <template>
    <div class="sidebar">
      <div
        class="sidebar-header
          {{if this.hasHeaderPhoto 'no-border'}}
          {{if (and (not @selectedPlace) @onBack) 'has-back-btn'}}"
      >
        {{#if @selectedPlace}}
          <button
            type="button"
            class="back-btn"
            {{on "click" this.clearSelection}}
          ><Icon @name="arrow-left" @size={{20}} @color="#333" /></button>
        {{else}}
          {{#if @onBack}}
            <button type="button" class="back-btn" {{on "click" @onBack}}><Icon
                @name="arrow-left"
                @size={{20}}
                @color="#333"
              /></button>
          {{/if}}
          {{#if @onBack}}
            <h2 class="sidebar-header-text-centered">
              <span class="sidebar-header-icon-wrapper">
                <Icon
                  @name="bookmark"
                  @size={{20}}
                  @color={{or @color "#898989"}}
                />
              </span>
              {{@title}}
            </h2>
          {{else}}
            {{#if this.isNearbySearch}}
              <h2><Icon @name="target" @size={{20}} @color="#ea4335" />
                Nearby</h2>
            {{else}}
              <h2><Icon @name="search" @size={{20}} @color="#333" />
                Results</h2>
            {{/if}}
          {{/if}}
        {{/if}}
        <button type="button" class="close-btn" {{on "click" @onClose}}><Icon
            @name="x"
            @size={{20}}
            @color="#333"
          /></button>
      </div>

      <div class="sidebar-content" {{restoreScroll @scrollTop}}>
        {{#if @selectedPlace}}
          <PlaceDetails
            @place={{@selectedPlace}}
            @onToggleSave={{this.toggleSave}}
            @onSave={{this.updateBookmark}}
          />
        {{else}}
          {{#if @isLoading}}
            <div class="sidebar-loading">
              <Icon @name="loading-ring" @size={{24}} @color="#898989" />
            </div>
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
                      <div class="place-type">
                        {{#if (eq place.source "osm")}}
                          {{humanizeOsmTag place.type}}
                        {{else if (eq place.source "photon")}}
                          {{place.description}}
                        {{else if (getPlaceType place.osmTags)}}
                          {{getPlaceType place.osmTags}}
                        {{else}}
                          Saved place
                        {{/if}}
                      </div>
                    </button>
                  </li>
                {{/each}}
              </ul>
            {{else}}
              {{#if this.isNearbySearch}}
                <p class="empty-state">No places found nearby.</p>
              {{else}}
                <p class="empty-state">No results found.</p>
              {{/if}}
            {{/if}}

            <button
              type="button"
              class="btn btn-outline create-place"
              {{on "click" this.createNewPlace}}
            >
              <Icon @name="plus" @size={{18}} @color="var(--link-color)" />
              Create new place
            </button>
          {{/if}}
        {{/if}}
      </div>
    </div>
  </template>
}
