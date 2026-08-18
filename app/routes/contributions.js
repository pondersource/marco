import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ContributionsRoute extends Route {
  @service mapUi;
  @service nostrAuth;
  @service contributions;

  activate() {
    this.mapUi.showSidebar();
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    if (controller && controller.loadContributionsTask) {
      controller.loadContributionsTask.perform(this.nostrAuth.pubkey);
    }
  }

  deactivate() {
    this.contributions.stop();
  }
}
