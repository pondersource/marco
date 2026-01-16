import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { eq } from 'ember-truth-helpers';
import { and } from 'ember-truth-helpers';

export default class ApplicationComponent extends Component {
  @service storage;
  @service router;

  @tracked nearbyPlaces = null;
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
    // If we have a specific place, transition to the route
    if (selectedPlace) {
      // Use ID if available, or osmId
      const id = selectedPlace.id || selectedPlace.osmId;
      if (id) {
        this.router.transitionTo('place', id);
      }
      this.nearbyPlaces = null; // Clear list when selecting specific
    } else if (places && places.length > 0) {
      // Show list case
      this.nearbyPlaces = places;
      this.router.transitionTo('index');
    }
  }

  @action
  selectFromList(place) {
    if (place) {
      const id = place.id || place.osmId;
      if (id) {
        this.router.transitionTo('place', id);
      }
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

    {{outlet}}
  </template>
}
