import Service from '@ember/service';
import RemoteStorage from 'remotestoragejs';
import Places from '@remotestorage/module-places';
import Widget from 'remotestorage-widget';
import { tracked } from '@glimmer/tracking';

export default class StorageService extends Service {
  rs;
  @tracked savedPlaces = [];
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
      this.loadAllPlaces();
    });

    this.rs.scope('/places/').on('change', () => {
      this.loadAllPlaces();
    });
  }

  get places() {
    return this.rs.places;
  }

  notifyChange() {
    this.version++;
    this.loadAllPlaces();
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
