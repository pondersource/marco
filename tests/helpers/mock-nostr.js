import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { Promise } from 'rsvp';

export class MockNostrAuthService extends Service {
  @tracked pubkey = null;
  @tracked signerType = null;
  @tracked connectStatus = null;
  @tracked connectUri = null;

  get isConnected() {
    return false;
  }

  get isMobile() {
    return false;
  }

  get signer() {
    return null;
  }

  async connectWithExtension() {
    return Promise.resolve();
  }

  async connectWithApp() {
    return Promise.resolve();
  }

  disconnect() {}
}

export class MockNostrDataService extends Service {
  @tracked profile = null;
  @tracked mailboxes = null;
  @tracked blossomServers = [];
  @tracked placePhotos = [];
  @tracked profiles = {};

  store = {
    add: () => {},
  };

  getProfile(pubkey) {
    return this.profiles[pubkey];
  }

  get activeReadRelays() {
    return [];
  }

  get activeWriteRelays() {
    return [];
  }

  get requiredReadRelays() {
    return [];
  }

  get requiredWriteRelays() {
    return [];
  }

  get mailboxReadRelays() {
    return [];
  }

  get mailboxWriteRelays() {
    return [];
  }

  get userDisplayName() {
    return 'Mock User';
  }

  loadPlacesInBounds() {
    return Promise.resolve();
  }

  loadPhotosForPlace() {
    return Promise.resolve();
  }

  loadPlacePhotos() {
    return Promise.resolve();
  }
}

export class MockNostrRelayService extends Service {
  pool = {
    publish: () => Promise.resolve([{ ok: true }]),
    subscribe: () => {},
    unsubscribe: () => {},
    close: () => {},
  };

  async publish() {
    return [{ ok: true }];
  }
}

export function setupNostrMocks(hooks) {
  hooks.beforeEach(function () {
    this.owner.register('service:nostrAuth', MockNostrAuthService);
    this.owner.register('service:nostrData', MockNostrDataService);
    this.owner.register('service:nostrRelay', MockNostrRelayService);
  });
}
