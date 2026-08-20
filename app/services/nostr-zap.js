import Service, { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { ZapRequestFactory } from 'applesauce-common/factories';
import {
  getInvoice,
  parseBolt11,
  parseLNURLOrAddress,
} from 'applesauce-common/helpers';
import { getInboxes } from 'applesauce-core/helpers/mailboxes';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';

const DEFAULT_ZAP_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
];

const DIRECTORY_RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.damus.io',
];

const RELAY_FETCH_TIMEOUT = 10_000;

export default class NostrZapService extends Service {
  @service nostrAuth;
  @service nostrData;
  @service nostrRelay;

  @tracked recipientRelays = null;

  getLightningAddress(pubkey) {
    const profile = this.nostrData.getProfile(pubkey);
    return profile?.lud16 || profile?.lud06 || null;
  }

  async resolveLnurl(address) {
    const url = parseLNURLOrAddress(address);
    if (!url) throw new Error('Invalid lightning address or LNURL');

    // eslint-disable-next-line warp-drive/no-external-request-patterns
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to fetch LNURL pay endpoint: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.callback) {
      throw new Error('Invalid LNURL pay endpoint: missing callback');
    }
    if (!data.allowsNostr) {
      throw new Error('This lightning address does not support Nostr zaps');
    }

    return {
      callback: data.callback,
      minSendable: data.minSendable ?? 1000,
      maxSendable: data.maxSendable ?? 100_000_000_000,
      allowsNostr: !!data.allowsNostr,
      nostrPubkey: data.nostrPubkey,
    };
  }

  async loadRecipientRelays(pubkey) {
    if (!pubkey) return this._fallbackRelays();

    // Check the store first — the event may already be cached
    const fromStore = await this._getMailboxesFromStore(pubkey);
    if (fromStore?.length) {
      this.recipientRelays = fromStore;
      return fromStore;
    }

    // Fetch from network if not in the store
    const fetched = await this._fetchMailboxesFromNetwork(pubkey);
    if (fetched?.length) {
      this.recipientRelays = fetched;
      return fetched;
    }

    // Fallback: sender's inbox relays + popular defaults
    const fallback = this._fallbackRelays();
    this.recipientRelays = fallback;
    return fallback;
  }

  async _getMailboxesFromStore(pubkey) {
    try {
      const event = await firstValueFrom(
        this.nostrData.store.replaceable(10002, pubkey).pipe(
          timeout(500),
          catchError(() => of(null))
        )
      );
      if (event) return getInboxes(event);
    } catch {
      // Event not in store yet
    }
    return null;
  }

  async _fetchMailboxesFromNetwork(pubkey) {
    const relays = this.nostrData.activeReadRelays?.length
      ? this.nostrData.activeReadRelays
      : DIRECTORY_RELAYS;

    try {
      const event = await firstValueFrom(
        this.nostrRelay.pool
          .request(relays, [{ kinds: [10002], authors: [pubkey] }])
          .pipe(
            timeout(RELAY_FETCH_TIMEOUT),
            catchError(() => of(null))
          )
      );
      if (event) {
        this.nostrData.store.add(event);
        return getInboxes(event);
      }
    } catch {
      // Network fetch failed
    }
    return null;
  }

  _fallbackRelays() {
    const senderRelays = this.nostrData.mailboxReadRelays || [];
    return [...new Set([...senderRelays, ...DEFAULT_ZAP_RELAYS])].slice(0, 5);
  }

  getZapRelays() {
    if (this.recipientRelays?.length) {
      return this.recipientRelays.slice(0, 5);
    }
    return this._fallbackRelays();
  }

  async createZapRequest(photo, amountMsats, message) {
    const event = this.nostrData.store.getEvent(photo.eventId);
    if (!event) {
      throw new Error('Photo event not found in store');
    }

    const relays = this.getZapRelays();
    const signer = this.nostrAuth.signer;
    if (!signer) {
      throw new Error('Nostr signer not available. Please connect Nostr.');
    }

    return await ZapRequestFactory.event(event, amountMsats, relays)
      .message(message || '')
      .as(signer)
      .sign();
  }

  async fetchInvoice(callbackUrl, zapRequest, amountMsats) {
    const url = new URL(callbackUrl);
    url.searchParams.set('amount', amountMsats.toString());
    url.searchParams.set('nostr', JSON.stringify(zapRequest));
    return await getInvoice(url);
  }

  parseInvoice(invoice) {
    return parseBolt11(invoice);
  }

  hasWebLN() {
    return typeof window !== 'undefined' && typeof window.webln !== 'undefined';
  }

  async payWithWebln(invoice) {
    if (!this.hasWebLN()) throw new Error('WebLN not available');
    await window.webln.enable();
    return await window.webln.sendPayment(invoice);
  }

  async zap(photo, amountMsats, message) {
    const pubkey = photo?.pubkey;
    if (!pubkey) throw new Error('Photo has no pubkey');

    // Ensure recipient relays are loaded before building the zap request
    if (!this.recipientRelays) {
      await this.loadRecipientRelays(pubkey);
    }

    const address = this.getLightningAddress(pubkey);
    if (!address) {
      throw new Error(
        'This user has no lightning address set in their profile'
      );
    }

    const lnurl = await this.resolveLnurl(address);

    if (amountMsats < lnurl.minSendable || amountMsats > lnurl.maxSendable) {
      throw new Error(
        `Amount must be between ${lnurl.minSendable} and ${lnurl.maxSendable} millisats`
      );
    }

    const zapRequest = await this.createZapRequest(photo, amountMsats, message);
    const invoice = await this.fetchInvoice(
      lnurl.callback,
      zapRequest,
      amountMsats
    );

    return { invoice, zapRequest };
  }
}
