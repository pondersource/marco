import Component from '@glimmer/component';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import 'ol/ol.css';
import OlMap from 'ol/Map.js';
import { defaults as defaultControls, Control } from 'ol/control.js';
import { defaults as defaultInteractions, DragPan } from 'ol/interaction.js';
import Kinetic from 'ol/Kinetic.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat, getPointResolution } from 'ol/proj.js';
import Overlay from 'ol/Overlay.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import Point from 'ol/geom/Point.js';
import Geolocation from 'ol/Geolocation.js';
import { Style, Circle, Fill, Stroke, Icon } from 'ol/style.js';
import { apply } from 'ol-mapbox-style';
import { getIcon } from '../utils/icons';
import { getIconNameForTags } from '../utils/osm-icons';

export default class MapComponent extends Component {
  @service osm;
  @service storage;
  @service mapUi;
  @service router;
  @service settings;

  mapInstance;
  bookmarkSource;
  searchResultsSource;
  selectedShapeSource;
  searchOverlay;
  searchOverlayElement;
  selectedPinOverlay;
  selectedPinElement;
  crosshairElement;
  crosshairOverlay;
  ignoreNextMapClick = false;

  setupMap = modifier((element) => {
    if (this.mapInstance) return;

    const openfreemap = new LayerGroup();

    // Create a vector source and layer for the selected shape (outline)
    this.selectedShapeSource = new VectorSource();
    const selectedShapeLayer = new VectorLayer({
      source: this.selectedShapeSource,
      style: new Style({
        stroke: new Stroke({
          color: '#3388ff',
          width: 4,
        }),
        fill: new Fill({
          color: 'rgba(51, 136, 255, 0.1)',
        }),
      }),
      zIndex: 5, // Below bookmarks (10) but above tiles
    });

    // Create a vector source and layer for bookmarks
    this.bookmarkSource = new VectorSource();

    const bookmarkStyleFunction = (feature) => {
      const originalPlace = feature.get('originalPlace');
      let color =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--default-list-color')
          .trim() || '#000000'; // Fallback to black if variable is missing to make error obvious

      if (
        originalPlace &&
        originalPlace._listIds &&
        originalPlace._listIds.length > 0
      ) {
        // Find the first list color
        // We need access to storage.lists.
        // Since this is inside setupMap, 'this' refers to the component instance.
        const firstListId = originalPlace._listIds[0];
        const list = this.storage.lists.find((l) => l.id === firstListId);
        if (list && list.color) {
          color = list.color;
        }
      }

      return [
        new Style({
          image: new Circle({
            radius: 10,
            fill: new Fill({ color: 'rgba(0, 0, 0, 0.2)' }),
            displacement: [0, -2],
          }),
        }),
        new Style({
          image: new Circle({
            radius: 9,
            fill: new Fill({ color: color }),
            stroke: new Stroke({
              color: '#fff',
              width: 2,
            }),
          }),
        }),
      ];
    };

    const bookmarkLayer = new VectorLayer({
      source: this.bookmarkSource,
      style: bookmarkStyleFunction,
      zIndex: 10, // Ensure it sits above the map tiles
    });

    // Create a vector source and layer for search results
    this.searchResultsSource = new VectorSource();
    const cachedIconUrls = new Map();

    const searchResultStyle = (feature) => {
      const originalPlace = feature.get('originalPlace');
      // Some search results might be just the place object without separate tags
      // If it's a raw place object, it might have osmTags property.
      // Or it might be the tags object itself.
      const tags = originalPlace.osmTags || originalPlace;
      const iconName = getIconNameForTags(tags);

      // Use 'default' key for the standard red dot marker. Use iconName as key if present.
      const cacheKey = iconName || 'default';

      if (!cachedIconUrls.has(cacheKey)) {
        const markerColor =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--marker-color-primary')
            .trim() || '#ea4335';

        // Default content: Red circle
        let innerContent = `<circle cx="12" cy="12" r="8" fill="${markerColor}"/>`;

        if (iconName) {
          const rawSvg = getIcon(iconName);
          if (rawSvg) {
            // Pinhead icons are usually 15x15 viewBox="0 0 15 15".
            // We want to center it on 12,12.
            // A 12x12 icon centered at 12,12 means top-left at 6,6.
            // However, since we are embedding a new SVG, we can just use x/y/width/height.
            // But we need to strip the outer <svg> tag to embed the paths cleanly if we want full control,
            // or we can nest the SVG. Nesting is safer.

            // The rawSvg string contains <svg ...>...</svg>.
            // We want to make it white. We can add a group with fill="white".
            // But if the SVG has fill attributes, they override. Pinhead icons usually don't have fills.

            // Let's strip the outer SVG tag to get the path content.
            let content = rawSvg.trim();
            const svgStart = content.indexOf('<svg');
            const svgEnd = content.indexOf('>', svgStart);
            const contentStart = svgEnd + 1;
            const contentEnd = content.lastIndexOf('</svg>');

            if (svgStart !== -1 && contentEnd !== -1) {
              content = content.substring(contentStart, contentEnd);
            }

            // We render the red circle background, then the icon on top.
            // Icon is scaled down slightly to fit nicely inside the circle.
            // 15x15 scaled by 0.8 is 12x12.
            // Translate to 6,6 to center.
            innerContent = `
              <circle cx="12" cy="12" r="8" fill="${markerColor}"/>
              <g transform="translate(6, 6) scale(0.8)" fill="white">
                ${content}
              </g>
            `;
          }
        }

        const svg = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 40" width="40" height="50">
            <defs>
              <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="black" flood-opacity="0.3"/>
              </filter>
            </defs>
            <path d="M12 2C6.5 2 2 6.5 2 12C2 17.5 12 24 12 24C12 24 22 17.5 22 12C22 6.5 17.5 2 12 2Z" fill="white" filter="url(#shadow)"/>
            ${innerContent}
          </svg>
        `;

        cachedIconUrls.set(
          cacheKey,
          'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.trim())
        );
      }

      return new Style({
        image: new Icon({
          src: cachedIconUrls.get(cacheKey),
          anchor: [0.5, 0.65],
          scale: 1,
        }),
      });
    };

    const searchResultLayer = new VectorLayer({
      source: this.searchResultsSource,
      style: searchResultStyle,
      zIndex: 11, // Above bookmarks (10)
    });

    // Default view settings
    let center = [14.21683569, 27.060114248];
    let zoom = 2.661;
    let restoredFromStorage = false;

    // Try to restore from localStorage
    try {
      const storedView = localStorage.getItem('marco:map-view');
      if (storedView) {
        const parsed = JSON.parse(storedView);
        if (
          parsed.center &&
          Array.isArray(parsed.center) &&
          parsed.center.length === 2 &&
          typeof parsed.zoom === 'number'
        ) {
          center = parsed.center;
          zoom = parsed.zoom;
          restoredFromStorage = true;
        }
      }
    } catch (e) {
      console.warn('Failed to restore map view:', e);
    }

    const view = new View({
      center: fromLonLat(center),
      zoom: zoom,
      projection: 'EPSG:3857',
    });

    this.mapInstance = new OlMap({
      target: element,
      layers: [
        openfreemap,
        selectedShapeLayer,
        searchResultLayer,
        bookmarkLayer,
      ],
      view: view,
      controls: defaultControls({
        zoom: true,
        rotate: true,
        attribution: true,
      }),
      interactions: defaultInteractions({
        dragPan: false, // Disable default DragPan to add a custom one
      }),
    });

    // Initialize the UI service with the map center
    const initialCenter = toLonLat(view.getCenter());
    this.mapUi.updateCenter(initialCenter[1], initialCenter[0]);

    apply(this.mapInstance, 'https://tiles.openfreemap.org/styles/liberty');

    this.searchOverlayElement = document.createElement('div');
    this.searchOverlayElement.className = 'search-pulse';
    this.searchOverlay = new Overlay({
      element: this.searchOverlayElement,
      positioning: 'center-center',
      stopEvent: false,
    });
    this.mapInstance.addOverlay(this.searchOverlay);

    // Selected Pin Overlay (Red Marker)
    this.selectedPinElement = document.createElement('div');
    this.selectedPinElement.className = 'selected-pin-container';

    // Create the icon structure inside
    const pinIcon = document.createElement('div');
    pinIcon.className = 'selected-pin';
    // Simple SVG for Map Pin
    pinIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" style="fill: var(--marker-color-dark); stroke: none;"></circle></svg>`;

    const pinShadow = document.createElement('div');
    pinShadow.className = 'selected-pin-shadow';

    this.selectedPinElement.appendChild(pinIcon);
    this.selectedPinElement.appendChild(pinShadow);

    this.selectedPinOverlay = new Overlay({
      element: this.selectedPinElement,
      positioning: 'bottom-center', // Pin tip is at the bottom
      stopEvent: false, // Let clicks pass through
    });
    this.mapInstance.addOverlay(this.selectedPinOverlay);

    // Crosshair Overlay (for Creating New Place)
    this.crosshairElement = document.createElement('div');
    this.crosshairElement.className = 'map-crosshair';
    this.crosshairElement.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    element.appendChild(this.crosshairElement);

    // Geolocation Pulse Overlay
    this.locationOverlayElement = document.createElement('div');
    this.locationOverlayElement.className = 'search-pulse blue';
    this.locationOverlay = new Overlay({
      element: this.locationOverlayElement,
      positioning: 'center-center',
      stopEvent: false,
    });
    this.mapInstance.addOverlay(this.locationOverlay);

    // Track search box focus state on pointer down to handle race conditions
    // The blur event fires before click, so we need to capture state here
    element.addEventListener(
      'pointerdown',
      () => {
        if (this.mapUi.searchBoxHasFocus) {
          this.ignoreNextMapClick = true;
        }
      },
      true
    );

    // Geolocation Setup
    const geolocation = new Geolocation({
      trackingOptions: {
        enableHighAccuracy: true,
      },
      projection: view.getProjection(),
    });

    const positionFeature = new Feature();
    positionFeature.setStyle(
      new Style({
        image: new Circle({
          radius: 6,
          fill: new Fill({
            color: '#3399CC',
          }),
          stroke: new Stroke({
            color: '#fff',
            width: 2,
          }),
        }),
      })
    );

    const geolocationSource = new VectorSource({
      features: [positionFeature],
    });
    const geolocationLayer = new VectorLayer({
      source: geolocationSource,
      zIndex: 15,
    });

    geolocation.on('change:position', function () {
      const coordinates = geolocation.getPosition();
      positionFeature.setGeometry(coordinates ? new Point(coordinates) : null);
    });

    // Locate Me Control
    const locateElement = document.createElement('div');
    locateElement.className = 'ol-control ol-locate';
    const locateBtn = document.createElement('button');
    locateBtn.innerHTML = '⊙';
    locateBtn.title = 'Locate Me';
    locateElement.appendChild(locateBtn);

    // Track active sessions to prevent race conditions
    let locateTimeout;
    let locateListenerKey;

    // Helper to stop tracking and cleanup UI
    const stopLocating = () => {
      // Clear timeout
      if (locateTimeout) {
        clearTimeout(locateTimeout);
        locateTimeout = null;
      }

      // Remove listener
      try {
        if (locateListenerKey) {
          geolocation.un('change:position', zoomToLocation);
          locateListenerKey = null;
        }
      } catch {
        /* ignore */
      }

      // Hide pulse
      if (this.locationOverlayElement) {
        this.locationOverlayElement.classList.remove('active');
      }
    };

    const zoomToLocation = () => {
      const coordinates = geolocation.getPosition();
      const accuracyGeometry = geolocation.getAccuracyGeometry();
      const accuracy = geolocation.getAccuracy();
      console.debug('Geolocation change:', { coordinates, accuracy });

      if (!coordinates) return;

      const size = this.mapInstance.getSize();
      const view = this.mapInstance.getView();
      let targetResolution = null;

      // Update Pulse Overlay Position & Size (but don't force it active)
      if (this.locationOverlayElement) {
        const resolution = view.getResolution();
        const pointResolution = getPointResolution(
          view.getProjection(),
          resolution,
          coordinates
        );
        const diameterInMeters = (accuracy || 50) * 2;
        const diameterInPixels = diameterInMeters / pointResolution;

        this.locationOverlayElement.style.width = `${diameterInPixels}px`;
        this.locationOverlayElement.style.height = `${diameterInPixels}px`;
        this.locationOverlay.setPosition(coordinates);
      }

      // Check Target Accuracy (<= 20m) for early exit
      // Only if we have a valid accuracy reading
      if (accuracy && accuracy <= 20) {
        stopLocating();
      }

      // 1. Try to use the exact geometry (circular polygon) if available
      if (accuracyGeometry) {
        const extent = accuracyGeometry.getExtent();
        const fitResolution = view.getResolutionForExtent(extent, size);
        targetResolution = fitResolution * 3.162; // Scale for 10% area coverage
      }
      // 2. Fallback to using the scalar accuracy (meters) if geometry is missing
      else if (accuracy) {
        const viewportWidthMeters = 6.325 * accuracy;
        const minDimensionPixels = Math.min(size[0], size[1]);
        const requiredResolutionMeters =
          viewportWidthMeters / minDimensionPixels;
        const metersPerMapUnit = getPointResolution(
          view.getProjection(),
          1,
          coordinates
        );
        targetResolution = requiredResolutionMeters / metersPerMapUnit;
      }

      let viewOptions = {
        center: coordinates,
        duration: 1000,
      };

      if (targetResolution) {
        const maxResolution = view.getResolutionForZoom(17);
        viewOptions.resolution = Math.max(targetResolution, maxResolution);
      } else {
        viewOptions.zoom = 16;
      }

      this.mapInstance.getView().animate(viewOptions);
    };

    const startLocating = () => {
      console.debug('Getting current geolocation...');
      // 1. Clear any previous session
      stopLocating();

      geolocation.setTracking(true);
      const coordinates = geolocation.getPosition();

      // 2. Activate Pulse immediately
      if (this.locationOverlayElement) {
        this.locationOverlayElement.classList.add('active');
      }

      // 3. Zoom immediately if we have data
      if (coordinates) {
        zoomToLocation();
      }

      // 4. Start Following
      locateListenerKey = geolocation.on('change:position', zoomToLocation);

      // 5. Set Safety Timeout (10s)
      locateTimeout = setTimeout(() => {
        stopLocating();
      }, 10000);
    };

    locateBtn.addEventListener('click', startLocating);

    const locateControl = new Control({
      element: locateElement,
    });

    this.mapInstance.addLayer(geolocationLayer);
    this.mapInstance.addControl(locateControl);

    // Auto-locate on first visit (if not restored from storage and on home page)
    if (!restoredFromStorage && this.router.currentRouteName === 'index') {
      startLocating();
    }

    this.mapInstance.on('singleclick', this.handleMapClick);

    // Load places when map moves
    this.mapInstance.on('moveend', this.handleMapMove);

    // Change cursor to pointer when hovering over a clickable feature
    this.mapInstance.on('pointermove', (e) => {
      const pixel = this.mapInstance.getEventPixel(e.originalEvent);
      const hit = this.mapInstance.hasFeatureAtPixel(pixel, {
        hitTolerance: 10,
      });
      this.mapInstance.getTarget().style.cursor = hit ? 'pointer' : '';
    });

    this.storage.rs.on('ready', () => {
      this.handleMapMove();
    });
  });

  updateInteractions = modifier(() => {
    if (!this.mapInstance) return;

    // Remove existing DragPan interactions
    this.mapInstance
      .getInteractions()
      .getArray()
      .slice()
      .forEach((interaction) => {
        if (interaction instanceof DragPan) {
          this.mapInstance.removeInteraction(interaction);
        }
      });

    // Add new DragPan with current setting
    const kinetic = this.settings.mapKinetic
      ? new Kinetic(-0.005, 0.05, 100)
      : false;

    // Fix for "sticky" touches on mobile:
    // If we're on mobile (width <= 768) AND using kinetic,
    // we increase the minimum velocity required to trigger kinetic panning.
    // This prevents slow drags from being interpreted as a "throw"
    if (this.settings.mapKinetic && window.innerWidth <= 768) {
      // Default minVelocity is 0.05. We bump it up significantly.
      // This means the user has to really "flick" the map to get inertia.
      kinetic.minVelocity_ = 0.25;
    }

    this.mapInstance.addInteraction(
      new DragPan({
        kinetic: kinetic,
      })
    );
  });

  updateSearchResults = modifier(() => {
    if (!this.searchResultsSource) return;

    this.searchResultsSource.clear();
    const results = this.mapUi.searchResults;

    if (!results || results.length === 0) return;

    const features = [];
    results.forEach((place) => {
      if (place.lat && place.lon) {
        const feature = new Feature({
          geometry: new Point(fromLonLat([place.lon, place.lat])),
          name: place.title,
          id: place.id,
          isSearchResult: true,
          originalPlace: place,
        });
        features.push(feature);
      }
    });

    if (features.length > 0) {
      this.searchResultsSource.addFeatures(features);
    }
  });

  // Track the selected place from the UI Service (Router -> Map)
  updateSelectedPin = modifier(() => {
    const selected = this.mapUi.selectedPlace;
    const options = this.mapUi.selectionOptions || {};

    if (!this.selectedPinOverlay || !this.selectedPinElement) return;

    // Clear any previous shape
    if (this.selectedShapeSource) {
      this.selectedShapeSource.clear();
    }

    if (selected && selected.lat && selected.lon) {
      const coords = fromLonLat([selected.lon, selected.lat]);
      this.selectedPinOverlay.setPosition(coords);

      // Reset animation by removing/adding class
      this.selectedPinElement.classList.remove('active');
      // Force reflow
      void this.selectedPinElement.offsetWidth;
      this.selectedPinElement.classList.add('active');

      // Draw GeoJSON shape if available
      if (selected.geojson && this.selectedShapeSource) {
        try {
          const feature = new GeoJSON().readFeature(selected.geojson, {
            featureProjection: 'EPSG:3857',
          });
          this.selectedShapeSource.addFeature(feature);
        } catch (e) {
          console.warn('Failed to render selected place shape:', e);
        }
      }

      if (options.preventZoom) {
        // If we are preventing zoom (e.g. user clicked a bookmark), we rely on visibility check.
        // This avoids unnecessary panning if the place is already visible.
        this.handlePinVisibility(coords, { maintainZoom: true });
      } else if (selected.bbox) {
        this.zoomToBbox(selected.bbox);
      } else {
        this.handlePinVisibility(coords);
      }
    } else {
      this.selectedPinElement.classList.remove('active');
      // Hide it effectively by moving it away or just relying on display:none in CSS
      this.selectedPinOverlay.setPosition(undefined);
    }
  });

  zoomToBbox(bbox) {
    if (!this.mapInstance || !bbox) return;

    const view = this.mapInstance.getView();
    const size = this.mapInstance.getSize();

    // Convert bbox to extent: [minx, miny, maxx, maxy]
    const min = fromLonLat([bbox.minLon, bbox.minLat]);
    const max = fromLonLat([bbox.maxLon, bbox.maxLat]);
    const extent = [...min, ...max];

    // Default padding for full screen: 15% on all sides (70% visible)
    let padding = [
      size[1] * 0.15, // Top
      size[0] * 0.15, // Right
      size[1] * 0.15, // Bottom
      size[0] * 0.15, // Left
    ];

    // Mobile: Bottom sheet covers 50% of the screen height
    if (size[0] <= 768) {
      // We want the geometry to be centered in the top 50% of the screen.
      // Top padding: 15% of the VISIBLE height (size[1] * 0.5)
      const visibleHeight = size[1] * 0.5;
      const topPadding = visibleHeight * 0.15;
      const bottomPadding = size[1] * 0.5 + visibleHeight * 0.15; // Sheet + padding

      padding[0] = topPadding;
      padding[2] = bottomPadding;
    }
    // Desktop: Sidebar covers left side (approx 400px)
    else if (this.args.isSidebarOpen) {
      const sidebarWidthVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--sidebar-width')
        .trim();
      const sidebarWidth = parseInt(sidebarWidthVar, 10) || 360;
      const visibleWidth = size[0] - sidebarWidth;

      // Left padding: Sidebar + 15% of visible width
      padding[3] = sidebarWidth + visibleWidth * 0.15;
      // Right padding: 15% of visible width
      padding[1] = visibleWidth * 0.15;
    }

    const currentZoom = view.getZoom();

    view.fit(extent, {
      padding: padding,
      duration: 1000,
      easing: (t) => t * (2 - t),
      maxZoom: Math.max(currentZoom, 18),
    });
  }

  handlePinVisibility(coords, options = {}) {
    if (!this.mapInstance) return;

    const view = this.mapInstance.getView();
    const currentZoom = view.getZoom();

    // If too far out (e.g. world view), zoom in to neighborhood level (16)
    // UNLESS we want to maintain the current zoom
    if (!options.maintainZoom && currentZoom < 16) {
      this.animateToSmartCenter(coords, 16);
      return;
    }

    const pixel = this.mapInstance.getPixelFromCoordinate(coords);
    const size = this.mapInstance.getSize();

    // Check if off-screen (not rendered or outside bounds)
    const isOffScreen =
      !pixel ||
      pixel[0] < 0 ||
      pixel[0] > size[0] ||
      pixel[1] < 0 ||
      pixel[1] > size[1];

    if (isOffScreen) {
      // If off-screen, center it smartly (considering sidebar/bottom sheet)
      // Pass maintainZoom to prevent zoom reset if desired
      const zoom = options.maintainZoom ? null : 16;
      this.animateToSmartCenter(coords, zoom);
    } else {
      // If on-screen, only pan if obscured by UI
      this.panIfObscured(coords);
    }
  }

  animateToSmartCenter(coords, zoom = null) {
    if (!this.mapInstance) return;

    const size = this.mapInstance.getSize();
    const view = this.mapInstance.getView();
    let resolution = view.getResolution();

    if (zoom !== null) {
      resolution = view.getResolutionForZoom(zoom);
    }

    let targetCenter = coords;

    // Check if mobile (width <= 768px matches CSS)
    if (size[0] <= 768) {
      // On mobile, the bottom 50% is covered by the sheet.
      // We want the pin to be in the center of the TOP 50% (visible area).
      // That means the pin should be at y = height * 0.25 (25% down from top).
      // The map center is at y = height * 0.50.
      // So the pin is "above" the center by 25% of the height in pixels.
      // To put the pin there, the map center needs to be "below" the pin by that amount.

      const height = size[1];
      const offsetPixels = height * 0.25; // Distance from desired pin pos to map center
      const offsetMapUnits = offsetPixels * resolution;

      // Shift center SOUTH (decrease Y).
      // Note: In Web Mercator (EPSG:3857), Y increases North.
      // To move the camera South (Lower Y), we subtract.
      targetCenter = [coords[0], coords[1] - offsetMapUnits];
    }
    // Desktop: Check if sidebar is open
    else if (this.args.isSidebarOpen) {
      const sidebarWidthVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--sidebar-width')
        .trim();
      const sidebarWidth = parseInt(sidebarWidthVar, 10) || 360;

      // We want the pin to be in the center of the remaining space.
      // Remaining space starts at x = sidebarWidth.
      // Center of remaining space = sidebarWidth + (totalWidth - sidebarWidth) / 2
      // = sidebarWidth/2 + totalWidth/2
      // Map Center is totalWidth/2
      // Offset = sidebarWidth/2 (to the right)

      const offsetPixels = sidebarWidth / 2;
      const offsetMapUnits = offsetPixels * resolution;

      // We want pin at center + offset.
      // So map center must be pin - offset.
      // X increases to the right.
      targetCenter = [coords[0] - offsetMapUnits, coords[1]];
    }

    const animationOptions = {
      center: targetCenter,
      duration: 1000,
      easing: (t) => t * (2 - t), // Ease-out
    };

    if (zoom !== null) {
      animationOptions.zoom = zoom;
    }

    view.animate(animationOptions);
  }

  panIfObscured(coords) {
    if (!this.mapInstance) return;

    const size = this.mapInstance.getSize();
    const pixel = this.mapInstance.getPixelFromCoordinate(coords);
    if (!pixel) return;

    const view = this.mapInstance.getView();
    const center = view.getCenter();
    const resolution = view.getResolution();

    // Default targets (current position)
    let targetPixelX = pixel[0];
    let targetPixelY = pixel[1];
    let needsPan = false;

    // 1. Mobile Bottom Sheet Logic (Screen <= 768px)
    if (size[0] <= 768) {
      const height = size[1];
      const splitPoint = height / 2;

      // If in bottom half
      if (pixel[1] > splitPoint) {
        targetPixelY = height * 0.25; // Target: Center of top half
        needsPan = true;
      }
    }
    // 2. Desktop Sidebar Logic (Screen > 768px + Sidebar Open)
    else if (this.args.isSidebarOpen) {
      const sidebarWidthVar = getComputedStyle(document.documentElement)
        .getPropertyValue('--sidebar-width')
        .trim();
      const sidebarWidth = parseInt(sidebarWidthVar, 10) || 360;

      // If under sidebar
      if (pixel[0] < sidebarWidth) {
        const visibleWidth = size[0] - sidebarWidth;
        targetPixelX = sidebarWidth + visibleWidth / 2; // Target: Center of visible area
        needsPan = true;
      }
    }

    // 3. Header Logic (Any screen size)
    // Check if the (potentially new) target Y is under the header
    const headerHeight = 60;
    const minTopDistance = headerHeight + 20; // 80px

    if (targetPixelY < minTopDistance) {
      targetPixelY = minTopDistance + 30; // Move it to ~110px, clear of header
      needsPan = true;
    }

    if (needsPan) {
      const deltaPixelX = pixel[0] - targetPixelX;
      const deltaPixelY = pixel[1] - targetPixelY;

      // X: Camera moves same direction as we want the world to move? No.
      // If we want pin to move RIGHT (pixel increases), Camera must move LEFT (X decreases).
      // deltaPixelX = current - target. If current < target (want move right), delta is negative.
      // center + negative = decrease. Correct.
      const newCenterX = center[0] + deltaPixelX * resolution;

      // Y: Camera moves opposite direction to world relative to pixel coords.
      // Pixel Y increases DOWN. Map Y increases UP.
      // If we want pin to move DOWN (pixel increases), Camera must move UP (Y increases).
      // deltaPixelY = current - target. If current < target (want move down), delta is negative.
      // center - negative = increase. Correct.
      const newCenterY = center[1] - deltaPixelY * resolution;

      view.animate({
        center: [newCenterX, newCenterY],
        duration: 500,
        easing: (t) => t * (2 - t), // Ease-out
      });
    }
  }

  updateBookmarks = modifier(() => {
    // Depend on the tracked storage.placesInView to automatically update when they change
    const places = this.storage.placesInView;
    this.loadBookmarks(places);
  });

  async loadBookmarks(places = []) {
    try {
      if (!this.bookmarkSource) return;

      if (!places || places.length === 0) {
        places = this.storage.placesInView;
      }

      // We rely on 'placesInView' being updated by handleMapMove calling storage.loadPlacesInBounds.
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

  // Sync the pulse animation with the UI service state
  syncPulse = modifier(() => {
    if (!this.searchOverlayElement) return;

    if (this.mapUi.isSearching) {
      this.searchOverlayElement.classList.add('active');
    } else {
      this.searchOverlayElement.classList.remove('active');
    }
  });

  // Sync the creation mode (Crosshair)
  syncCreationMode = modifier(() => {
    if (!this.crosshairElement || !this.mapInstance) return;

    if (this.mapUi.isCreating) {
      this.crosshairElement.classList.add('visible');

      // If we have initial coordinates from the route (e.g. reload or link),
      // we need to pan the map so those coordinates are UNDER the crosshair.
      const coords = this.mapUi.creationCoordinates;
      if (coords && coords.lat && coords.lon) {
        // We only animate if the map center isn't already "roughly" correct.
        const targetCoords = fromLonLat([coords.lon, coords.lat]);
        this.animateToCrosshair(targetCoords);
      }
    } else {
      this.crosshairElement.classList.remove('visible');
    }
  });

  animateToCrosshair(targetCoords) {
    if (!this.mapInstance || !this.crosshairElement) return;

    // 1. Get current visual position of the crosshair
    const mapRect = this.mapInstance.getTargetElement().getBoundingClientRect();
    const crosshairRect = this.crosshairElement.getBoundingClientRect();

    const crosshairPixelX =
      crosshairRect.left + crosshairRect.width / 2 - mapRect.left;
    const crosshairPixelY =
      crosshairRect.top + crosshairRect.height / 2 - mapRect.top;

    // 2. Get the center pixel of the map viewport
    const size = this.mapInstance.getSize();
    const mapCenterX = size[0] / 2;
    const mapCenterY = size[1] / 2;

    // 3. Calculate the offset (how far the crosshair is from the geometric center)
    const offsetX = crosshairPixelX - mapCenterX;
    const offsetY = crosshairPixelY - mapCenterY;

    // 4. Calculate the new map center
    // We want 'targetCoords' to be at [crosshairPixelX, crosshairPixelY].
    // If we center the map on 'targetCoords', it will be at [mapCenterX, mapCenterY].
    // So we need to shift the map center by the OPPOSITE of the offset.
    const view = this.mapInstance.getView();
    const resolution = view.getResolution();

    const offsetMapUnitsX = offsetX * resolution;
    const offsetMapUnitsY = -offsetY * resolution; // Y is inverted in pixel vs map coords

    const targetX = targetCoords[0];
    const targetY = targetCoords[1];

    const newCenterX = targetX - offsetMapUnitsX;
    const newCenterY = targetY - offsetMapUnitsY;

    // Only animate if the difference is significant (avoid micro-jitters/loops)
    const currentCenter = view.getCenter();
    const dist = Math.sqrt(
      Math.pow(currentCenter[0] - newCenterX, 2) +
        Math.pow(currentCenter[1] - newCenterY, 2)
    );

    // 1 meter is approx 1 unit in Mercator near equator, varies by latitude.
    // Resolution at zoom 18 is approx 0.6m/pixel.
    // Let's use a small pixel threshold.
    if (dist > resolution * 5) {
      view.animate({
        center: [newCenterX, newCenterY],
        duration: 800,
        easing: (t) => t * (2 - t), // Ease-out
      });
    }
  }

  handleMapMove = async () => {
    if (!this.mapInstance) return;

    const view = this.mapInstance.getView();
    const center = toLonLat(view.getCenter());
    this.mapUi.updateCenter(center[1], center[0]);

    // If in creation mode, update the coordinates in the service AND the URL
    if (this.mapUi.isCreating) {
      // Calculate coordinates under the crosshair element
      // We need the pixel position of the crosshair relative to the map viewport
      // The crosshair is positioned via CSS, so we can use getBoundingClientRect
      const mapRect = this.mapInstance
        .getTargetElement()
        .getBoundingClientRect();
      const crosshairRect = this.crosshairElement.getBoundingClientRect();

      const centerX =
        crosshairRect.left + crosshairRect.width / 2 - mapRect.left;
      const centerY =
        crosshairRect.top + crosshairRect.height / 2 - mapRect.top;

      const coordinate = this.mapInstance.getCoordinateFromPixel([
        centerX,
        centerY,
      ]);
      const center = toLonLat(coordinate);

      const lat = parseFloat(center[1].toFixed(6));
      const lon = parseFloat(center[0].toFixed(6));

      this.mapUi.updateCreationCoordinates(lat, lon);

      // Update URL without triggering a full refresh
      // We use replaceWith to avoid cluttering history
      this.router.replaceWith('place.new', { queryParams: { lat, lon } });
    }

    const size = this.mapInstance.getSize();
    const extent = this.mapInstance.getView().calculateExtent(size);
    const [minLon, minLat] = toLonLat([extent[0], extent[1]]);
    const [maxLon, maxLat] = toLonLat([extent[2], extent[3]]);

    const bbox = { minLat, minLon, maxLat, maxLon };
    this.mapUi.updateBounds(bbox);
    await this.storage.loadPlacesInBounds(bbox);
    this.loadBookmarks(this.storage.placesInView);

    // Persist view to localStorage
    try {
      const view = this.mapInstance.getView();
      const currentCenter = toLonLat(view.getCenter());
      const currentZoom = view.getZoom();

      const viewState = {
        center: currentCenter,
        zoom: currentZoom,
      };

      localStorage.setItem('marco:map-view', JSON.stringify(viewState));
    } catch (e) {
      console.warn('Failed to save map view:', e);
    }
  };

  handleMapClick = async (event) => {
    if (this.ignoreNextMapClick) {
      this.ignoreNextMapClick = false;
      return;
    }

    // Check if user clicked on a rendered feature (POI or Bookmark) FIRST
    const features = this.mapInstance.getFeaturesAtPixel(event.pixel, {
      hitTolerance: 10,
    });
    let clickedBookmark = null;
    let clickedSearchResult = null;
    let selectedFeatureName = null;

    if (features && features.length > 0) {
      console.debug(`Found ${features.length} features in map layer:`);
      for (const f of features) {
        console.debug(f);
      }
      const bookmarkFeature = features.find((f) => f.get('isBookmark'));
      const searchResultFeature = features.find((f) => f.get('isSearchResult'));

      if (bookmarkFeature) {
        clickedBookmark = bookmarkFeature.get('originalPlace');
      } else if (searchResultFeature) {
        clickedSearchResult = searchResultFeature.get('originalPlace');
      }
      // Also get visual props for standard map click logic later
      const props = features[0].getProperties();
      if (props.name) {
        selectedFeatureName = props.name;
      }
    }

    // Special handling when sidebar is OPEN
    if (this.args.isSidebarOpen) {
      // If it's a bookmark or search result, we allow "switching" to it even if sidebar is open
      const targetPlace = clickedBookmark || clickedSearchResult;
      if (targetPlace) {
        console.debug(
          'Clicked feature while sidebar open (switching):',
          targetPlace
        );
        this.mapUi.preventNextZoom = true;
        this.router.transitionTo('place', targetPlace);
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
      console.debug('Clicked bookmark:', clickedBookmark);
      this.mapUi.preventNextZoom = true;
      this.router.transitionTo('place', clickedBookmark);
      return;
    }

    if (clickedSearchResult) {
      console.debug('Clicked search result:', clickedSearchResult);
      this.mapUi.preventNextZoom = true;
      this.router.transitionTo('place', clickedSearchResult);
      return;
    }

    // Require Zoom >= 17 for generic map searches
    // This prevents accidental searches when interacting with the map at a high level
    const currentZoom = this.mapInstance.getView().getZoom();
    if (currentZoom < 16) {
      return;
    }

    const coords = toLonLat(event.coordinate);
    const [lon, lat] = coords;

    // Determine search radius based on whether we clicked a named feature
    const searchRadius = selectedFeatureName ? 30 : 50;

    // Show visual feedback (pulse)
    if (this.searchOverlayElement) {
      const view = this.mapInstance.getView();
      const resolutionAtPoint = getPointResolution(
        view.getProjection(),
        view.getResolution(),
        event.coordinate
      );
      const diameterInMeters = searchRadius * 2;
      const diameterInPixels = diameterInMeters / resolutionAtPoint;

      this.searchOverlayElement.style.width = `${diameterInPixels}px`;
      this.searchOverlayElement.style.height = `${diameterInPixels}px`;
      this.searchOverlay.setPosition(event.coordinate);
    }

    // Start Search State
    this.mapUi.startSearch();

    // Transition to Search Route
    const queryParams = {
      lat: lat.toFixed(6),
      lon: lon.toFixed(6),
      q: null, // Clear q to force spatial search
      category: null, // Clear category to force spatial search
      selected: selectedFeatureName || null,
    };

    this.router.transitionTo('search', { queryParams });
  };

  <template>
    <div
      class="map-container {{if @isSidebarOpen 'sidebar-open'}}"
      {{this.setupMap}}
      {{this.updateInteractions}}
      {{this.updateBookmarks}}
      {{this.updateSearchResults}}
      {{this.updateSelectedPin}}
      {{this.syncPulse}}
      {{this.syncCreationMode}}
    ></div>
  </template>
}
