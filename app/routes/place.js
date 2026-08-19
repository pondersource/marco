import Route from '@ember/routing/route';
import { service } from '@ember/service';

// Detects whether the fresh OSM data differs from the currently-shown model
// by more than ~1m of coordinate drift, or in any tag. Mirrors the relevant
// subset of `storage.refreshPlace`'s diff for the non-bookmark path.
function hasOsmChanges(place, fresh) {
  const latDiff = Math.abs((place.lat ?? 0) - (fresh.lat ?? 0));
  const lonDiff = Math.abs((place.lon ?? 0) - (fresh.lon ?? 0));
  if (latDiff > 0.00001 || lonDiff > 0.00001) return true;

  const oldTags = place.osmTags || {};
  const newTags = fresh.osmTags || {};
  const allKeys = new Set([...Object.keys(oldTags), ...Object.keys(newTags)]);
  for (const key of allKeys) {
    if (oldTags[key] !== newTags[key]) return true;
  }
  return false;
}

export default class PlaceRoute extends Route {
  @service storage;
  @service osm;
  @service mapUi;

  async model(params) {
    const id = params.place_id;

    let type, osmId;
    let isExplicitOsm = false;

    if (
      id.startsWith('osm:node:') ||
      id.startsWith('osm:way:') ||
      id.startsWith('osm:relation:')
    ) {
      isExplicitOsm = true;
      [, type, osmId] = id.split(':');
      console.debug(`Fetching explicit OSM ${type}:`, osmId);
    }

    let backgroundFetchPromise = null;
    if (isExplicitOsm) {
      backgroundFetchPromise = this.loadOsmPlace(osmId, type);
    }

    await this.waitForSync();

    let lookupId = isExplicitOsm ? osmId : id;
    let bookmark = this.storage.findPlaceById(lookupId);

    // Ensure type matches if we are looking up by osmId
    if (bookmark && isExplicitOsm && bookmark.osmType !== type) {
      bookmark = null; // Type mismatch, not the same OSM object
    }

    if (bookmark) {
      console.debug('Found in bookmarks:', bookmark.title);
      return bookmark;
    }

    if (isExplicitOsm) {
      console.debug(
        `Not in bookmarks, using explicitly fetched OSM ${type}:`,
        osmId
      );
      return await backgroundFetchPromise;
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
      this.mapUi.showSidebar();
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
    this.mapUi.returnToRoute = null;
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

  setupController(controller, model) {
    super.setupController(controller, model);
    this.checkUpdates(model);
  }

  async checkUpdates(place) {
    if (!place || !place.osmId || !place.osmType) return;

    // Bookmarked place — refresh via storage, which persists the update.
    if (place.id) {
      const updatedPlace = await this.storage.refreshPlace(place);
      if (updatedPlace) {
        // If an update occurred, refresh the map UI selection without moving
        // the camera. This ensures the sidebar shows the new data.
        this.mapUi.selectPlace(updatedPlace, { preventZoom: true });
      }
      return;
    }

    // Non-bookmarked explicit OSM place — fetch fresh and update the model
    // in-place if anything changed, so the sidebar reflects the latest OSM
    // data without requiring a re-open.
    try {
      const fresh = await this.osm.fetchOsmObject(place.osmId, place.osmType, {
        forceFresh: true,
      });
      if (fresh && hasOsmChanges(place, fresh)) {
        Object.assign(place, fresh);
        this.mapUi.selectPlace(place, { preventZoom: true });
      }
    } catch (e) {
      console.debug('[place] Fresh fetch failed for', place.osmId, e);
    }
  }

  serialize(model) {
    // If it's an OSM POI, use the explicit format first
    if (model.osmId && model.osmType) {
      return { place_id: `osm:${model.osmType}:${model.osmId}` };
    }
    // If the model is a saved bookmark (and not OSM, e.g. custom place), use its ID
    if (model.id) {
      return { place_id: model.id };
    }
    // Fallback
    return { place_id: model.osmId };
  }
}
