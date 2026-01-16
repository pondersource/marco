import Component from '@glimmer/component';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import 'ol/ol.css';
import Map from 'ol/Map.js';
import { defaults as defaultControls } from 'ol/control.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import LayerGroup from 'ol/layer/Group.js';
import { apply } from 'ol-mapbox-style';

export default class MapComponent extends Component {
  @service osm;

  mapInstance;

  setupMap = modifier((element) => {
    if (this.mapInstance) return;

    const openfreemap = new LayerGroup();

    this.mapInstance = new Map({
      target: element,
      layers: [openfreemap],
      controls: defaultControls({ zoom: false }),
      view: new View({
        center: fromLonLat([99.05738, 7.56087]),
        zoom: 12.5,
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
  });

  handleMapClick = async (event) => {
    // 1. Check if user clicked on a rendered feature (POI)
    const features = this.mapInstance.getFeaturesAtPixel(event.pixel);
    
    if (features && features.length > 0) {
      // Prioritize POIs (features with names/amenities)
      // OpenLayers features from vector tiles have properties like 'name', 'class', 'subclass', etc.
      const clickedFeature = features[0];
      const props = clickedFeature.getProperties();

      // Basic check: does it look like a POI? (has a name or distinct class)
      if (props.name || props.class) {
        console.log('Clicked Feature (POI):', props);
        return; // Stop here, we found a direct click
      }
    }

    // 2. Fallback: Fetch nearby POIs via Overpass API
    const coords = toLonLat(event.coordinate);
    const [lon, lat] = coords;

    console.log(`No feature clicked. Searching nearby at: ${lat}, ${lon}`);

    try {
      const pois = await this.osm.getNearbyPois(lat, lon);
      console.log('Nearby POIs:', pois);
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
