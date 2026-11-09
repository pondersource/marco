import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { hasCoordinates } from '../../utils/geo';

export default class PlaceNewRoute extends Route {
  @service mapUi;

  queryParams = {
    lat: { refreshModel: true },
    lon: { refreshModel: true },
  };

  model(params) {
    return {
      lat: parseFloat(params.lat),
      lon: parseFloat(params.lon),
    };
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    if (hasCoordinates(model.lat, model.lon)) {
      this.mapUi.updateCreationCoordinates(model.lat, model.lon);
    }
    this.mapUi.startCreating();
    this.mapUi.showSidebar();
  }

  deactivate() {
    this.mapUi.stopCreating();
  }
}
