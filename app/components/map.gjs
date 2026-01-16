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
        center: fromLonLat([99.04738, 7.58087]),
        zoom: 13.0,
        projection: 'EPSG:3857',
      }),
    });

    apply(openfreemap, 'https://tiles.openfreemap.org/styles/liberty');

    this.mapInstance.on('singleclick', this.handleMapClick);

    // Change cursor to pointer when hovering over a clickable feature
    this.mapInstance.on('pointermove', (e) => {
      const pixel = this.mapInstance.getEventPixel(e.originalEvent);
      const hit = this.mapInstance.hasFeatureAtPixel(pixel);
      this.mapInstance.getTarget().style.cursor = hit ? 'pointer' : '';
    });

    // Load initial bookmarks
    this.loadBookmarks();

    // Listen for remote storage changes
    this.storage.rs.on('connected', () => {
      this.loadBookmarks();
    });

    this.storage.places.on('change', (event) => {
       // Ideally we would only update the changed one, but refreshing all is safer for now
       this.loadBookmarks();
    });
  });

  async loadBookmarks() {
    try {
      const places = await this.storage.places.listAll();
      
      this.bookmarkSource.clear();
      
      if (places && Array.isArray(places)) {
        places.forEach(place => {
          if (place.lat && place.lon) {
            const feature = new Feature({
              geometry: new Point(fromLonLat([place.lon, place.lat])),
              name: place.title,
              id: place.id,
              isBookmark: true, // Marker property to distinguish
              originalPlace: place
            });
            this.bookmarkSource.addFeature(feature);
          }
        });
      }
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
    }
  }

  handleMapClick = async (event) => {
    // 0. Handle closing sidebar if open and clicked on empty map area
    if (this.args.isSidebarOpen) {
       // We can just trigger the outside click and return. 
       // However, if the user clicked on a feature, maybe they want to switch selection?
       // The requirement says "when clicking on the map while the sidebar is open, it should close the sidebar instead of executing the normal map click logic"
       // This implies strict closing behavior.
       if (this.args.onOutsideClick) {
         this.args.onOutsideClick();
       }
       return;
    }

    const coords = toLonLat(event.coordinate);
    const [lon, lat] = coords;

    // 1. Check if user clicked on a rendered feature (POI or Bookmark)
    const features = this.mapInstance.getFeaturesAtPixel(event.pixel);
    let selectedFeatureName = null;
    let selectedFeatureType = null;
    let clickedBookmark = null;

    if (features && features.length > 0) {
      // Prioritize bookmarks if clicked
      const bookmarkFeature = features.find(f => f.get('isBookmark'));
      if (bookmarkFeature) {
        clickedBookmark = bookmarkFeature.get('originalPlace');
        console.log("Clicked bookmark:", clickedBookmark);
        
        // Notify parent to show bookmark details
        if (this.args.onPlacesFound) {
           // We pass it as a "selectedPlace" but with an empty list of nearby items since it's a specific bookmark
           this.args.onPlacesFound([], clickedBookmark);
        }
        return; // Stop processing to avoid fetching OSM data for a known bookmark
      }

      const props = features[0].getProperties();
      if (props.name) {
        selectedFeatureName = props.name;
        selectedFeatureType = props.class || props.subclass; // e.g., 'cafe'
        console.log(`Clicked visual feature: "${selectedFeatureName}" (${selectedFeatureType})`);
      }
    }

    // 2. Fetch authoritative data via Overpass
    try {
      const searchRadius = selectedFeatureName ? 50 : 200;
      let pois = await this.osm.getNearbyPois(lat, lon, searchRadius);

      // Sort by distance from click
      pois = pois.map(p => {
        // Use center lat/lon for ways/relations if available, else lat/lon
        const pLat = p.lat || p.center?.lat;
        const pLon = p.lon || p.center?.lon;
        return {
          ...p,
          _distance: (pLat && pLon) ? getDistance(lat, lon, pLat, pLon) : 9999
        };
      }).sort((a, b) => a._distance - b._distance);

      let matchedPlace = null;

      if (selectedFeatureName && pois.length > 0) {
        // Heuristic:
        // 1. Exact Name Match
        matchedPlace = pois.find(p => p.tags && (p.tags.name === selectedFeatureName || p.tags['name:en'] === selectedFeatureName));

        // 2. If no exact match, look for VERY close (<=20m) and matching type
        if (!matchedPlace) {
           const topCandidate = pois[0];
           if (topCandidate._distance <= 20) {
              // Check type compatibility if available
              // (visual tile 'class' is often 'cafe', osm tag is 'amenity'='cafe')
              const pType = topCandidate.tags.amenity || topCandidate.tags.shop || topCandidate.tags.tourism;
              if (selectedFeatureType && pType && (selectedFeatureType === pType || pType.includes(selectedFeatureType))) {
                 console.log("Heuristic match found (distance + type):", topCandidate);
                 matchedPlace = topCandidate;
              } else if (topCandidate._distance <= 10) {
                 // Even without type match, if it's super close (<=10m), it's likely the one.
                 console.log("Heuristic match found (proximity):", topCandidate);
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
      style="position: absolute; inset: 0;"
    ></div>
  </template>
}
