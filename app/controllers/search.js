import Controller from '@ember/controller';
import { service } from '@ember/service';
import { task } from 'ember-concurrency';
import { getDistance, hasCoordinates } from '../utils/geo';
import { NEARBY_CATEGORY } from '../utils/poi-categories';

export default class SearchController extends Controller {
  @service osm;
  @service photon;
  @service mapUi;
  @service storage;
  @service router;
  @service toast;

  queryParams = ['lat', 'lon', 'q', 'selected', 'category'];

  lat = null;
  lon = null;
  q = null;
  selected = null;
  category = null;

  async fetchNearbyPois(lat, lon) {
    const searchRadius = 50;

    // Fetch POIs from Overpass
    let pois = await this.osm.getNearbyPois(lat, lon, searchRadius);

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

    // Sort by distance from the search center
    return pois
      .map((p) => ({
        ...p,
        _distance: getDistance(lat, lon, p.lat, p.lon),
      }))
      .sort((a, b) => a._distance - b._distance);
  }

  fetchResultsTask = task({ restartable: true }, async (params) => {
    // 1. Check if the incoming parameters match our currently loaded search
    const isSameSearch =
      this.mapUi.currentSearch &&
      params.q === this.mapUi.currentSearch.q &&
      params.category === this.mapUi.currentSearch.category &&
      params.lat === this.mapUi.currentSearch.lat &&
      params.lon === this.mapUi.currentSearch.lon;

    const hasResults =
      this.mapUi.searchResults && this.mapUi.searchResults.length > 0;

    // 2. If it's a back navigation to the exact same search, resolve instantly with no animation
    if (isSameSearch && hasResults) {
      if (this.mapUi.isSidebarVisible) {
        this.mapUi.showSidebar();
      }
      return;
    }

    // 3. Otherwise, this is a brand new search: hide the sidebar and clear previous results immediately to signal a new search
    this.mapUi.hideSidebar();
    this.mapUi.clearSearchResults();

    const lat = params.lat == null ? null : parseFloat(params.lat);
    const lon = params.lon == null ? null : parseFloat(params.lon);
    const hasLocation = hasCoordinates(lat, lon);
    let pois = [];
    let loadingType = null;
    let loadingValue = null;

    try {
      // Case 0: Nearby Search (map click or ?category=nearby)
      const isNearbySearch =
        hasLocation &&
        !params.q &&
        (!params.category || params.category === NEARBY_CATEGORY.id);

      if (isNearbySearch) {
        loadingType = 'nearby';
        loadingValue = 'nearby';
        this.mapUi.startLoading(loadingType, loadingValue);

        pois = await this.fetchNearbyPois(lat, lon);
      }
      // Case 1: Category Search (category parameter present)
      else if (params.category && hasLocation) {
        loadingType = 'category';
        loadingValue = params.category;
        this.mapUi.startLoading(loadingType, loadingValue);

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

        pois = await this.osm.getCategoryPois(
          bounds,
          params.category,
          lat,
          lon
        );

        // Sort by distance from center
        pois = pois
          .map((p) => ({
            ...p,
            _distance: getDistance(lat, lon, p.lat, p.lon),
          }))
          .sort((a, b) => a._distance - b._distance);
      }
      // Case 2: Text Search (q parameter present)
      else if (params.q) {
        loadingType = 'text';
        loadingValue = params.q;
        this.mapUi.startLoading(loadingType, loadingValue);

        // Search with Photon (using lat/lon for bias if available)
        pois = await this.photon.search(params.q, lat, lon);

        // Search local bookmarks by name (minimum 3 characters)
        const queryLower = params.q.toLowerCase();
        let localMatches = [];
        if (queryLower.length >= 3) {
          localMatches = this.storage.savedPlaces.filter((p) => {
            return (
              p.title?.toLowerCase().includes(queryLower) ||
              p.description?.toLowerCase().includes(queryLower)
            );
          });
        }

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
    } catch (error) {
      console.error('Search request failed.', error);
      this.toast.show('Search request failed. Please try again.');
      this.mapUi.stopSearch();
      return;
    } finally {
      if (loadingType && loadingValue) {
        this.mapUi.stopLoading(loadingType, loadingValue);
      }
    }

    // Check if any of these are already bookmarked
    // We resolve them to the bookmark version if they exist
    pois = pois.map((p) => {
      const saved = this.storage.findPlaceById(p.osmId);
      return saved || p;
    });

    // A search with results is a restorable context (e.g. for "up" navigation
    // from place details). Empty searches are intentionally not restorable, so
    // they don't reopen an invisible "no results" drawer later on.
    if (pois.length > 0) {
      this.mapUi.currentSearch = {
        q: params.q,
        category: params.category,
        lat: params.lat,
        lon: params.lon,
      };
    }

    const targetName = params.selected || params.q;

    if (targetName && pois.length > 0) {
      // 1. Exact Name Match
      let matchedPlace = pois.find(
        (p) =>
          p.osmTags &&
          (p.osmTags.name === targetName || p.osmTags['name:en'] === targetName)
      );

      // 2. High Proximity Match (<= 10m) - Only if we don't have a name match
      // Note: MapComponent had logic for <=20m + type match.
      // We might want to pass the 'type' in queryParams if we want to be that precise.
      // For now, let's stick to name or very close proximity.
      if (!matchedPlace) {
        const topCandidate = pois[0];
        if (topCandidate._distance <= 10) {
          matchedPlace = topCandidate;
        }
      }

      if (matchedPlace) {
        // Direct transition!
        this.router.replaceWith('place', matchedPlace);
        this.mapUi.stopSearch();
        return;
      }
    }

    this.mapUi.setSearchResults(pois);
    this.mapUi.showSidebar();
    this.mapUi.stopSearch();
  });
}
