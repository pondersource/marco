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

    apply(openfreemap, 'https://tiles.openfreemap.org/styles/positron');

    this.mapInstance.on('singleclick', this.handleMapClick);
  });

  handleMapClick = async (event) => {
    const coords = toLonLat(event.coordinate);
    const [lon, lat] = coords;

    console.log(`Clicked at: ${lat}, ${lon}`);

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
