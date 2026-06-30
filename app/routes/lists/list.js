import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class ListsListRoute extends Route {
  @service storage;

  async model(params) {
    const listId = params.list_id;
    try {
      const places = await this.storage.getPlacesInList(listId);
      return { listId, places };
    } catch (e) {
      console.error('Failed to load places in list', listId, e);
      return { listId, places: [] };
    }
  }
}
