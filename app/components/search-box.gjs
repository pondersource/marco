import Component from '@glimmer/component';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { task, timeout } from 'ember-concurrency';
import Icon from '#components/icon';
import humanizeOsmTag from '../helpers/humanize-osm-tag';
import eq from 'ember-truth-helpers/helpers/eq';

export default class SearchBoxComponent extends Component {
  @service photon;
  @service router;
  @service mapUi;
  @service map; // Assuming we might need map context, but mostly we use router

  @tracked query = '';
  @tracked results = [];
  @tracked isFocused = false;
  @tracked isLoading = false;

  get showPopover() {
    return this.isFocused && this.results.length > 0;
  }

  @action
  handleInput(event) {
    this.query = event.target.value;
    if (this.args.onQueryChange) {
      this.args.onQueryChange(this.query);
    }

    if (this.query.length < 2) {
      this.results = [];
      return;
    }

    this.searchTask.perform();
  }

  searchTask = task({ restartable: true }, async () => {
    await timeout(300);

    if (this.query.length < 2) return;

    this.isLoading = true;
    try {
      // Use map center if available for location bias
      let lat, lon;
      if (this.mapUi.currentCenter) {
        ({ lat, lon } = this.mapUi.currentCenter);
      }
      const results = await this.photon.search(this.query, lat, lon);
      this.results = results;
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

    let queryParams = { q: this.query, selected: null };

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
    this.query = place.title;
    this.results = []; // Hide popover

    // If it has an OSM ID, go to place details
    if (place.osmId) {
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
        },
      });
    }
  }

  @action
  clear() {
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
          <Icon @name="search" @size={{20}} @color="#5f6368" />
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
                    <Icon @name="map-pin" @size={{16}} @color="#666" />
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
