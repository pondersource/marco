import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class PlaceRoute extends Route {
  @service storage;
  @service osm;
  @service mapUi;

  async model(params) {
    const id = params.place_id;

    if (
      id.startsWith('osm:node:') ||
      id.startsWith('osm:way:') ||
      id.startsWith('osm:relation:')
    ) {
      const [, type, osmId] = id.split(':');
      console.debug(`Fetching explicit OSM ${type}:`, osmId);
      return this.loadOsmPlace(osmId, type);
    }

    await this.waitForSync();

    let bookmark = this.storage.findPlaceById(id);

    if (bookmark) {
      console.debug('Found in bookmarks:', bookmark.title);
      return bookmark;
    }

    console.warn('Not in bookmarks:', id);
    return null;
  }

  async waitForSync() {
    if (this.storage.initialSyncDone) return;

    console.debug('Waiting for initial storage sync...');
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

  async afterModel(model) {
    // If the model comes from a search result (e.g. Photon), it might lack detailed geometry.
    // We want to ensure we have the full OSM object (with polygon/linestring) for display.
    if (
      model &&
      model.osmId &&
      model.osmType &&
      model.osmType !== 'node' &&
      !model.geojson
    ) {
      // Only fetch if it's NOT a node (nodes don't have interesting geometry anyway, just a point)
      // Although fetching nodes again ensures we have the latest tags too.
      console.debug('Model missing geometry, fetching full OSM details...');
      const fullDetails = await this.loadOsmPlace(model.osmId, model.osmType);

      if (fullDetails) {
        // Update the model in-place with the fuller details
        Object.assign(model, fullDetails);
        console.debug('Enriched model with full OSM details', model);
      }
    }

    // Notify the Map UI to show the pin
    if (model) {
      const options = { preventZoom: this.mapUi.preventNextZoom };
      this.mapUi.selectPlace(model, options);
      this.mapUi.preventNextZoom = false;
    }
    // Stop the pulse animation if it was running (e.g. redirected from search)
    this.mapUi.stopSearch();
  }

  deactivate() {
    // Clear the pin when leaving the route
    this.mapUi.clearSelection();
    // Reset the "return to search" flag so it doesn't persist to subsequent navigations
    this.mapUi.returnToSearch = false;
  }

  async loadOsmPlace(id, type = null) {
    try {
      // Use the direct OSM API fetch instead of Overpass for single object lookups
      const poi = await this.osm.fetchOsmObject(id, type);
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
