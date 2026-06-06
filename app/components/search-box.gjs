import Component from '@glimmer/component';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { task, timeout } from 'ember-concurrency';
import Icon from '#components/icon';
import humanizeOsmTag from '../helpers/humanize-osm-tag';
import { POI_CATEGORIES } from '../utils/poi-categories';
import { eq, or } from 'ember-truth-helpers';

export default class SearchBoxComponent extends Component {
  @service photon;
  @service osm;
  @service storage;
  @service router;
  @service mapUi;
  @service map; // Assuming we might need map context, but mostly we use router

  @tracked _internalQuery = '';
  @tracked results = [];
  @tracked isFocused = false;
  @tracked isLoading = false;

  get query() {
    return this.args.query ?? this._internalQuery;
  }

  set query(value) {
    this._internalQuery = value;
  }

  get showPopover() {
    return this.isFocused && this.results.length > 0;
  }

  @action
  handleInput(event) {
    const value = event.target.value;
    this.query = value;
    if (this.args.onQueryChange) {
      this.args.onQueryChange(value);
    }

    if (value.length < 2) {
      this.results = [];
      return;
    }

    this.searchTask.perform(value);
  }

  searchTask = task({ restartable: true }, async (term) => {
    await timeout(300);

    const query = typeof term === 'string' ? term : this.query;

    if (query.length < 2) return;

    this.isLoading = true;
    try {
      // Use map center if available for location bias
      let lat, lon;
      if (this.mapUi.currentCenter) {
        ({ lat, lon } = this.mapUi.currentCenter);
      }

      // Filter categories
      const q = query.toLowerCase();
      const categoryMatches = POI_CATEGORIES.filter((c) =>
        c.label.toLowerCase().includes(q)
      ).map((c) => ({
        source: 'category',
        title: c.label,
        id: c.id,
        icon: 'search',
      }));

      // Filter saved places (minimum 3 characters)
      let savedMatches = [];
      if (q.length >= 3) {
        savedMatches = this.storage.savedPlaces
          .filter((p) => p.title && p.title.toLowerCase().includes(q))
          .map((p) => ({
            source: 'saved',
            id: p.id,
            title: p.title,
            icon: 'bookmark',
            description: 'Saved place',
            osmId: p.osmId,
            osmType: p.osmType,
            lat: p.lat,
            lon: p.lon,
          }));
      }

      const results = await this.photon.search(query, lat, lon);

      // Deduplicate Photon results that are already in saved matches
      const savedOsmIds = new Set(
        savedMatches.map((s) => s.osmId).filter(Boolean)
      );
      const filteredPhotonResults = results.filter(
        (r) => !savedOsmIds.has(r.osmId)
      );

      this.results = [
        ...categoryMatches,
        ...savedMatches,
        ...filteredPhotonResults,
      ];
    } catch (e) {
      console.error('Search failed', e);
      this.results = [];
    } finally {
      this.isLoading = false;
    }
  });

  @action
  handleFocus() {
    this.isFocused = true;
    this.mapUi.setSearchBoxFocus(true);
    if (this.query.length >= 2 && this.results.length === 0) {
      this.searchTask.perform();
    }
  }

  @action
  handleBlur() {
    // Delay hiding so clicks on results can register
    setTimeout(() => {
      this.isFocused = false;
      this.mapUi.setSearchBoxFocus(false);
    }, 300);
  }

  @action
  handleSubmit(event) {
    event.preventDefault();
    if (!this.query) return;

    let queryParams = { q: this.query, selected: null, category: null };

    if (this.mapUi.currentCenter) {
      const { lat, lon } = this.mapUi.currentCenter;
      queryParams.lat = parseFloat(lat).toFixed(4);
      queryParams.lon = parseFloat(lon).toFixed(4);
    }

    this.router.transitionTo('search', { queryParams });
    this.isFocused = false;
  }

  @action
  selectResult(place) {
    if (place.source === 'category') {
      this.query = place.title;
      if (this.args.onQueryChange) {
        this.args.onQueryChange(place.title);
      }
      this.results = [];

      let lat = null,
        lon = null;
      if (this.mapUi.currentCenter) {
        ({ lat, lon } = this.mapUi.currentCenter);
        lat = lat?.toString();
        lon = lon?.toString();
      }

      this.router.transitionTo('search', {
        queryParams: {
          q: place.title,
          category: place.id,
          selected: null,
          lat: lat,
          lon: lon,
        },
      });
      return;
    }

    this.query = place.title;
    if (this.args.onQueryChange) {
      this.args.onQueryChange(place.title);
    }
    this.results = []; // Hide popover

    // If it's a custom saved place without an OSM ID, go to place details via internal ID
    if (place.source === 'saved' && place.id && !place.osmId) {
      this.router.transitionTo('place', place.id);
    }
    // If it has an OSM ID, go to place details via OSM ID
    else if (place.osmId) {
      // Format: osm:node:123
      // place.osmType is already normalized to 'node', 'way', or 'relation' by PhotonService
      const id = `osm:${place.osmType}:${place.osmId}`;
      this.router.transitionTo('place', id);
    } else {
      // Just a location (e.g. from Photon without OSM ID, though unlikely for Photon)
      // Or we can treat it as a search query
      this.router.transitionTo('search', {
        queryParams: {
          q: place.title,
          lat: place.lat,
          lon: place.lon,
          selected: null,
          category: null,
        },
      });
    }
  }

  @action
  clear() {
    this.searchTask.cancelAll();
    this.mapUi.stopLoading();
    this.osm.cancelAll();
    this.photon.cancelAll();

    this.query = '';
    this.results = [];
    if (this.args.onQueryChange) {
      this.args.onQueryChange('');
    }
    this.router.transitionTo('index');
  }

  <template>
    <div class="search-box">
      <form class="search-form" {{on "submit" this.handleSubmit}}>
        <button
          type="button"
          class="menu-btn-integrated"
          aria-label="Menu"
          {{on "click" @onToggleMenu}}
        >
          <Icon @name="menu" @size={{20}} @color="#5f6368" />
        </button>

        <input
          type="search"
          class="search-input"
          placeholder="Search places..."
          aria-label="Search places"
          value={{this.query}}
          {{on "input" this.handleInput}}
          {{on "focus" this.handleFocus}}
          {{on "blur" this.handleBlur}}
          autocomplete="off"
        />

        <button type="submit" class="search-submit-btn" aria-label="Search">
          {{#if
            (or
              (eq this.mapUi.loadingState.type "text")
              (eq this.mapUi.loadingState.type "category")
            )
          }}
            <Icon @name="loading-ring" @size={{20}} />
          {{else}}
            <Icon @name="search" @size={{20}} @color="#5f6368" />
          {{/if}}
        </button>

        {{#if this.query}}
          <button
            type="button"
            class="search-clear-btn"
            {{on "click" this.clear}}
            aria-label="Clear"
          >
            <Icon @name="x" @size={{20}} @color="#5f6368" />
          </button>
        {{/if}}
      </form>

      {{#if this.showPopover}}
        <div class="search-results-popover">
          <ul class="search-results-list">
            {{#each this.results as |result|}}
              <li>
                <button
                  type="button"
                  class="search-result-item"
                  {{on "click" (fn this.selectResult result)}}
                >
                  <div class="result-icon">
                    <Icon
                      @name={{if result.icon result.icon "map-pin"}}
                      @size={{16}}
                      @color="#666"
                    />
                  </div>
                  <div class="result-info">
                    <span class="result-title">{{result.title}}</span>
                    {{#if (eq result.source "osm")}}
                      <span class="result-desc">{{humanizeOsmTag
                          result.type
                        }}</span>
                    {{else}}
                      {{#if result.description}}
                        <span class="result-desc">{{result.description}}</span>
                      {{/if}}
                    {{/if}}
                  </div>
                </button>
              </li>
            {{/each}}
          </ul>
        </div>
      {{/if}}
    </div>
  </template>
}
