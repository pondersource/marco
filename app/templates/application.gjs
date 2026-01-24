import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import PlacesSidebar from '#components/places-sidebar';
import AppHeader from '#components/app-header';
import SettingsPane from '#components/settings-pane';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { eq } from 'ember-truth-helpers';
import { and } from 'ember-truth-helpers';
import { on } from '@ember/modifier';

export default class ApplicationComponent extends Component {
  @service storage;
  @service router;

  @tracked nearbyPlaces = null;
  @tracked isSettingsOpen = false;
  // @tracked bookmarksVersion = 0; // Moved to storage service

  get isSidebarOpen() {
    return !!this.nearbyPlaces || this.router.currentRouteName === 'place';
  }

  constructor() {
    super(...arguments);
    console.log('Application component constructed');
    // Access the service to ensure it is instantiated
    this.storage;
  }

  @action
  showPlaces(places, selectedPlace = null) {
    // Helper to resolve a place to its bookmark if it exists
    const resolvePlace = (p) => {
      if (!p) return null;
      // We use the OSM ID to check if we already have this place saved
      const saved = this.storage.findPlaceById(p.osmId);
      return saved || p;
    };

    const resolvedSelected = resolvePlace(selectedPlace);
    const resolvedPlaces = places ? places.map(resolvePlace) : [];

    // If we have a specific place, transition to the route
    if (resolvedSelected) {
      // Pass the FULL object model to avoid re-fetching!
      // The Route's serialize() hook handles URL generation.
      this.router.transitionTo('place', resolvedSelected);
      this.nearbyPlaces = null; // Clear list when selecting specific
    } else if (resolvedPlaces && resolvedPlaces.length > 0) {
      // Show list case
      this.nearbyPlaces = resolvedPlaces;
      this.router.transitionTo('index');
    }
  }

  @action
  toggleSettings() {
    this.isSettingsOpen = !this.isSettingsOpen;
  }

  @action
  closeSettings() {
    this.isSettingsOpen = false;
  }

  @action
  selectFromList(place) {
    if (place) {
      // Optimize: Pass full object to avoid fetch
      this.router.transitionTo('place', place);
    }
  }

  @action
  closeSidebar() {
    this.nearbyPlaces = null;
    this.router.transitionTo('index');
  }

  @action
  refreshBookmarks() {
    this.storage.notifyChange();
  }

  <template>
    {{pageTitle "M/\RCO"}}

    <AppHeader @onToggleMenu={{this.toggleSettings}} />

    <div
      id="rs-widget-container"
      class={{if this.storage.isWidgetOpen "visible"}}
    ></div>

    {{#if this.storage.isWidgetOpen}}
      <div
        class="rs-backdrop"
        role="button"
        {{on "click" this.storage.closeWidget}}
      ></div>
    {{/if}}

    <Map
      @onPlacesFound={{this.showPlaces}}
      @isSidebarOpen={{this.isSidebarOpen}}
      @onOutsideClick={{this.closeSidebar}}
    />

    {{#if (and (eq this.router.currentRouteName "index") this.nearbyPlaces)}}
      <PlacesSidebar
        @places={{this.nearbyPlaces}}
        @onSelect={{this.selectFromList}}
        @onClose={{this.closeSidebar}}
      />
    {{/if}}

    {{#if this.isSettingsOpen}}
      <SettingsPane @onClose={{this.closeSettings}} />
    {{/if}}

    {{outlet}}
  </template>
}
