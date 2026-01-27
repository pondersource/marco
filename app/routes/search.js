import Route from '@ember/routing/route';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { getDistance } from '../utils/geo';

export default class SearchRoute extends Route {
  @service osm;
  @service mapUi;
  @service storage;
  @service router;

  queryParams = {
    lat: { refreshModel: true },
    lon: { refreshModel: true },
    q: { refreshModel: true },
  };

  async model(params) {
    // If no coordinates, we can't search
    if (!params.lat || !params.lon) {
      return [];
    }

    const lat = parseFloat(params.lat);
    const lon = parseFloat(params.lon);
    const searchRadius = params.q ? 30 : 50;

    // Fetch POIs
    let pois = await this.osm.getNearbyPois(lat, lon, searchRadius);

    // Sort by distance from click
    pois = pois
      .map((p) => {
        return {
          ...p,
          _distance: getDistance(lat, lon, p.lat, p.lon),
        };
      })
      .sort((a, b) => a._distance - b._distance);

    // Check if any of these are already bookmarked
    // We resolve them to the bookmark version if they exist
    pois = pois.map((p) => {
      const saved = this.storage.findPlaceById(p.osmId);
      return saved || p;
    });

    return pois;
  }

  afterModel(model, transition) {
    const { q } = transition.to.queryParams;

    // Heuristic Match Logic (ported from MapComponent)
    if (q && model.length > 0) {
      let matchedPlace = null;

      // 1. Exact Name Match
      matchedPlace = model.find(
        (p) => p.osmTags && (p.osmTags.name === q || p.osmTags['name:en'] === q)
      );

      // 2. High Proximity Match (<= 10m)
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
