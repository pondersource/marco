import Service from '@ember/service';
import RemoteStorage from 'remotestoragejs';
import Places from '@remotestorage/module-places';
import Widget from 'remotestorage-widget';
import { tracked } from '@glimmer/tracking';
import { getGeohashPrefixesInBbox } from '../utils/geohash-coverage';

export default class StorageService extends Service {
  rs;
  @tracked savedPlaces = [];
  @tracked loadedPrefixes = [];
  @tracked currentBbox = null;
  @tracked version = 0; // Shared version tracker for bookmarks

  constructor() {
    super(...arguments);
    console.log('ohai');

    this.rs = new RemoteStorage({
      modules: [Places],
    });

    this.rs.access.claim('places', 'rw');
    // Caching strategy:
    // With the new nested structure, enabling caching on root '/' might try to sync everything.
    // For now, let's keep it, but we might need to be more selective later if data grows huge.
    // Note: The path structure changed from /places/ to just root access in the module?
    // In places.ts: getPath returns "ab/cd/id".
    // RemoteStorage modules usually implicitly use a base scope based on module name if not defined differently?
    // Wait, the module defines `privateClient`.
    // When we do `privateClient.storeObject`, it stores it under the module's scope.
    // If module name is 'places', then it's stored under /places/.
    // So getPath "ab/cd/id" becomes "/places/ab/cd/id".
    // So enabling caching on '/places/' is correct.
    // However, per instructions, we should set maxAge to false for listings in the module,
    // which we did.
    // We also need to be careful about what we cache here.
    this.rs.caching.enable('/places/');

    window.remoteStorage = this.rs;

    // const widget = new Widget(this.rs);
    // widget.attach();

    this.rs.on('ready', () => {
      // this.loadAllPlaces();
    });

    this.rs.scope('/places/').on('change', (event) => {
      // When data changes remotely or locally, we should ideally re-fetch the affected area.
      // However, we don't easily know the bbox of the changed event without parsing paths.
      // For now, let's trigger a reload of the *currently loaded* prefixes to ensure consistency.
      // Or simpler: just let the manual user interaction drive it?
      // No, if a sync happens, we want to see it.
      if (this.currentBbox) {
        console.log('Reloading loaded prefixes due to change event');
        // Reset loaded prefixes to force a reload of the current view
        // Ideally we should just invalidate the specific changed one, but tracking that is harder.
        // Or just re-run loadPlacesInBounds which filters? No, because filters exclude "loadedPrefixes".

        // Strategy:
        // 1. Calculate required prefixes for current view
        const required = getGeohashPrefixesInBbox(this.currentBbox);
        // 2. Force load them
        this.loadAllPlaces(required);
        // Note: we don't update loadedPrefixes here as they are already in the set,
        // but we just want to refresh their data.
      }
    });
  }

  get places() {
    return this.rs.places;
  }

  notifyChange() {
    this.version++;
    // this.loadAllPlaces();
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
      const places = await this.rs.places.getPlaces(prefixes);

      if (places && Array.isArray(places)) {
        if (prefixes) {
          // If partial load, we might want to merge instead of replace?
          // For now, let's keep the simple behavior: replacing the tracked array triggers updates.
          // However, replacing 'all saved places' with 'just these visible places'
          // might hide other bookmarks from the list.

          // Strategy: maintain a Map of loaded places to avoid duplicates/overwrites?
          // Or just append unique ones?
          const currentIds = new Set(this.savedPlaces.map((p) => p.id));
          const newPlaces = places.filter((p) => !currentIds.has(p.id));
          this.savedPlaces = [...this.savedPlaces, ...newPlaces];
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
