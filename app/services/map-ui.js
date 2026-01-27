import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class MapUiService extends Service {
  @tracked selectedPlace = null;
  @tracked isSearching = false;
  @tracked isCreating = false;
  @tracked creationCoordinates = null;

  selectPlace(place) {
    this.selectedPlace = place;
  }

  clearSelection() {
    this.selectedPlace = null;
  }

  startSearch() {
    this.isSearching = true;
    this.isCreating = false;
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
}
