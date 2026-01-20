import Route from '@ember/routing/route';
import { service } from '@ember/service';

export default class PlaceRoute extends Route {
  @service storage;
  @service osm;

  async model(params) {
    const id = params.place_id;

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

    // 2. Fallback: Fetch from OSM
    console.log('Not in bookmarks, fetching from OSM:', id);
    try {
      const poi = await this.osm.getPoiById(id);
      if (poi) {
        console.debug('Found OSM POI:', poi);
        // Map to our Place schema so the sidebar understands it
        return {
          title: poi.tags.name || poi.tags['name:en'] || 'Untitled Place',
          lat: poi.lat || poi.center?.lat,
          lon: poi.lon || poi.center?.lon,
          url: poi.tags.website,
          osmId: String(poi.id),
          osmTags: poi.tags, // raw tags
          osmType: poi.type, // "node" or "way"
          description: poi.tags.description, // ensure description maps
          // No ID/Geohash/CreatedAt means it's not saved
        };
      }
    } catch (e) {
      console.error('Failed to fetch POI', e);
    }

    return null;
  }
}
