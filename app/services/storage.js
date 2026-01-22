import Service from '@ember/service';
import RemoteStorage from 'remotestoragejs';
import Places from '@remotestorage/module-places';
import { tracked } from '@glimmer/tracking';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';
import { debounce } from '@ember/runloop';
import Geohash from 'latlon-geohash';

export default class StorageService extends Service {
  rs;
  @tracked savedPlaces = [];
  @tracked loadedPrefixes = [];
  @tracked currentBbox = null;
  @tracked version = 0; // Shared version tracker for bookmarks
  @tracked initialSyncDone = false;

  constructor() {
    super(...arguments);
    console.log('ohai');

    this.rs = new RemoteStorage({
      modules: [Places],
    });

    this.rs.access.claim('places', 'rw');
    // Caching strategy:
    this.rs.caching.enable('/places/');

    window.remoteStorage = this.rs;

    // const widget = new Widget(this.rs);
    // widget.attach();

    this.rs.on('ready', () => {
      // console.debug('[rs] client ready');
    });

    this.rs.on('sync-done', result => {
      // console.debug('[rs] sync done:', result);
      if (!this.initialSyncDone) { this.initialSyncDone = true; }
    });

    this.rs.scope('/places/').on('change', (event) => {
      console.debug(event);
      debounce(this, this.reloadCurrentView, 200);
    });
  }

  get places() {
    return this.rs.places;
  }

  notifyChange() {
    this.version++;
    debounce(this, this.reloadCurrentView, 200);
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

          const keptPlaces = this.savedPlaces.filter((place) => {
            if (!place.lat || !place.lon) return false;
            try {
              // Calculate 4-char geohash for the existing place
              const hash = Geohash.encode(place.lat, place.lon, 4);
              // If the hash is in the set of reloaded prefixes, we discard the old version
              // (because the 'places' array contains the authoritative new state for this prefix)
              return !prefixSet.has(hash);
            } catch (e) {
              return true; // Keep malformed/unknown places safe
            }
          });

          // Merge the kept places (from other areas) with the fresh places (from these areas)
          this.savedPlaces = [...keptPlaces, ...places];
        } else {
          // Full reload
          this.savedPlaces = places;
        }
      } else {
        if (!prefixes) this.savedPlaces = [];
      }
      console.log('Loaded saved places:', this.savedPlaces.length);
    } catch (e) {
      console.error('Failed to load places:', e);
    }
  }

  findPlaceById(id) {
    // Search by internal ID first
    let place = this.savedPlaces.find((p) => p.id === id);
    if (place) return place;

    // Then search by OSM ID
    place = this.savedPlaces.find((p) => p.osmId === id);
    return place;
  }
}
