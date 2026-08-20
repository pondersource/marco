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

export class MockNostrZapService extends Service {
  @tracked _lightningAddress = 'user@example.com';
  @tracked _endpoint = {
    callback: 'https://example.com/callback',
    minSendable: 1000,
    maxSendable: 100_000_000,
    allowsNostr: true,
    nostrPubkey: 'c'.repeat(64),
  };
  @tracked _webLNAvailable = false;
  @tracked _zapResult = {
    invoice: 'lnbc1u1pjtestinvoice1234567890',
    zapRequest: { id: 'zap-req-1' },
  };
  @tracked _parsedInvoice = {
    amount: 1_000_000,
    expiry: 9_999_999_999,
    description: 'test zap',
  };

  @tracked recipientRelays = null;

  getLightningAddress() {
    return this._lightningAddress;
  }

  async resolveLnurl() {
    if (!this._endpoint.allowsNostr) {
      throw new Error('This lightning address does not support Nostr zaps');
    }
    return this._endpoint;
  }

  async loadRecipientRelays() {
    this.recipientRelays = ['wss://relay.test'];
    return this.recipientRelays;
  }

  getZapRelays() {
    return (
      this.recipientRelays || [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.primal.net',
      ]
    );
  }

  hasWebLN() {
    return this._webLNAvailable;
  }

  async zap() {
    return this._zapResult;
  }

  parseInvoice() {
    return this._parsedInvoice;
  }

  async payWithWebln() {
    return {};
  }
}

export function setupNostrMocks(hooks) {
  hooks.beforeEach(function () {
    this.owner.register('service:nostrAuth', MockNostrAuthService);
    this.owner.register('service:nostrData', MockNostrDataService);
    this.owner.register('service:nostrRelay', MockNostrRelayService);
    this.owner.register('service:nostrZap', MockNostrZapService);
  });
}
