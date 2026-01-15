import { modifier } from 'ember-modifier';
import 'ol/ol.css';
import Map from 'ol/Map.js';
import { defaults as defaultControls } from 'ol/control.js';
import View from 'ol/View.js';
import { fromLonLat } from 'ol/proj.js';
import LayerGroup from 'ol/layer/Group.js';
import { apply } from 'ol-mapbox-style';

let mapInstance;

const setupMap = modifier((element) => {
  if (mapInstance) return;

  const openfreemap = new LayerGroup();

  mapInstance = new Map({
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
});

<template>
  <div
    {{setupMap}}
    style="position: absolute; inset: 0;"
  ></div>
</template>
