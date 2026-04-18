import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { ExtensionSigner } from 'applesauce-signers';

const STORAGE_KEY = 'marco:nostr_pubkey';

export default class NostrAuthService extends Service {
  @tracked pubkey = null;
  signer = null;

  constructor() {
    super(...arguments);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      this.pubkey = saved;
    }
  }

  get isConnected() {
    return !!this.pubkey;
  }

  async login() {
    if (typeof window.nostr === 'undefined') {
      throw new Error('No NIP-07 Nostr extension found (e.g., Alby, nos2x).');
    }

    if (!this.signer) {
      this.signer = new ExtensionSigner();
    }

    try {
      this.pubkey = await this.signer.getPublicKey();
      localStorage.setItem(STORAGE_KEY, this.pubkey);
      return this.pubkey;
    } catch (error) {
      console.error('Failed to get public key from extension:', error);
      throw error;
    }
  }

  async signEvent(event) {
    if (!this.signer) {
      if (this.pubkey && typeof window.nostr !== 'undefined') {
        this.signer = new ExtensionSigner();
      } else {
        throw new Error(
          'Not connected or extension missing. Please connect Nostr again.'
        );
      }
    }
    return await this.signer.signEvent(event);
  }

  logout() {
    this.pubkey = null;
    this.signer = null;
    localStorage.removeItem(STORAGE_KEY);
  }
}
