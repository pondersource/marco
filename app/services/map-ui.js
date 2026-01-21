import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class MapUiService extends Service {
  @tracked selectedPlace = null;

  selectPlace(place) {
    this.selectedPlace = place;
  }

  clearSelection() {
    this.selectedPlace = null;
  }
}
