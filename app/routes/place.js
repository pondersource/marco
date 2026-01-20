import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class PlaceRoute extends Route {
  @service storage;
  @service osm;

  async model(params) {
    const id = params.place_id;

    // Check for explicit OSM prefixes
    if (id.startsWith('osm:node:') || id.startsWith('osm:way:')) {
      const [, type, osmId] = id.split(':');
      console.log(`Fetching explicit OSM ${type}:`, osmId);
      return this.loadOsmPlace(osmId, type);
    }

    // 1. Try to find in local bookmarks
    // We rely on the service maintaining the list
    let bookmark = this.storage.findPlaceById(id);

    // If not found instantly, maybe wait for storage ready?
    // For now assuming storage is reasonably fast or "ready" has fired.
    // If we land here directly on refresh, "savedPlaces" might be empty initially.
    // We could retry or wait, but simpler to fall back to OSM for now.
    // Ideally, we await `storage.loadAllPlaces()` promise if it's pending.

    if (bookmark) {
      console.log('Found in bookmarks:', bookmark.title);
      return bookmark;
    }

    // 2. Fallback: Fetch from OSM (assuming generic ID or old format)
    console.log('Not in bookmarks, fetching from OSM:', id);
    return this.loadOsmPlace(id);
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
