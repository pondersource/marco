import Service from '@ember/service';
import RemoteStorage from 'remotestoragejs';
import Places from '@remotestorage/module-places';
import Widget from 'remotestorage-widget';
import { tracked } from '@glimmer/tracking';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';
import { action } from '@ember/object';
import { debounceTask } from 'ember-lifeline';
import Geohash from 'latlon-geohash';

export default class StorageService extends Service {
  rs;
  widget;
  @tracked placesInView = [];
  @tracked savedPlaces = [];
  @tracked loadedPrefixes = [];
  @tracked currentBbox = null;
  @tracked version = 0; // Shared version tracker for bookmarks
  @tracked initialSyncDone = false;
  @tracked connected = false;
  @tracked userAddress = null;
  @tracked isWidgetOpen = false;

  constructor() {
    super(...arguments);
    console.log('ohai');

    this.rs = new RemoteStorage({
      modules: [Places],
    });

    this.rs.access.claim('places', 'rw');
    this.rs.caching.enable('/places/');

    window.remoteStorage = this.rs;

    this.widget = new Widget(this.rs, {
      leaveOpen: true,
      skipInitial: true,
    });
    // We don't attach immediately; we'll attach when the user clicks Connect

    this.rs.on('ready', () => {
      // console.debug('[rs] client ready');
    });

    this.rs.on('connected', () => {
      console.debug('Remote storage connected');
      this.connected = true;
      this.userAddress = this.rs.remote.userAddress;
    });

    this.rs.on('disconnected', () => {
      console.debug('Remote storage disconnected');
      this.connected = false;
      this.userAddress = null;
      this.placesInView = [];
      this.savedPlaces = [];
      this.loadedPrefixes = [];
      this.initialSyncDone = false;
    });

    this.rs.on('sync-done', () => {
      // console.debug('[rs] sync done:', result);
      if (!this.initialSyncDone) {
        this.initialSyncDone = true;
      }
    });

    this.rs.scope('/places/').on('change', (event) => {
      // console.debug(event);
      this.handlePlaceChange(event);
      debounceTask(this, 'reloadCurrentView', 200);
    });
  }

  handlePlaceChange(event) {
    const { newValue, relativePath } = event;

    // Remove old entry if exists
    // The relativePath is like "geohash/geohash/ULID" or just "ULID" depending on structure.
    // Our structure is <2-char>/<2-char>/<id>.
    // But let's rely on the ID inside the object if possible, or extract from path.

    // We can't easily identify the ID from just relativePath without parsing logic if it's nested.
    // However, for deletions (newValue is undefined), we might need the ID.
    // Fortunately, our objects (newValue) contain the ID.

    // If it's a deletion, we need to find the object in our array to remove it.
    // Since we don't have the ID in newValue (it's null), we rely on `relativePath`.
    // Let's assume the filename is the ID.
    const pathParts = relativePath.split('/');
    const id = pathParts[pathParts.length - 1];

    if (!newValue) {
      // Deletion
      this.savedPlaces = this.savedPlaces.filter((p) => p.id !== id);
    } else {
      // Add or Update
      // Ensure the object has the ID (it should)
      const place = { ...newValue, id };

      // Update existing or add new
      const index = this.savedPlaces.findIndex((p) => p.id === id);
      if (index !== -1) {
        // Replace
        const newPlaces = [...this.savedPlaces];
        newPlaces[index] = place;
        this.savedPlaces = newPlaces;
      } else {
        // Add
        this.savedPlaces = [...this.savedPlaces, place];
      }
    }
  }

  get places() {
    return this.rs.places;
  }

  notifyChange() {
    this.version++;
    debounceTask(this, 'reloadCurrentView', 200);
  }

  reloadCurrentView() {
    if (!this.currentBbox) return;

    // Recalculate prefixes for the current view
    const required = getGeohashPrefixesInBbox(this.currentBbox);
    console.log('Reloading view due to changes, prefixes:', required);

    // Force load these prefixes (bypassing the 'already loaded' check in loadPlacesInBounds)
    this.loadAllPlaces(required);
  }

  async loadPlacesInBounds(bbox) {
    // 1. Calculate required prefixes
    const requiredPrefixes = getGeohashPrefixesInBbox(bbox);

    // 2. Filter out prefixes we've already loaded
    const missingPrefixes = requiredPrefixes.filter(
      (p) => !this.loadedPrefixes.includes(p)
    );

    if (missingPrefixes.length === 0) {
      // console.log('All prefixes already loaded for this view');
      return;
    }

    console.log('Loading new prefixes:', missingPrefixes);

    // 3. Load places for only the new prefixes
    await this.loadAllPlaces(missingPrefixes);

    // 4. Update our tracked list of loaded prefixes
    // Using assignment to trigger reactivity if needed, though simple push/mutation might suffice
    // depending on usage. Tracked arrays need reassignment or specific Ember array methods
    // if we want to observe the array itself, but here we just check inclusion.
    // Let's do a reassignment to be safe and clean.
    this.loadedPrefixes = [...this.loadedPrefixes, ...missingPrefixes];
    this.currentBbox = bbox;
  }

  async loadAllPlaces(prefixes = null) {
    try {
      // If prefixes is null, it loads everything (recursive scan).
      // If prefixes is an array ['w1q7'], it loads just that sector.
      const places = await this.places.getPlaces(prefixes);

      if (places && Array.isArray(places)) {
        if (prefixes) {
          // Identify existing places that belong to the reloaded prefixes and remove them
          const prefixSet = new Set(prefixes);

          const keptPlaces = this.placesInView.filter((place) => {
            if (!place.lat || !place.lon) return false;
            try {
              // Calculate 4-char geohash for the existing place
              const hash = Geohash.encode(place.lat, place.lon, 4);
              // If the hash is in the set of reloaded prefixes, we discard the old version
              // (because the 'places' array contains the authoritative new state for this prefix)
              return !prefixSet.has(hash);
            } catch {
              return true; // Keep malformed/unknown places safe
            }
          });

          // Merge the kept places (from other areas) with the fresh places (from these areas)
          this.placesInView = [...keptPlaces, ...places];
        } else {
          // Full reload
          this.placesInView = places;
        }
      } else {
        if (!prefixes) this.placesInView = [];
      }
      console.log('Loaded saved places:', this.placesInView.length);
    } catch (e) {
      console.error('Failed to load places:', e);
    }
  }

  findPlaceById(id) {
    if (!id) return undefined;
    const strId = String(id);

    // Search by internal ID first (loose comparison via string cast)
    let place = this.savedPlaces.find((p) => p.id && String(p.id) === strId);
    if (place) return place;

    // Then search by OSM ID
    place = this.savedPlaces.find((p) => p.osmId && String(p.osmId) === strId);
    return place;
  }

  async storePlace(placeData) {
    const savedPlace = await this.places.store(placeData);
    // Only append if not already there (handlePlaceChange might also fire)
    if (!this.savedPlaces.some((p) => p.id === savedPlace.id)) {
      this.savedPlaces = [...this.savedPlaces, savedPlace];
    }
    return savedPlace;
  }

  async updatePlace(placeData) {
    const savedPlace = await this.places.store(placeData);

    // Update local list
    const index = this.savedPlaces.findIndex((p) => p.id === savedPlace.id);
    if (index !== -1) {
      const newPlaces = [...this.savedPlaces];
      newPlaces[index] = savedPlace;
      this.savedPlaces = newPlaces;
    }
    return savedPlace;
  }

  async removePlace(place) {
    await this.places.remove(place.id, place.geohash);
    this.savedPlaces = this.savedPlaces.filter((p) => p.id !== place.id);
  }

  @action
  connect() {
    this.isWidgetOpen = true;

    // Check if widget is already attached
    if (!document.querySelector('.rs-widget')) {
      // Attach to our specific container
      this.widget.attach('rs-widget-container');
    }
  }

  @action
  closeWidget() {
    this.isWidgetOpen = false;
  }

  @action
  disconnect() {
    this.rs.disconnect();
    this.isWidgetOpen = false;
  }
}
