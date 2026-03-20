import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { getDistance } from '../utils/geo';

export default class SearchRoute extends Route {
  @service osm;
  @service photon;
  @service mapUi;
  @service storage;
  @service router;

  queryParams = {
    lat: { refreshModel: true },
    lon: { refreshModel: true },
    q: { refreshModel: true },
    selected: { refreshModel: true },
    category: { refreshModel: true },
  };

  async model(params) {
    const lat = params.lat ? parseFloat(params.lat) : null;
    const lon = params.lon ? parseFloat(params.lon) : null;
    let pois = [];

    // Case 0: Category Search (category parameter present)
    if (params.category && lat && lon) {
      // We need bounds. If we have active map state, use it.
      let bounds = this.mapUi.currentBounds;

      // If we don't have bounds (direct URL visit), estimate them from lat/lon/zoom(16)
      // or just use a fixed box around the center.
      if (!bounds) {
        // Approximate 0.01 degrees ~ 1km at equator. A viewport is roughly 0.02x0.01 at zoom 16?
        // Let's take a safe box of ~1km radius.
        const delta = 0.01;
        bounds = {
          minLat: lat - delta,
          maxLat: lat + delta,
          minLon: lon - delta,
          maxLon: lon + delta,
        };
      }

      pois = await this.osm.getCategoryPois(bounds, params.category);

      // Sort by distance from center
      pois = pois
        .map((p) => ({
          ...p,
          _distance: getDistance(lat, lon, p.lat, p.lon),
        }))
        .sort((a, b) => a._distance - b._distance);
    }
    // Case 1: Text Search (q parameter present)
    else if (params.q) {
      // Search with Photon (using lat/lon for bias if available)
      pois = await this.photon.search(params.q, lat, lon);

      // Search local bookmarks by name
      const queryLower = params.q.toLowerCase();
      const localMatches = this.storage.savedPlaces.filter((p) => {
        return (
          p.title?.toLowerCase().includes(queryLower) ||
          p.description?.toLowerCase().includes(queryLower)
        );
      });

      // Merge local matches
      localMatches.forEach((local) => {
        const exists = pois.find(
          (poi) =>
            (local.osmId && poi.osmId === local.osmId) ||
            (poi.id && poi.id === local.id)
        );
        if (!exists) {
          pois.push(local);
        }
      });
    }
    // Case 2: Nearby Search (lat/lon present, no q)
    else if (lat && lon) {
      const searchRadius = 50; // Default radius

      // Fetch POIs from Overpass
      pois = await this.osm.getNearbyPois(lat, lon, searchRadius);

      // Get cached/saved places in search radius
      const localMatches = this.storage.savedPlaces.filter((p) => {
        const dist = getDistance(lat, lon, p.lat, p.lon);
        return dist <= searchRadius;
      });

      // Merge local matches
      localMatches.forEach((local) => {
        const exists = pois.find(
          (poi) =>
            (local.osmId && poi.osmId === local.osmId) ||
            (poi.id && poi.id === local.id)
        );

        if (!exists) {
          pois.push(local);
        }
      });

      // Sort by distance from click
      pois = pois
        .map((p) => {
          return {
            ...p,
            _distance: getDistance(lat, lon, p.lat, p.lon),
          };
        })
        .sort((a, b) => a._distance - b._distance);
    }

    // Check if any of these are already bookmarked
    // We resolve them to the bookmark version if they exist
    pois = pois.map((p) => {
      const saved = this.storage.findPlaceById(p.osmId);
      return saved || p;
    });

    return pois;
  }

  afterModel(model, transition) {
    const { q, selected } = transition.to.queryParams;

    // Heuristic Match Logic (ported from MapComponent)
    // If 'selected' is provided (from map click), try to find that specific feature.
    // If 'q' is provided (from text search), try to find an exact match to auto-select.
    const targetName = selected || q;

    if (targetName && model.length > 0) {
      let matchedPlace = null;

      // 1. Exact Name Match
      matchedPlace = model.find(
        (p) =>
          p.osmTags &&
          (p.osmTags.name === targetName || p.osmTags['name:en'] === targetName)
      );

      // 2. High Proximity Match (<= 10m) - Only if we don't have a name match
      // Note: MapComponent had logic for <=20m + type match.
      // We might want to pass the 'type' in queryParams if we want to be that precise.
      // For now, let's stick to name or very close proximity.
      if (!matchedPlace) {
        const topCandidate = model[0];
        if (topCandidate._distance <= 10) {
          matchedPlace = topCandidate;
        }
      }

      if (matchedPlace) {
        // Direct transition!
        this.router.replaceWith('place', matchedPlace);
        return;
      }
    }

    // Stop the pulse animation since search is done (and we are staying here)
    this.mapUi.stopSearch();
  }

  setupController(controller, model) {
    super.setupController(controller, model);
    // Ensure pulse is stopped if we reach here
    this.mapUi.stopSearch();
  }

  @action
  error() {
    this.mapUi.stopSearch();
    return true; // Bubble error
  }
}
