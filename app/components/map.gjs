import Component from '@glimmer/component';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import 'ol/ol.css';
import Map from 'ol/Map.js';
import { defaults as defaultControls } from 'ol/control.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { Style, Circle, Fill, Stroke } from 'ol/style.js';
import { apply } from 'ol-mapbox-style';
import { getDistance } from '../utils/geo';

export default class MapComponent extends Component {
  @service osm;
  @service storage;

  mapInstance;
  bookmarkSource;

  setupMap = modifier((element) => {
    if (this.mapInstance) return;

    const openfreemap = new LayerGroup();

    // Create a vector source and layer for bookmarks
    this.bookmarkSource = new VectorSource();
    const bookmarkLayer = new VectorLayer({
      source: this.bookmarkSource,
      style: new Style({
        image: new Circle({
          radius: 7,
          fill: new Fill({ color: '#ffcc33' }), // Gold/Yellow
          stroke: new Stroke({
            color: '#fff',
            width: 2,
          }),
        }),
      }),
      zIndex: 10, // Ensure it sits above the map tiles
    });

    this.mapInstance = new Map({
      target: element,
      layers: [openfreemap, bookmarkLayer],
      controls: defaultControls({ zoom: false }),
      view: new View({
        center: fromLonLat([99.05738, 7.55087]),
        zoom: 13.0,
        projection: 'EPSG:3857',
      }),
    });

    apply(openfreemap, 'https://tiles.openfreemap.org/styles/liberty');

    this.mapInstance.on('singleclick', this.handleMapClick);

    // Load places when map moves
    this.mapInstance.on('moveend', this.handleMapMove);

    // Change cursor to pointer when hovering over a clickable feature
    this.mapInstance.on('pointermove', (e) => {
      const pixel = this.mapInstance.getEventPixel(e.originalEvent);
      const hit = this.mapInstance.hasFeatureAtPixel(pixel);
      this.mapInstance.getTarget().style.cursor = hit ? 'pointer' : '';
    });

    // Load initial bookmarks
    this.storage.rs.on('ready', () => {
      // Initial load based on current view
      this.handleMapMove();
    });

    // Listen for remote storage changes
    // this.storage.rs.on('connected', () => {
    //   this.loadBookmarks();
    // });

    // Listen to changes in the /places/ scope
    // keeping this as a backup or for future real-time sync support
    this.storage.rs.scope('/places/').on('change', (event) => {
      console.log('RemoteStorage change detected:', event);
      // this.loadBookmarks(); // Disabling auto-update for now per instructions, using explicit version action instead
      this.handleMapMove();
    });
  });

  // Re-fetch bookmarks when the version changes (triggered by parent action or service)
  updateBookmarks = modifier(() => {
    // Depend on the tracked storage.version
    if (this.storage.version >= 0) {
      this.handleMapMove();
    }
  });

  async loadBookmarks(places = []) {
    try {
      if (!places || places.length === 0) {
        // Fallback or explicit check if we have tracked property usage?
        // The service updates 'savedPlaces'. We should probably use that if we want reactiveness.
        places = this.storage.savedPlaces;
      }

      // Previously: const places = await this.storage.places.getPlaces();
      // We no longer want to fetch everything blindly.
      // We rely on 'savedPlaces' being updated by handleMapMove calling storage.loadPlacesInBounds.

      this.bookmarkSource.clear();

      if (places && Array.isArray(places)) {
        places.forEach((place) => {
          if (place.lat && place.lon) {
            const feature = new Feature({
              geometry: new Point(fromLonLat([place.lon, place.lat])),
              name: place.title,
              id: place.id,
              isBookmark: true, // Marker property to distinguish
              originalPlace: place,
            });
            this.bookmarkSource.addFeature(feature);
          }
        });
      }
    } catch (e) {
      console.error('Failed to load bookmarks:', e);
    }
  }

  handleMapMove = async () => {
    if (!this.mapInstance) return;

    const size = this.mapInstance.getSize();
    const extent = this.mapInstance.getView().calculateExtent(size);
    const [minLon, minLat] = toLonLat([extent[0], extent[1]]);
    const [maxLon, maxLat] = toLonLat([extent[2], extent[3]]);

    const bbox = { minLat, minLon, maxLat, maxLon };
    await this.storage.loadPlacesInBounds(bbox);
    this.loadBookmarks(this.storage.savedPlaces);
  };

  handleMapClick = async (event) => {
    // Check if user clicked on a rendered feature (POI or Bookmark) FIRST
    const features = this.mapInstance.getFeaturesAtPixel(event.pixel);
    let clickedBookmark = null;
    let selectedFeatureName = null;
    let selectedFeatureType = null;

    if (features && features.length > 0) {
      const bookmarkFeature = features.find((f) => f.get('isBookmark'));
      if (bookmarkFeature) {
        clickedBookmark = bookmarkFeature.get('originalPlace');
      }
      // Also get visual props for standard map click logic later
      const props = features[0].getProperties();
      if (props.name) {
        selectedFeatureName = props.name;
        selectedFeatureType = props.class || props.subclass;
      }
    }

    // Special handling when sidebar is OPEN
    if (this.args.isSidebarOpen) {
      // If it's a bookmark, we allow "switching" to it even if sidebar is open
      if (clickedBookmark) {
        console.log(
          'Clicked bookmark while sidebar open (switching):',
          clickedBookmark
        );
        if (this.args.onPlacesFound) {
          this.args.onPlacesFound([], clickedBookmark);
        }
        return;
      }

      // Otherwise (empty map or non-bookmark feature), close the sidebar
      if (this.args.onOutsideClick) {
        this.args.onOutsideClick();
      }
      return;
    }

    // Normal behavior (sidebar is closed)
    if (clickedBookmark) {
      console.log('Clicked bookmark:', clickedBookmark);
      if (this.args.onPlacesFound) {
        this.args.onPlacesFound([], clickedBookmark);
      }
      return;
    }

    const coords = toLonLat(event.coordinate);
    const [lon, lat] = coords;

    // ... continue with normal OSM fetch logic ...

    // 2. Fetch authoritative data via Overpass
    try {
      const searchRadius = selectedFeatureName ? 30 : 50;
      let pois = await this.osm.getNearbyPois(lat, lon, searchRadius);

      // Sort by distance from click
      pois = pois
        .map((p) => {
          // Use center lat/lon for ways/relations if available, else lat/lon
          const pLat = p.lat || p.center?.lat;
          const pLon = p.lon || p.center?.lon;
          return {
            ...p,
            _distance: pLat && pLon ? getDistance(lat, lon, pLat, pLon) : 9999,
          };
        })
        .sort((a, b) => a._distance - b._distance);

      let matchedPlace = null;

      if (selectedFeatureName && pois.length > 0) {
        // Heuristic:
        // 1. Exact Name Match
        matchedPlace = pois.find(
          (p) =>
            p.tags &&
            (p.tags.name === selectedFeatureName ||
              p.tags['name:en'] === selectedFeatureName)
        );

        // 2. If no exact match, look for VERY close (<=20m) and matching type
        if (!matchedPlace) {
          const topCandidate = pois[0];
          if (topCandidate._distance <= 20) {
            // Check type compatibility if available
            // (visual tile 'class' is often 'cafe', osm tag is 'amenity'='cafe')
            const pType =
              topCandidate.tags.amenity ||
              topCandidate.tags.shop ||
              topCandidate.tags.tourism;
            if (
              selectedFeatureType &&
              pType &&
              (selectedFeatureType === pType ||
                pType.includes(selectedFeatureType))
            ) {
              console.log(
                'Heuristic match found (distance + type):',
                topCandidate
              );
              matchedPlace = topCandidate;
            } else if (topCandidate._distance <= 10) {
              // Even without type match, if it's super close (<=10m), it's likely the one.
              console.log('Heuristic match found (proximity):', topCandidate);
              matchedPlace = topCandidate;
            }
          }
        }
      }

      if (this.args.onPlacesFound) {
        this.args.onPlacesFound(pois, matchedPlace);
      }
    } catch (error) {
      console.error('Failed to fetch POIs:', error);
    }
  };

  <template>
    <div
      {{this.setupMap}}
      {{this.updateBookmarks}}
      style="position: absolute; inset: 0;"
    ></div>
  </template>
}
