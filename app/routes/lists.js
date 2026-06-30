import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ListsRoute extends Route {
  @service mapUi;

  activate() {
    this.mapUi.showSidebar();
  }
}
