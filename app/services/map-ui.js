import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class MapUiService extends Service {
  @service nostrData;

  @tracked selectedPlace = null;
  @tracked isSearching = false;
  @tracked isCreating = false;
  @tracked creationCoordinates = null;
  @tracked returnToSearch = false;
  @tracked currentCenter = null;
  @tracked currentBounds = null;
  @tracked searchBoxHasFocus = false;
  @tracked selectionOptions = {};
  @tracked preventNextZoom = false;
  @tracked searchResults = [];
  @tracked currentSearch = null;
  @tracked loadingState = null;

  selectPlace(place, options = {}) {
    this.selectedPlace = place;
    this.selectionOptions = options;
    this.nostrData.loadPhotosForPlace(place);
  }

  clearSelection() {
    this.selectedPlace = null;
    this.selectionOptions = {};
    this.preventNextZoom = false;
    this.nostrData.loadPhotosForPlace(null);
  }

  setSearchResults(results) {
    this.searchResults = results || [];
  }

  clearSearchResults() {
    this.searchResults = [];
    this.currentSearch = null;
  }

  startSearch() {
    this.isSearching = true;
    this.isCreating = false;
    this.preventNextZoom = false;
  }

  stopSearch() {
    this.isSearching = false;
  }

  startCreating() {
    this.isCreating = true;
    this.isSearching = false;
  }

  stopCreating() {
    this.isCreating = false;
    this.creationCoordinates = null;
  }

  updateCreationCoordinates(lat, lon) {
    this.creationCoordinates = { lat, lon };
  }

  setSearchBoxFocus(isFocused) {
    this.searchBoxHasFocus = isFocused;
  }

  updateCenter(lat, lon) {
    this.currentCenter = { lat, lon };
  }

  updateBounds(bounds) {
    this.currentBounds = bounds;
  }

  startLoading(type, value) {
    this.loadingState = { type, value };
  }

  stopLoading(type = null, value = null) {
    // If no arguments provided, force stop (legacy/cleanup)
    if (!type && !value) {
      this.loadingState = null;
      return;
    }

    // Only clear if the current state matches the request
    // This prevents a previous search from clearing the state of a new search
    if (
      this.loadingState &&
      this.loadingState.type === type &&
      this.loadingState.value === value
    ) {
      this.loadingState = null;
    }
  }
}
