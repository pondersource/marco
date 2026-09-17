import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ActivityRoute extends Route {
  @service mapUi;
  @service nostrAuth;
  @service activity;

  activate() {
    this.mapUi.showSidebar();
    // Re-request profiles for senders that couldn't be resolved when the feed
    // was first loaded (e.g. metadata published since then). No-op on the first
    // entry, when there are no items yet.
    void this.activity.retryUnresolvedProfiles();
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    if (controller && controller.loadTask) {
      controller.loadTask.perform(this.nostrAuth.pubkey);
    }
  }

  deactivate() {
    // Don't call activity.stop() — keep state alive when navigating to place
    // details and back. The service's willDestroy() handles final cleanup.
  }
}
