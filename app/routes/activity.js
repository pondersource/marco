import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ActivityRoute extends Route {
  @service mapUi;
  @service nostrAuth;
  @service activity;

  activate() {
    this.mapUi.showSidebar();
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    if (controller && controller.loadTask) {
      controller.loadTask.perform(this.nostrAuth.pubkey);
    }
  }

  deactivate() {
    this.activity.stop();
  }
}
