import Service, { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import {
  ExtensionSigner,
  NostrConnectSigner,
  PrivateKeySigner,
} from 'applesauce-signers';

const STORAGE_KEY = 'marco:nostr_pubkey';
const STORAGE_KEY_TYPE = 'marco:nostr_signer_type'; // 'extension' | 'connect'
const STORAGE_KEY_CONNECT_LOCAL_KEY = 'marco:nostr_connect_local_key';
const STORAGE_KEY_CONNECT_REMOTE_PUBKEY = 'marco:nostr_connect_remote_pubkey';
const STORAGE_KEY_CONNECT_RELAY = 'marco:nostr_connect_relay';

const DEFAULT_CONNECT_RELAY = 'wss://relay.nsec.app';

export default class NostrAuthService extends Service {
  @service nostrRelay;
  @service nostrData;

  @tracked pubkey = null;
  @tracked signerType = null; // 'extension' or 'connect'

  // Track NostrConnect state for the UI
  @tracked connectStatus = null; // null | 'waiting' | 'connected'
  @tracked connectUri = null; // For displaying a QR code if needed

  _signerInstance = null;

  constructor() {
    super(...arguments);

    // Enable debug logging for applesauce packages
    if (typeof localStorage !== 'undefined') {
      localStorage.debug = 'applesauce:*';
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    const type = localStorage.getItem(STORAGE_KEY_TYPE);
    if (saved) {
      this.pubkey = saved;
      this.signerType = type || 'extension';
      this._verifyPubkey();
    }
  }

  async _verifyPubkey() {
    if (this.signerType === 'extension') {
      if (typeof window.nostr === 'undefined') {
        this.disconnect();
        return;
      }
      try {
        const signer = new ExtensionSigner();
        const extensionPubkey = await signer.getPublicKey();
        if (extensionPubkey !== this.pubkey) {
          this.pubkey = extensionPubkey;
          localStorage.setItem(STORAGE_KEY, this.pubkey);
        }
        this.nostrData.loadProfile(this.pubkey);
      } catch (e) {
        console.warn('Failed to verify extension nostr pubkey, logging out', e);
        this.disconnect();
      }
    } else if (this.signerType === 'connect') {
      try {
        await this._initConnectSigner();
      } catch (e) {
        console.warn('Failed to verify connect nostr pubkey, logging out', e);
        this.disconnect();
      }
    }
  }

  get isMobile() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  }

  get isConnected() {
    return (
      !!this.pubkey &&
      (this.signerType === 'extension'
        ? typeof window.nostr !== 'undefined'
        : true)
    );
  }

  get signer() {
    if (this._signerInstance) return this._signerInstance;

    if (
      this.signerType === 'extension' &&
      typeof window.nostr !== 'undefined'
    ) {
      return new ExtensionSigner();
    }

    if (this.signerType === 'connect') {
      // Must be initialized async due to the connect handshakes
      return null;
    }

    return null;
  }

  async connectWithExtension() {
    if (typeof window.nostr === 'undefined') {
      throw new Error('No NIP-07 Nostr extension found (e.g., Alby, nos2x).');
    }

    try {
      this._signerInstance = new ExtensionSigner();
      this.pubkey = await this._signerInstance.getPublicKey();
      this.signerType = 'extension';
      localStorage.setItem(STORAGE_KEY, this.pubkey);
      localStorage.setItem(STORAGE_KEY_TYPE, 'extension');
      this.nostrData.loadProfile(this.pubkey);
      return this.pubkey;
    } catch (error) {
      console.error('Failed to get public key from extension:', error);
      throw error;
    }
  }

  _getLocalSigner() {
    let localKeyHex = localStorage.getItem(STORAGE_KEY_CONNECT_LOCAL_KEY);
    let localSigner;
    if (localKeyHex) {
      localSigner = PrivateKeySigner.fromKey(localKeyHex);
    } else {
      localSigner = new PrivateKeySigner();
      // Store the raw Uint8Array as hex string
      localKeyHex = Array.from(localSigner.key)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(STORAGE_KEY_CONNECT_LOCAL_KEY, localKeyHex);
    }
    return localSigner;
  }

  async connectWithApp() {
    this.connectStatus = 'waiting';

    try {
      const localSigner = this._getLocalSigner();

      // We use a specific relay for the connection handshake.
      const relay = DEFAULT_CONNECT_RELAY;
      localStorage.setItem(STORAGE_KEY_CONNECT_RELAY, relay);

      // Override aggressive 10s EOSE timeout to allow time for QR scanning
      this.nostrRelay.pool.relay(relay).eoseTimeout = 180000; // 3 minutes

      this._signerInstance = new NostrConnectSigner({
        pool: this.nostrRelay.pool,
        relays: [relay],
        signer: localSigner,
        onAuth: async (url) => {
          // NIP-46 auth callback. Normally the signer app does this natively via notification.
          // But if it requires an explicit browser window:
          if (
            confirm(
              `Your signer app requests authentication via a web page. Open it now?\n\nURL: ${url}`
            )
          ) {
            window.open(url, '_blank');
          }
        },
      });

      // Set the uri for display (e.g., to redirect via intent)
      this.connectUri = this._signerInstance.getNostrConnectURI({
        name: 'Marco',
        url: window.location.origin,
        description: 'An unhosted maps application.',
        icons: [],
      });

      // Trigger the deep link intent immediately for the user if on mobile
      if (this.isMobile) {
        console.debug('Mobile detected, triggering deep link intent.');
        window.location.href = this.connectUri;
      }

      // Start listening to the relay
      console.debug('Opening signer connection to relay...');
      await this._signerInstance.open();
      console.debug('Signer connection opened successfully.');

      // Wait for the remote signer to reply with their pubkey
      console.debug('Waiting for remote signer to ack via relay...');
      try {
        await this._signerInstance.waitForSigner();
        console.debug('Remote signer ack received!');
      } catch (waitErr) {
        console.error('Error while waiting for remote signer ack:', waitErr);
        throw waitErr;
      }

      // Once connected, get the actual user pubkey
      this.pubkey = await this._signerInstance.getPublicKey();
      this.signerType = 'connect';
      this.connectStatus = 'connected';

      // Save connection state
      localStorage.setItem(STORAGE_KEY, this.pubkey);
      localStorage.setItem(STORAGE_KEY_TYPE, 'connect');
      localStorage.setItem(
        STORAGE_KEY_CONNECT_REMOTE_PUBKEY,
        this._signerInstance.remote
      );

      this.nostrData.loadProfile(this.pubkey);

      return this.pubkey;
    } catch (error) {
      this.connectStatus = null;
      console.error('Failed to connect via Nostr Connect:', error);
      throw error;
    }
  }

  async _initConnectSigner() {
    const remotePubkey = localStorage.getItem(
      STORAGE_KEY_CONNECT_REMOTE_PUBKEY
    );
    const relay =
      localStorage.getItem(STORAGE_KEY_CONNECT_RELAY) || DEFAULT_CONNECT_RELAY;

    if (!remotePubkey) {
      throw new Error('Missing Nostr Connect remote pubkey.');
    }

    const localSigner = this._getLocalSigner();

    // Override aggressive 10s EOSE timeout to allow time for QR scanning
    this.nostrRelay.pool.relay(relay).eoseTimeout = 180000; // 3 minutes

    this._signerInstance = new NostrConnectSigner({
      pool: this.nostrRelay.pool,
      relays: [relay],
      signer: localSigner,
      remote: remotePubkey,
      onAuth: async (url) => {
        if (
          confirm(
            `Your signer app requests authentication via a web page. Open it now?\n\nURL: ${url}`
          )
        ) {
          window.open(url, '_blank');
        }
      },
    });

    await this._signerInstance.open();
    // Validate we can still get the pubkey from the remote signer
    const pubkey = await this._signerInstance.getPublicKey();
    if (pubkey !== this.pubkey) {
      throw new Error('Remote signer pubkey mismatch');
    }
    this.nostrData.loadProfile(this.pubkey);
  }

  async signEvent(event) {
    if (!this.signer) {
      throw new Error(
        'Not connected or extension missing. Please connect Nostr again.'
      );
    }
    return await this.signer.signEvent(event);
  }

  async disconnect() {
    this.pubkey = null;
    this.nostrData?.loadProfile(null);
    this.signerType = null;
    this.connectStatus = null;
    this.connectUri = null;
    if (
      this._signerInstance &&
      typeof this._signerInstance.close === 'function'
    ) {
      await this._signerInstance.close();
    }
    this._signerInstance = null;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_TYPE);
    localStorage.removeItem(STORAGE_KEY_CONNECT_LOCAL_KEY);
    localStorage.removeItem(STORAGE_KEY_CONNECT_REMOTE_PUBKEY);
    localStorage.removeItem(STORAGE_KEY_CONNECT_RELAY);
  }
}
