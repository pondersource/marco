import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ListsListRoute extends Route {
  @service storage;

  model(params) {
    // Resolve instantly so transition happens in 0ms!
    return { list_id: params.list_id };
  }

  setupController(controller, model) {
    console.debug('DEBUG: setupController controller is:', controller);
    console.debug(
      'DEBUG: controller.loadPlacesTask is:',
      controller?.loadPlacesTask
    );
    controller.model = model;
    super.setupController(controller, model);
    if (controller && controller.loadPlacesTask) {
      controller.loadPlacesTask.perform(model.list_id);
    } else {
      console.error('DEBUG: ERROR! controller.loadPlacesTask is undefined!');
    }
  }
}
