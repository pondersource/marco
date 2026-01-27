import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class PlaceRoute extends Route {
  @service storage;
  @service osm;
  @service mapUi;

  async model(params) {
    const id = params.place_id;

    if (id.startsWith('osm:node:') || id.startsWith('osm:way:')) {
      const [, type, osmId] = id.split(':');
      console.log(`Fetching explicit OSM ${type}:`, osmId);
      return this.loadOsmPlace(osmId, type);
    }

    await this.waitForSync();

    let bookmark = this.storage.findPlaceById(id);

    if (bookmark) {
      console.log('Found in bookmarks:', bookmark.title);
      return bookmark;
    }

    console.warn('Not in bookmarks:', id);
    return null;
  }

  async waitForSync() {
    if (this.storage.initialSyncDone) return;

    console.log('Waiting for initial storage sync...');
    const timeout = 5000;
    const start = Date.now();

    while (!this.storage.initialSyncDone) {
      if (Date.now() - start > timeout) {
        console.warn('Timed out waiting for initial sync');
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  afterModel(model) {
    // Notify the Map UI to show the pin
    if (model) {
      this.mapUi.selectPlace(model);
    }
    // Stop the pulse animation if it was running (e.g. redirected from search)
    this.mapUi.stopSearch();
  }

  deactivate() {
    // Clear the pin when leaving the route
    this.mapUi.clearSelection();
  }

  async loadOsmPlace(id, type = null) {
    try {
      const poi = await this.osm.getPoiById(id, type);
      if (poi) {
        console.debug('Found OSM POI:', poi);
        return poi;
      }
    } catch (e) {
      console.error('Failed to fetch POI', e);
    }
    return null;
  }

  serialize(model) {
    // If the model is a saved bookmark, use its ID
    if (model.id) {
      return { place_id: model.id };
    }
    // If it's an OSM POI, use the explicit format
    if (model.osmId && model.osmType) {
      return { place_id: `osm:${model.osmType}:${model.osmId}` };
    }
    // Fallback
    return { place_id: model.osmId };
  }
}
