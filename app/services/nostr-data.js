import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { EventStore } from 'applesauce-core/event-store';
import { ProfileModel } from 'applesauce-core/models/profile';
import { MailboxesModel } from 'applesauce-core/models/mailboxes';
import { npubEncode } from 'applesauce-core/helpers/pointers';

const BOOTSTRAP_RELAYS = [
  'wss://purplepag.es',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

export default class NostrDataService extends Service {
  @service nostrRelay;
  @service nostrAuth;

  store = new EventStore();

  @tracked profile = null;
  @tracked mailboxes = null;
  @tracked blossomServers = [];

  _profileSub = null;
  _mailboxesSub = null;
  _blossomSub = null;

  _requestSub = null;

  constructor() {
    super(...arguments);

    // Feed events from the relay pool into the event store
    this.nostrRelay.pool.relays$.subscribe(() => {
      // Setup relay subscription tracking if needed, or we just rely on request()
      // which returns an Observable<NostrEvent>
    });
  }

  async loadProfile(pubkey) {
    if (!pubkey) return;

    // Reset state
    this.profile = null;
    this.mailboxes = null;
    this.blossomServers = [];

    this._cleanupSubscriptions();

    const relays = new Set(BOOTSTRAP_RELAYS);

    // Try to get extension relays
    if (typeof window.nostr !== 'undefined' && window.nostr.getRelays) {
      try {
        const extRelays = await window.nostr.getRelays();
        for (const url of Object.keys(extRelays)) {
          relays.add(url);
        }
      } catch {
        console.warn('Failed to get NIP-07 relays');
      }
    }

    const relayList = Array.from(relays);

    // Request events and dump them into the store
    this._requestSub = this.nostrRelay.pool
      .request(relayList, [
        {
          authors: [pubkey],
          kinds: [0, 10002, 10063],
        },
      ])
      .subscribe({
        next: (event) => {
          this.store.add(event);
        },
        error: (err) => {
          console.error('Error fetching profile events:', err);
        },
      });

    // Setup models to track state reactively
    this._profileSub = this.store
      .model(ProfileModel, pubkey)
      .subscribe((profileContent) => {
        this.profile = profileContent;
      });

    this._mailboxesSub = this.store
      .model(MailboxesModel, pubkey)
      .subscribe((mailboxesData) => {
        this.mailboxes = mailboxesData;
      });

    this._blossomSub = this.store
      .replaceable(10063, pubkey)
      .subscribe((event) => {
        if (event && event.tags) {
          this.blossomServers = event.tags
            .filter((t) => t[0] === 'server' && t[1])
            .map((t) => t[1]);
        } else {
          this.blossomServers = [];
        }
      });
  }

  get userDisplayName() {
    if (this.profile) {
      if (this.profile.nip05) {
        return this.profile.nip05;
      }
      if (this.profile.displayName || this.profile.display_name) {
        return this.profile.displayName || this.profile.display_name;
      }
      if (this.profile.name) {
        return this.profile.name;
      }
    }

    // Fallback to npub
    if (this.nostrAuth.pubkey) {
      try {
        const npub = npubEncode(this.nostrAuth.pubkey);
        return `${npub.slice(0, 9)}...${npub.slice(-4)}`;
      } catch {
        return this.nostrAuth.pubkey;
      }
    }

    return 'Not connected';
  }

  _cleanupSubscriptions() {
    if (this._requestSub) {
      this._requestSub.unsubscribe();
      this._requestSub = null;
    }
    if (this._profileSub) {
      this._profileSub.unsubscribe();
      this._profileSub = null;
    }
    if (this._mailboxesSub) {
      this._mailboxesSub.unsubscribe();
      this._mailboxesSub = null;
    }
    if (this._blossomSub) {
      this._blossomSub.unsubscribe();
      this._blossomSub = null;
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this._cleanupSubscriptions();
  }
}
