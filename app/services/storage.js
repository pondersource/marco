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

  async loadAllPlaces() {
    try {
      const places = await this.rs.places.listAll();
      if (places && Array.isArray(places)) {
        this.savedPlaces = places;
      } else {
        this.savedPlaces = [];
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
