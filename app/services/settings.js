import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class SettingsService extends Service {
  @tracked overpassApi = 'https://overpass-api.de/api/interpreter';
  @tracked mapKinetic = true;

  overpassApis = [
    {
      name: 'overpass-api.de (DE)',
      url: 'https://overpass-api.de/api/interpreter',
    },
    {
      name: 'private.coffee (AT)',
      url: 'https://overpass.private.coffee/api/interpreter',
    },
    // {
    //   name: 'overpass.openstreetmap.us (US)',
    //   url: 'https://overpass.openstreetmap.us/api/interpreter'
    // },
    // {
    //   name: 'bke.ro (US)',
    //   url: 'https://overpass.bke.ro/api/interpreter'
    // },
  ];

  constructor() {
    super(...arguments);
    this.loadSettings();
  }

  loadSettings() {
    const savedApi = localStorage.getItem('marco:overpass-api');
    if (savedApi) {
      // Check if saved API is still in the allowed list
      const isValid = this.overpassApis.some((api) => api.url === savedApi);
      if (isValid) {
        this.overpassApi = savedApi;
      } else {
        // If not valid, revert to default
        this.overpassApi = 'https://overpass-api.de/api/interpreter';
        localStorage.setItem('marco:overpass-api', this.overpassApi);
      }
    }

    const savedKinetic = localStorage.getItem('marco:map-kinetic');
    if (savedKinetic !== null) {
      this.mapKinetic = savedKinetic === 'true';
    }
    // Default is true (initialized in class field)
  }

  updateOverpassApi(url) {
    this.overpassApi = url;
    localStorage.setItem('marco:overpass-api', url);
  }

  updateMapKinetic(enabled) {
    this.mapKinetic = enabled;
    localStorage.setItem('marco:map-kinetic', String(enabled));
  }
}
