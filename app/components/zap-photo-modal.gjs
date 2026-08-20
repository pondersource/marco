import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { task } from 'ember-concurrency';
import { eq } from 'ember-truth-helpers';
import qrCode from '../modifiers/qr-code';
import Icon from './icon';

const SLIDER_MIN_SATS = 10;
const SLIDER_MAX_SATS = 100_000;
const SLIDER_STEPS = 200;

function sliderToSats(position) {
  const t = position / SLIDER_STEPS;
  return Math.round(
    Math.exp(
      Math.log(SLIDER_MIN_SATS) +
        (Math.log(SLIDER_MAX_SATS) - Math.log(SLIDER_MIN_SATS)) * t
    )
  );
}

function satsToSlider(sats) {
  return Math.round(
    ((Math.log(sats) - Math.log(SLIDER_MIN_SATS)) /
      (Math.log(SLIDER_MAX_SATS) - Math.log(SLIDER_MIN_SATS))) *
      SLIDER_STEPS
  );
}

const DEFAULT_SLIDER_POSITION = satsToSlider(1000);

export default class ZapPhotoModal extends Component {
  @service nostrZap;
  @service nostrAuth;
  @service nostrData;
  @service toast;

  @tracked step = 'select-amount';
  @tracked sliderPosition = DEFAULT_SLIDER_POSITION;
  @tracked message = '';
  @tracked error = null;
  @tracked invoice = null;
  @tracked lightningAddress = null;
  @tracked lnurlEndpoint = null;
  @tracked lnurlLoading = false;
  @tracked lnurlError = null;

  sliderSteps = SLIDER_STEPS;
  sliderTicks = ['10', '100', '1k', '10k', '100k'];

  constructor() {
    super(...arguments);
    this._loadLightningInfo();
  }

  get photo() {
    return this.args.photo;
  }

  get hasWebLN() {
    return this.nostrZap.hasWebLN();
  }

  get effectiveAmount() {
    return sliderToSats(this.sliderPosition);
  }

  get amountMsats() {
    return this.effectiveAmount * 1000;
  }

  get formattedAmount() {
    return this.effectiveAmount.toLocaleString();
  }

  get cannotZap() {
    return !this.canZap;
  }

  get canZap() {
    if (!this.lnurlEndpoint) return false;
    if (this.lnurlError) return false;
    if (this.effectiveAmount <= 0) return false;
    return (
      this.amountMsats >= this.lnurlEndpoint.minSendable &&
      this.amountMsats <= this.lnurlEndpoint.maxSendable
    );
  }

  get minSats() {
    return this.lnurlEndpoint
      ? Math.ceil(this.lnurlEndpoint.minSendable / 1000)
      : 1;
  }

  get maxSats() {
    return this.lnurlEndpoint
      ? Math.floor(this.lnurlEndpoint.maxSendable / 1000)
      : SLIDER_MAX_SATS;
  }

  get lightningUri() {
    return this.invoice ? `lightning:${this.invoice}` : '';
  }

  get parsedInvoice() {
    if (!this.invoice) return null;
    try {
      return this.nostrZap.parseInvoice(this.invoice);
    } catch {
      return null;
    }
  }
  async _loadLightningInfo() {
    const pubkey = this.photo?.pubkey;
    if (!pubkey) return;

    // Pre-warm the recipient relay cache so the zap request
    // uses the recipient's NIP-65 inbox relays (where they'll
    // see the zap receipt) instead of the sender's relays
    this.nostrZap.loadRecipientRelays(pubkey).catch(() => {});

    const address = this.nostrZap.getLightningAddress(pubkey);
    if (!address) {
      this.lnurlError =
        'This user has no lightning address set in their profile';
      return;
    }

    this.lightningAddress = address;
    this.lnurlLoading = true;
    this.lnurlError = null;

    try {
      this.lnurlEndpoint = await this.nostrZap.resolveLnurl(address);
    } catch (err) {
      this.lnurlError =
        err instanceof Error ? err.message : 'Failed to fetch lightning info';
    } finally {
      this.lnurlLoading = false;
    }
  }
  @action
  updateSlider(e) {
    this.sliderPosition = Number(e.target.value);
  }

  @action
  updateMessage(e) {
    this.message = e.target.value;
  }

  @action
  handleClose() {
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  @action
  resetAndClose() {
    this.step = 'select-amount';
    this.error = null;
    this.invoice = null;
    this.handleClose();
  }

  @action
  retry() {
    this.step = 'select-amount';
    this.error = null;
  }

  @action
  showInvoice() {
    this.step = 'awaiting-payment';
    this.error = null;
  }

  @action
  performZap() {
    this.zapTask.perform();
  }

  @action
  performWebLNPay() {
    this.webLNPayTask.perform();
  }

  @action
  copyInvoice() {
    if (!this.invoice) return;
    try {
      navigator.clipboard.writeText(this.invoice);
      this.toast.show('Invoice copied to clipboard');
    } catch {
      // no-op
    }
  }

  @action
  stopPropagation(e) {
    e.stopPropagation();
  }

  zapTask = task(async () => {
    if (!this.canZap) return;

    this.step = 'fetching-invoice';
    this.error = null;

    try {
      const { invoice } = await this.nostrZap.zap(
        this.photo,
        this.amountMsats,
        this.message
      );
      this.invoice = invoice;
      this.step = 'awaiting-payment';
    } catch (err) {
      console.error('Zap failed:', err);
      this.error = err instanceof Error ? err.message : 'Failed to create zap';
      this.step = 'error';
    }
  });

  webLNPayTask = task(async () => {
    if (!this.invoice) return;

    this.step = 'paying-with-wallet';
    this.error = null;

    try {
      await this.nostrZap.payWithWebln(this.invoice);
      this.step = 'success';
    } catch (err) {
      console.error('WebLN pay failed:', err);
      this.error =
        err instanceof Error ? err.message : 'Failed to pay with wallet';
      this.step = 'wallet-pay-error';
    }
  });

  <template>
    {{! template-lint-disable no-invalid-interactive }}
    <div
      class="zap-photo-modal-overlay"
      role="dialog"
      aria-modal="true"
      {{on "click" this.stopPropagation}}
    >
      <div class="zap-photo-modal">
        <div class="zap-photo-modal-header">
          <h3>Zap Photo</h3>
          <button
            type="button"
            class="btn-text zap-modal-close"
            {{on "click" this.resetAndClose}}
            aria-label="Close"
          >
            <Icon @name="x" @size={{20}} />
          </button>
        </div>

        {{! Lightning address status }}
        <div class="zap-modal-status">
          {{#if this.lnurlLoading}}
            <div class="zap-modal-loading">Loading lightning address...</div>
          {{else if this.lightningAddress}}
            <div class="zap-modal-address">
              <span class="zap-modal-badge">Lightning</span>
              <span
                class="zap-modal-address-text"
              >{{this.lightningAddress}}</span>
            </div>
          {{/if}}
          {{#if this.lnurlError}}
            <div class="zap-modal-error-msg">{{this.lnurlError}}</div>
          {{/if}}
        </div>

        {{! Step: Select Amount }}
        {{#if (eq this.step "select-amount")}}
          <div class="zap-modal-body">
            <div class="zap-amount-display">
              <span class="zap-amount-value">{{this.formattedAmount}}</span>
              <span class="zap-amount-unit">sats</span>
            </div>

            <input
              type="range"
              min="0"
              max={{this.sliderSteps}}
              value={{this.sliderPosition}}
              aria-label="Zap amount in sats"
              {{on "input" this.updateSlider}}
              class="zap-slider"
            />

            <div class="zap-slider-ticks">
              {{#each this.sliderTicks as |label|}}
                <span class="zap-tick">{{label}}</span>
              {{/each}}
            </div>

            {{#if this.lnurlEndpoint}}
              <div class="zap-min-max">
                Min:
                {{this.minSats}}
                sats · Max:
                {{this.maxSats}}
                sats
              </div>
            {{/if}}

            <div class="zap-message-field">
              <label>Message (optional)</label>
              <textarea
                rows="2"
                placeholder="Say something nice..."
                aria-label="Zap message"
                value={{this.message}}
                {{on "input" this.updateMessage}}
              ></textarea>
            </div>

            <div class="zap-modal-actions">
              <button
                type="button"
                class="btn btn-outline"
                {{on "click" this.resetAndClose}}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                disabled={{this.cannotZap}}
                {{on "click" this.performZap}}
              >
                Zap
                {{this.formattedAmount}}
                sats
              </button>
            </div>
          </div>
        {{/if}}

        {{! Step: Fetching Invoice }}
        {{#if (eq this.step "fetching-invoice")}}
          <div class="zap-modal-body zap-modal-center">
            <div class="zap-spinner"></div>
            <p>Creating zap request and fetching invoice...</p>
          </div>
        {{/if}}

        {{! Step: Awaiting Payment }}
        {{#if (eq this.step "awaiting-payment")}}
          <div class="zap-modal-body">
            <p class="zap-pay-prompt">
              Scan to pay
              <strong>{{this.formattedAmount}} sats</strong>
            </p>

            <div class="zap-qr-container">
              <canvas {{qrCode this.invoice}}></canvas>
            </div>

            <a
              href={{this.lightningUri}}
              class="btn btn-outline zap-open-wallet-link"
            >
              Open in Lightning wallet
            </a>

            {{#if this.hasWebLN}}
              <button
                type="button"
                class="btn btn-primary zap-webln-btn"
                {{on "click" this.performWebLNPay}}
              >
                Pay with WebLN
              </button>
            {{/if}}

            <div class="zap-invoice-details">
              <button
                type="button"
                class="btn-text"
                {{on "click" this.copyInvoice}}
              >
                Copy invoice
              </button>
            </div>

            <div class="zap-modal-actions">
              <button
                type="button"
                class="btn btn-outline"
                {{on "click" this.resetAndClose}}
              >
                Cancel
              </button>
            </div>
          </div>
        {{/if}}

        {{! Step: Paying with Wallet }}
        {{#if (eq this.step "paying-with-wallet")}}
          <div class="zap-modal-body zap-modal-center">
            <div class="zap-spinner"></div>
            <p>Paying invoice with WebLN...</p>
          </div>
        {{/if}}

        {{! Step: Wallet Pay Error }}
        {{#if (eq this.step "wallet-pay-error")}}
          <div class="zap-modal-body">
            <div class="zap-modal-error-msg">{{this.error}}</div>
            <p class="zap-modal-hint">
              The WebLN payment failed. You can still scan the QR code with a
              Lightning wallet.
            </p>
            <div class="zap-modal-actions">
              <button
                type="button"
                class="btn btn-outline"
                {{on "click" this.resetAndClose}}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn btn-primary"
                {{on "click" this.showInvoice}}
              >
                Show Invoice
              </button>
            </div>
          </div>
        {{/if}}

        {{! Step: Success }}
        {{#if (eq this.step "success")}}
          <div class="zap-modal-body zap-modal-center zap-success">
            <div class="zap-success-icon">&#9889;</div>
            <h4>Zap Sent!</h4>
            <p>
              You zapped
              <strong>{{this.formattedAmount}} sats</strong>
              {{#if this.message}}
                with message: "{{this.message}}"
              {{/if}}
            </p>
            <button
              type="button"
              class="btn btn-primary"
              {{on "click" this.resetAndClose}}
            >
              Done
            </button>
          </div>
        {{/if}}

        {{! Step: Error }}
        {{#if (eq this.step "error")}}
          <div class="zap-modal-body">
            <div class="zap-modal-error-msg">{{this.error}}</div>
            <div class="zap-modal-actions">
              <button
                type="button"
                class="btn btn-outline"
                {{on "click" this.resetAndClose}}
              >
                Close
              </button>
              <button
                type="button"
                class="btn btn-primary"
                {{on "click" this.retry}}
              >
                Try Again
              </button>
            </div>
          </div>
        {{/if}}
      </div>
    </div>
  </template>
}
