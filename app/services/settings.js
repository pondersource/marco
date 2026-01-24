import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

export default class SettingsService extends Service {
  @tracked overpassApi = 'https://overpass.bke.ro/api/interpreter';

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
    const savedApi = localStorage.getItem('marco-overpass-api');
    if (savedApi) {
      this.overpassApi = savedApi;
    }
  }

  updateOverpassApi(url) {
    this.overpassApi = url;
    localStorage.setItem('marco-overpass-api', url);
  }
}
