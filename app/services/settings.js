import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class SettingsService extends Service {
  @tracked overpassApi = 'https://overpass.bke.ro/api/interpreter';
  @tracked mapKinetic = true;

  overpassApis = [
    { name: 'bke.ro', url: 'https://overpass.bke.ro/api/interpreter' },
    { name: 'overpass-api.de', url: 'https://overpass-api.de/api/interpreter' },
    {
      name: 'private.coffee',
      url: 'https://overpass.private.coffee/api/interpreter',
    },
  ];

  constructor() {
    super(...arguments);
    this.loadSettings();
  }

  loadSettings() {
    const savedApi = localStorage.getItem('marco:overpass-api');
    if (savedApi) {
      this.overpassApi = savedApi;
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
