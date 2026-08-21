import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';

import { DEFAULT_BLOSSOM_SERVER } from './blossom';

const DEFAULT_SETTINGS = {
  overpassApi: 'https://overpass-api.de/api/interpreter',
  mapKinetic: true,
  photonApi: 'https://photon.komoot.io/api/',
  showQuickSearchButtons: true,
  nostrPhotoFallbackUploads: false,
  nostrMediaServer: DEFAULT_BLOSSOM_SERVER,
  nostrReadRelays: null,
  nostrWriteRelays: null,
  nostrReadRelayExclusions: null,
  nostrWriteRelayExclusions: null,
  experimentalEnablePhotoDeletion: false,
};

export default class SettingsService extends Service {
  @tracked overpassApi = DEFAULT_SETTINGS.overpassApi;
  @tracked mapKinetic = DEFAULT_SETTINGS.mapKinetic;
  @tracked photonApi = DEFAULT_SETTINGS.photonApi;
  @tracked showQuickSearchButtons = DEFAULT_SETTINGS.showQuickSearchButtons;
  @tracked nostrPhotoFallbackUploads =
    DEFAULT_SETTINGS.nostrPhotoFallbackUploads;
  @tracked nostrMediaServer = DEFAULT_SETTINGS.nostrMediaServer;
  @tracked nostrReadRelays = DEFAULT_SETTINGS.nostrReadRelays;
  @tracked nostrWriteRelays = DEFAULT_SETTINGS.nostrWriteRelays;
  @tracked nostrReadRelayExclusions = DEFAULT_SETTINGS.nostrReadRelayExclusions;
  @tracked nostrWriteRelayExclusions =
    DEFAULT_SETTINGS.nostrWriteRelayExclusions;
  @tracked experimentalEnablePhotoDeletion =
    DEFAULT_SETTINGS.experimentalEnablePhotoDeletion;

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

  photonApis = [
    {
      name: 'photon.komoot.io',
      url: 'https://photon.komoot.io/api/',
    },
  ];

  constructor() {
    super(...arguments);
    this.loadSettings();
  }

  loadSettings() {
    let settings = {};
    const savedSettings = localStorage.getItem('marco:settings');

    if (savedSettings) {
      try {
        settings = JSON.parse(savedSettings);
      } catch (e) {
        console.error('Failed to parse settings from localStorage', e);
      }
    } else {
      // Migration from old individual keys
      const savedApi = localStorage.getItem('marco:overpass-api');
      if (savedApi) settings.overpassApi = savedApi;

      const savedKinetic = localStorage.getItem('marco:map-kinetic');
      if (savedKinetic !== null) settings.mapKinetic = savedKinetic === 'true';

      const savedShowQuickSearch = localStorage.getItem(
        'marco:show-quick-search'
      );
      if (savedShowQuickSearch !== null) {
        settings.showQuickSearchButtons = savedShowQuickSearch === 'true';
      }

      const savedNostrPhotoFallbackUploads = localStorage.getItem(
        'marco:nostr-photo-fallback-uploads'
      );
      if (savedNostrPhotoFallbackUploads !== null) {
        settings.nostrPhotoFallbackUploads =
          savedNostrPhotoFallbackUploads === 'true';
      }

      const savedPhotonApi = localStorage.getItem('marco:photon-api');
      if (savedPhotonApi) settings.photonApi = savedPhotonApi;
    }

    // Merge with defaults
    const finalSettings = { ...DEFAULT_SETTINGS, ...settings };

    // Validate overpass API
    const isValid = this.overpassApis.some(
      (api) => api.url === finalSettings.overpassApi
    );
    if (!isValid) {
      finalSettings.overpassApi = DEFAULT_SETTINGS.overpassApi;
    }

    // Apply to tracked properties
    this.overpassApi = finalSettings.overpassApi;
    this.mapKinetic = finalSettings.mapKinetic;
    this.photonApi = finalSettings.photonApi;
    this.showQuickSearchButtons = finalSettings.showQuickSearchButtons;
    this.nostrPhotoFallbackUploads = finalSettings.nostrPhotoFallbackUploads;
    this.nostrMediaServer = finalSettings.nostrMediaServer;
    this.nostrReadRelays = finalSettings.nostrReadRelays;
    this.nostrWriteRelays = finalSettings.nostrWriteRelays;
    this.nostrReadRelayExclusions = finalSettings.nostrReadRelayExclusions;
    this.nostrWriteRelayExclusions = finalSettings.nostrWriteRelayExclusions;
    this.experimentalEnablePhotoDeletion =
      finalSettings.experimentalEnablePhotoDeletion;

    // Save to ensure migrated settings are stored in the new format
    this.saveSettings();
  }

  saveSettings() {
    const settings = {
      overpassApi: this.overpassApi,
      mapKinetic: this.mapKinetic,
      photonApi: this.photonApi,
      showQuickSearchButtons: this.showQuickSearchButtons,
      nostrPhotoFallbackUploads: this.nostrPhotoFallbackUploads,
      nostrMediaServer: this.nostrMediaServer,
      nostrReadRelays: this.nostrReadRelays,
      nostrWriteRelays: this.nostrWriteRelays,
      nostrReadRelayExclusions: this.nostrReadRelayExclusions,
      nostrWriteRelayExclusions: this.nostrWriteRelayExclusions,
      experimentalEnablePhotoDeletion: this.experimentalEnablePhotoDeletion,
    };
    localStorage.setItem('marco:settings', JSON.stringify(settings));
  }

  update(key, value) {
    if (key in DEFAULT_SETTINGS) {
      this[key] = value;
      this.saveSettings();
    }
  }
}
