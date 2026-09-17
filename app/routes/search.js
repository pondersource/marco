import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class SearchRoute extends Route {
  @service mapUi;
  @service toast;

  queryParams = {
    lat: { refreshModel: true },
    lon: { refreshModel: true },
    q: { refreshModel: true },
    selected: { refreshModel: true },
    category: { refreshModel: true },
  };

  model(params) {
    // Just return params, doing the async fetch in the controller
    return params;
  }

  setupController(controller, model) {
    super.setupController(controller, model);

    // Trigger the background task to fetch results
    controller.fetchResultsTask.perform(model);
  }

  resetController(controller, isExiting) {
    if (isExiting) {
      controller.fetchResultsTask.cancelAll();
      this.mapUi.stopSearch();
    }
  }

  @action
  error(error, transition) {
    this.mapUi.stopSearch();
    this.toast.show('Search request failed. Please try again.');
    if (transition) {
      transition.abort();
    }
    return false;
  }
}
