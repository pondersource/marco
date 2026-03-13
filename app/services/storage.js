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
  @tracked lists = [];
  @tracked version = 0; // Shared version tracker for bookmarks
  @tracked initialSyncDone = false;
  @tracked connected = false;
  @tracked userAddress = null;
  @tracked isWidgetOpen = false;

  constructor() {
    super(...arguments);

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
      this.connected = true;
      this.userAddress = this.rs.remote.userAddress;
      this.loadLists();
    });

    this.rs.on('disconnected', () => {
      this.connected = false;
      this.userAddress = null;
      this.placesInView = [];
      this.savedPlaces = [];
      this.loadedPrefixes = [];
      this.lists = [];
      this.initialSyncDone = false;
    });

    this.rs.on('sync-done', () => {
      // console.debug('[rs] sync done:', result);
      if (!this.initialSyncDone) {
        this.initialSyncDone = true;
        this.loadLists();
      }
    });

    this.rs.scope('/places/').on('change', (event) => {
      // console.debug(event);
      if (event.relativePath.startsWith('_lists/')) {
        this.loadLists();
      } else {
        this.handlePlaceChange(event);
        debounceTask(this, 'reloadCurrentView', 200);
      }
    });
  }

  handlePlaceChange(event) {
    const { newValue, relativePath } = event;

    // Extract ID from path (structure: <2-char>/<2-char>/<id>)
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
    console.debug('Reloading view due to changes, prefixes:', required);

    // Force load these prefixes (bypassing the 'already loaded' check in loadPlacesInBounds)
    this.loadAllPlaces(required);
  }

  async loadLists() {
    try {
      if (!this.places.lists) return; // Wait for module init

      // Ensure defaults exist first
      await this.places.lists.initDefaults();

      const lists = await this.places.lists.getAll();
      this.lists = lists || [];
      this.refreshPlaceListAssociations();
    } catch (e) {
      console.error('Failed to load lists:', e);
    }
  }

  refreshPlaceListAssociations() {
    // 1. Build an index of PlaceID -> ListID[]
    const placeToListMap = new Map();

    this.lists.forEach((list) => {
      if (list.placeRefs && Array.isArray(list.placeRefs)) {
        list.placeRefs.forEach((ref) => {
          if (!ref.id) return;
          if (!placeToListMap.has(ref.id)) {
            placeToListMap.set(ref.id, []);
          }
          placeToListMap.get(ref.id).push(list.id);
        });
      }
    });

    // 2. Helper to attach lists to a place object
    const attachLists = (place) => {
      const listIds = placeToListMap.get(place.id) || [];
      // Assign directly to object property (non-tracked mutation is fine as we trigger updates below)
      place._listIds = listIds;
      return place;
    };

    // 3. Update savedPlaces
    this.savedPlaces = this.savedPlaces.map((p) => attachLists({ ...p }));

    // 4. Update placesInView
    this.placesInView = this.placesInView.map((p) => attachLists({ ...p }));
  }

  async togglePlaceList(place, listId, shouldBeInList) {
    if (!place) return;

    // Ensure place is saved first if it's new
    let savedPlace = place;
    if (!place.id || !place.geohash) {
      if (shouldBeInList) {
        // If adding to a list, we must save the place first
        savedPlace = await this.storePlace(place);
      } else {
        return; // Can't remove an unsaved place from a list
      }
    }

    try {
      if (shouldBeInList) {
        await this.places.lists.addPlace(
          listId,
          savedPlace.id,
          savedPlace.geohash
        );
      } else {
        await this.places.lists.removePlace(listId, savedPlace.id);
      }

      // Reload lists to reflect changes
      await this.loadLists();

      // Return the updated place
      return this.findPlaceById(savedPlace.id);
    } catch (e) {
      console.error('Failed to toggle place in list:', e);
      throw e;
    }
  }

  async loadPlacesInBounds(bbox) {
    // 1. Calculate required prefixes
    const requiredPrefixes = getGeohashPrefixesInBbox(bbox);

    // 2. Filter out prefixes we've already loaded
    const missingPrefixes = requiredPrefixes.filter(
      (p) => !this.loadedPrefixes.includes(p)
    );

    if (missingPrefixes.length === 0) {
      return;
    }

    console.debug('Loading new prefixes:', missingPrefixes);

    // 3. Load places for only the new prefixes
    await this.loadAllPlaces(missingPrefixes);

    // 4. Update our tracked list of loaded prefixes
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
        // Refresh list associations
        this.refreshPlaceListAssociations();
      } else {
        if (!prefixes) this.placesInView = [];
      }
      console.debug('Loaded saved places:', this.placesInView.length);
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

    // Check placesInView as fallback
    place = this.placesInView.find((p) => p.id && String(p.id) === strId);
    if (place) return place;

    // Then search by OSM ID
    place = this.savedPlaces.find((p) => p.osmId && String(p.osmId) === strId);
    if (place) return place;

    place = this.placesInView.find((p) => p.osmId && String(p.osmId) === strId);
    return place;
  }

  isPlaceSaved(id) {
    return !!this.findPlaceById(id);
  }

  async storePlace(placeData) {
    const savedPlace = await this.places.store(placeData);

    // Optimistic Update: Global List
    if (!this.savedPlaces.some((p) => p.id === savedPlace.id)) {
      this.savedPlaces = [...this.savedPlaces, savedPlace];
    } else {
      // Update if exists
      this.savedPlaces = this.savedPlaces.map((p) =>
        p.id === savedPlace.id ? savedPlace : p
      );
    }

    // Optimistic Update: Map View (same logic as Global List)
    if (!this.placesInView.some((p) => p.id === savedPlace.id)) {
      this.placesInView = [...this.placesInView, savedPlace];
    } else {
      this.placesInView = this.placesInView.map((p) =>
        p.id === savedPlace.id ? savedPlace : p
      );
    }

    return savedPlace;
  }

  async updatePlace(placeData) {
    const savedPlace = await this.places.store(placeData);

    // Optimistic Update: Global List
    const index = this.savedPlaces.findIndex((p) => p.id === savedPlace.id);
    if (index !== -1) {
      const newPlaces = [...this.savedPlaces];
      newPlaces[index] = savedPlace;
      this.savedPlaces = newPlaces;
    }

    // Update Map View
    this.placesInView = this.placesInView.map((p) =>
      p.id === savedPlace.id ? savedPlace : p
    );

    return savedPlace;
  }

  async removePlace(place) {
    await this.places.remove(place.id, place.geohash);

    // Update both lists
    this.savedPlaces = this.savedPlaces.filter((p) => p.id !== place.id);
    if (this.placesInView.length > 0) {
      this.placesInView = this.placesInView.filter((p) => p.id !== place.id);
    }
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
