import Service from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { ExtensionSigner } from 'applesauce-signers';

const STORAGE_KEY = 'marco:nostr_pubkey';

export default class NostrAuthService extends Service {
  @tracked pubkey = null;

  constructor() {
    super(...arguments);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      this.pubkey = saved;
      this._verifyPubkey();
    }
  }

  async _verifyPubkey() {
    if (typeof window.nostr === 'undefined') {
      this.logout();
      return;
    }

    try {
      const signer = new ExtensionSigner();
      const extensionPubkey = await signer.getPublicKey();

      if (extensionPubkey !== this.pubkey) {
        this.pubkey = extensionPubkey;
        localStorage.setItem(STORAGE_KEY, this.pubkey);
      }
    } catch (e) {
      console.warn('Failed to verify nostr pubkey, logging out', e);
      this.logout();
    }
  }

  get isConnected() {
    return !!this.pubkey;
  }

  get signer() {
    if (typeof window.nostr !== 'undefined') {
      return new ExtensionSigner();
    }
    return null;
  }

  async login() {
    if (typeof window.nostr === 'undefined') {
      throw new Error('No NIP-07 Nostr extension found (e.g., Alby, nos2x).');
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
      throw new Error(
        'Not connected or extension missing. Please connect Nostr again.'
      );
    }
    return await this.signer.signEvent(event);
  }

  logout() {
    this.pubkey = null;
    localStorage.removeItem(STORAGE_KEY);
  }
}
