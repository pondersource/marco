import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class IndexRoute extends Route {
  @service mapUi;

  activate() {
    this.mapUi.clearSearchResults();
  }
}
