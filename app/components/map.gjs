import Component from '@glimmer/component';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import 'ol/ol.css';
import Map from 'ol/Map.js';
import { defaults as defaultControls, Control } from 'ol/control.js';
import View from 'ol/View.js';
import { fromLonLat, toLonLat, getPointResolution } from 'ol/proj.js';
import Overlay from 'ol/Overlay.js';
import LayerGroup from 'ol/layer/Group.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Geolocation from 'ol/Geolocation.js';
import { Style, Circle, Fill, Stroke } from 'ol/style.js';
import { apply } from 'ol-mapbox-style';

export default class MapComponent extends Component {
  @service osm;
  @service storage;
  @service mapUi;
  @service router;

  mapInstance;
  bookmarkSource;
  searchOverlay;
  searchOverlayElement;
  selectedPinOverlay;
  selectedPinElement;
  crosshairElement; // New crosshair
  crosshairOverlay; // New crosshair overlay

  setupMap = modifier((element) => {
    if (this.mapInstance) return;

    const openfreemap = new LayerGroup();

    // Create a vector source and layer for bookmarks
    this.bookmarkSource = new VectorSource();
    const bookmarkLayer = new VectorLayer({
      source: this.bookmarkSource,
      style: [
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
            fill: new Fill({ color: '#ffcc33' }), // Gold/Yellow
            stroke: new Stroke({
              color: '#fff',
              width: 2,
            }),
          }),
        }),
      ],
      zIndex: 10, // Ensure it sits above the map tiles
    });

    // Default view settings
    let center = [14.21683569, 27.060114248];
    let zoom = 2.661;

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

    this.mapInstance = new Map({
      target: element,
      layers: [openfreemap, bookmarkLayer],
      view: view,
      controls: defaultControls({
        zoom: false,
        rotate: true,
        attribution: true,
      }),
    });

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
    // We create the element in the template (or JS) and attach it.
    // Using JS creation to ensure it's cleanly managed by OpenLayers
    this.selectedPinElement = document.createElement('div');
    this.selectedPinElement.className = 'selected-pin-container';

    // Create the icon structure inside
    const pinIcon = document.createElement('div');
    pinIcon.className = 'selected-pin';
    // We can't use the Glimmer <Icon> component easily inside a raw DOM element created here.
    // So we'll inject the SVG string directly or mount it.
    // Feather icons are globally available if we used the script, but we are using the module approach.
    // Simple SVG for Map Pin:
    pinIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" style="fill: #b31412; stroke: none;"></circle></svg>`;

    const pinShadow = document.createElement('div');
    pinShadow.className = 'selected-pin-shadow';

    this.selectedPinElement.appendChild(pinIcon);
    this.selectedPinElement.appendChild(pinShadow);

    this.selectedPinOverlay = new Overlay({
      element: this.selectedPinElement,
      positioning: 'bottom-center', // Important: Pin tip is at the bottom
      stopEvent: false, // Let clicks pass through
    });
    this.mapInstance.addOverlay(this.selectedPinOverlay);

    // Crosshair Overlay (for Creating New Place)
    this.crosshairElement = document.createElement('div');
    this.crosshairElement.className = 'map-crosshair';
    // Use an SVG or simple CSS cross
    this.crosshairElement.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    // We attach it to the map control container OR keep it as an overlay centered on map center?
    // Actually, a fixed center overlay is trickier in OpenLayers because Overlays move with the map.
    // If we want it FIXED in the center of the VIEWPORT, it should be a Control or just an absolute HTML element on top of the map div.
    // Adding it as a Control is cleaner.

    // HOWEVER, the request says "cross hair drawn on the map... which should be removed when saving".
    // A fixed element in the center of the screen is best for "choose location by dragging map".
    // So let's append it to the map container directly via Glimmer template or JS.

    // We'll append it to the map target element (this.element is the target).
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
        const maxResolution = view.getResolutionForZoom(17); // Use 17 as safe max zoom for accuracy < 20m
        viewOptions.resolution = Math.max(targetResolution, maxResolution);
      } else {
        viewOptions.zoom = 16;
      }

      this.mapInstance.getView().animate(viewOptions);
    };

    locateBtn.addEventListener('click', () => {
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
    });

    const locateControl = new Control({
      element: locateElement,
    });

    this.mapInstance.addLayer(geolocationLayer);
    this.mapInstance.addControl(locateControl);

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

    // Load initial bookmarks
    this.storage.rs.on('ready', () => {
      // Initial load based on current view
      this.handleMapMove();
    });

    // Listen for remote storage changes
    // this.storage.rs.on('connected', () => {
    //   this.loadBookmarks();
    // });
  });

  // Track the selected place from the UI Service (Router -> Map)
  updateSelectedPin = modifier(() => {
    const selected = this.mapUi.selectedPlace;

    if (!this.selectedPinOverlay || !this.selectedPinElement) return;

    if (selected && selected.lat && selected.lon) {
      const coords = fromLonLat([selected.lon, selected.lat]);
      this.selectedPinOverlay.setPosition(coords);

      // Reset animation by removing/adding class
      this.selectedPinElement.classList.remove('active');
      // Force reflow
      void this.selectedPinElement.offsetWidth;
      this.selectedPinElement.classList.add('active');

      this.handlePinVisibility(coords);
    } else {
      this.selectedPinElement.classList.remove('active');
      // Hide it effectively by moving it away or just relying on display:none in CSS
      this.selectedPinOverlay.setPosition(undefined);
    }
  });

  handlePinVisibility(coords) {
    if (!this.mapInstance) return;

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
      this.animateToSmartCenter(coords);
    } else {
      this.panIfObscured(coords);
    }
  }

  animateToSmartCenter(coords) {
    if (!this.mapInstance) return;

    const size = this.mapInstance.getSize();
    const view = this.mapInstance.getView();
    const resolution = view.getResolution();
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

      // Shift center SOUTH (decrease Y)
      // Note: In Web Mercator (EPSG:3857), Y increases North.
      // So to look "lower", we decrease Y? No wait.
      // If we move the camera South (decrease Y), the features move North (Up) on screen.
      // We want the Pin (fixed lat/lon) to be Higher up on screen.
      // So we must move the Camera South (Lower Y).
      targetCenter = [coords[0], coords[1] - offsetMapUnits];
    }

    view.animate({
      center: targetCenter,
      duration: 1000,
      easing: (t) => t * (2 - t), // Ease-out
    });
  }

  panIfObscured(coords) {
    if (!this.mapInstance) return;

    const size = this.mapInstance.getSize();
    // Check if mobile (width <= 768px matches CSS)
    if (size[0] > 768) return;

    const pixel = this.mapInstance.getPixelFromCoordinate(coords);
    if (!pixel) return;

    const height = size[1];

    // Sidebar covers the bottom 50%
    const splitPoint = height / 2;

    // If the pin is in the bottom half (y > splitPoint), it is obscured
    if (pixel[1] > splitPoint) {
      // Target position: Center of top half = height * 0.25
      const targetY = height * 0.25;
      const deltaY = pixel[1] - targetY;

      const view = this.mapInstance.getView();
      const center = view.getCenter();
      const resolution = view.getResolution();

      // Move the map center SOUTH (decrease Y) to move the pin UP (decrease pixel Y)
      const deltaMapUnits = deltaY * resolution;
      const newCenter = [center[0], center[1] - deltaMapUnits];

      view.animate({
        center: newCenter,
        duration: 500,
        easing: (t) => t * (2 - t), // Ease-out
      });
    }
  }

  // Re-fetch bookmarks when the version changes (triggered by parent action or service)
  updateBookmarks = modifier(() => {
    // Depend on the tracked storage.placesInView to automatically update when they change
    const places = this.storage.placesInView;
    this.loadBookmarks(places);
  });

  async loadBookmarks(places = []) {
    try {
      if (!this.bookmarkSource) return;

      if (!places || places.length === 0) {
        // Fallback or explicit check if we have tracked property usage?
        // The service updates 'placesInView'. We should probably use that if we want reactiveness.
        places = this.storage.placesInView;
      }

      // Previously: const places = await this.storage.places.getPlaces();
      // We no longer want to fetch everything blindly.
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
        // We only animate if the map center isn't already "roughly" correct
        // But actually, updateCreationCoordinates is called by handleMapMove too.
        // We need to distinguish "initial set" vs "drag update".
        // The Service doesn't distinguish, but if we are just entering mode,
        // we can check if the current map center aligns.

        // Better approach:
        // We calculate where the map center *should* be to put the target coords
        // under the crosshair.
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
    // Wait.
    // If crosshair is to the right (+X), we need to move the camera LEFT (-X) to bring the point there?
    // Let's think in map units.
    const view = this.mapInstance.getView();
    const resolution = view.getResolution();

    const offsetMapUnitsX = offsetX * resolution;
    const offsetMapUnitsY = -offsetY * resolution; // Y is inverted in pixel vs map coords usually?
    // In Web Mercator: Y increases North (Up).
    // In Pixels: Y increases South (Down).
    // So +PixelY (Down) = -MapY (South). Correct.

    // If crosshair is at +100px (Right), we want the target to be there.
    // If we center on target, it is at 0px.
    // To make it appear at +100px, we must shift the camera center by -100px (Left).
    // So CenterX_new = TargetX - offsetMapUnitsX.

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

    // If in creation mode, update the coordinates in the service AND the URL
    if (this.mapUi.isCreating) {
      // Calculate coordinates under the crosshair element
      // We need the pixel position of the crosshair relative to the map viewport
      // The crosshair is positioned via CSS, so we can use getBoundingClientRect
      const mapRect = this.mapInstance.getTargetElement().getBoundingClientRect();
      const crosshairRect = this.crosshairElement.getBoundingClientRect();

      const centerX = crosshairRect.left + crosshairRect.width / 2 - mapRect.left;
      const centerY = crosshairRect.top + crosshairRect.height / 2 - mapRect.top;

      const coordinate = this.mapInstance.getCoordinateFromPixel([centerX, centerY]);
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
    // Check if user clicked on a rendered feature (POI or Bookmark) FIRST
    const features = this.mapInstance.getFeaturesAtPixel(event.pixel, {
      hitTolerance: 10,
    });
    let clickedBookmark = null;
    let selectedFeatureName = null;

    if (features && features.length > 0) {
      console.debug(`Found ${features.length} features in map layer:`);
      for (const f of features) {
        console.debug(f);
      }
      const bookmarkFeature = features.find((f) => f.get('isBookmark'));
      if (bookmarkFeature) {
        clickedBookmark = bookmarkFeature.get('originalPlace');
      }
      // Also get visual props for standard map click logic later
      const props = features[0].getProperties();
      if (props.name) {
        selectedFeatureName = props.name;
      }
    }

    // Special handling when sidebar is OPEN
    if (this.args.isSidebarOpen) {
      // If it's a bookmark, we allow "switching" to it even if sidebar is open
      if (clickedBookmark) {
        console.debug(
          'Clicked bookmark while sidebar open (switching):',
          clickedBookmark
        );
        this.router.transitionTo('place', clickedBookmark);
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
      this.router.transitionTo('place', clickedBookmark);
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
    };
    if (selectedFeatureName) {
      queryParams.q = selectedFeatureName;
    }

    this.router.transitionTo('search', { queryParams });
  };

  <template>
    <div
      class="map-container {{if @isSidebarOpen 'sidebar-open'}}"
      {{this.setupMap}}
      {{this.updateBookmarks}}
      {{this.updateSelectedPin}}
      {{this.syncPulse}}
      {{this.syncCreationMode}}
    ></div>
  </template>
}
