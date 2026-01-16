import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class ApplicationComponent extends Component {
  @service storage;

  @tracked nearbyPlaces = null;
  @tracked selectedPlace = null;
  @tracked isSidebarOpen = false;
  @tracked bookmarksVersion = 0;

  constructor() {
    super(...arguments);
    console.log('Application component constructed');
    // Access the service to ensure it is instantiated
    this.storage;
  }

  @action
  showPlaces(places, selectedPlace = null) {
    this.nearbyPlaces = places;
    this.selectedPlace = selectedPlace;
    this.isSidebarOpen = true;
  }

  @action
  selectPlace(place) {
    this.selectedPlace = place;
  }

  @action
  closeSidebar() {
    this.isSidebarOpen = false;
    this.nearbyPlaces = null;
    this.selectedPlace = null;
  }

  @action
  refreshBookmarks() {
    this.bookmarksVersion++;
  }

  <template>
    {{pageTitle "M/\RCO"}}

    <Map 
      @onPlacesFound={{this.showPlaces}} 
      @isSidebarOpen={{this.isSidebarOpen}}
      @onOutsideClick={{this.closeSidebar}}
      @bookmarksVersion={{this.bookmarksVersion}}
    />

    {{#if this.isSidebarOpen}}
      <PlacesSidebar 
        @places={{this.nearbyPlaces}} 
        @selectedPlace={{this.selectedPlace}}
        @onSelect={{this.selectPlace}}
        @onClose={{this.closeSidebar}} 
        @onBookmarkChange={{this.refreshBookmarks}}
      />
    {{/if}}

    {{outlet}}
  </template>
}
