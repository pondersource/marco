import Route from '@ember/routing/route';

export default class ListsListRoute extends Route {
  model(params) {
    // Resolve instantly so transition happens in 0ms!
    return { list_id: params.list_id };
  }

  setupController(controller, model) {
    controller.model = model;
    super.setupController(controller, model);
    if (model.list_id === 'saved') {
      return;
    }

    if (controller && controller.loadPlacesTask) {
      controller.loadPlacesTask.perform(model.list_id);
    } else {
      console.error('controller.loadPlacesTask is undefined');
    }
  }
}
