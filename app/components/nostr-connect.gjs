import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import qrCode from '../modifiers/qr-code';

export default class NostrConnectComponent extends Component {
  @service nostrAuth;
  @service toast;

  get hasExtension() {
    return typeof window !== 'undefined' && typeof window.nostr !== 'undefined';
  }

  @action
  async connectExtension() {
    try {
      await this.nostrAuth.connectWithExtension();
      this.toast.show('Nostr connected successfully');
      if (this.args.onConnect) {
        this.args.onConnect();
      }
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  @action
  async connectApp() {
    try {
      await this.nostrAuth.connectWithApp();
      this.toast.show('Nostr connected successfully');
      if (this.args.onConnect) {
        this.args.onConnect();
      }
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  @action
  async copyConnectUri() {
    const text = this.nostrAuth.connectUri;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;

        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (!successful) {
          throw new Error('Fallback copy failed');
        }
      }
      this.toast.show('Connection link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy link');
    }
  }

  <template>
    <div class="nostr-connect-modal">
      <h2>Connect with Nostr</h2>

      <div class="nostr-connect-options">
        {{#if this.hasExtension}}
          <button
            class="btn btn-primary"
            type="button"
            {{on "click" this.connectExtension}}
          >
            Browser Extension (nos2x, Alby)
          </button>
        {{else}}
          <button
            class="btn btn-outline"
            type="button"
            disabled
            title="No Nostr extension found in your browser"
          >
            Browser Extension (Not Found)
          </button>
        {{/if}}

        <button
          class="btn btn-primary"
          type="button"
          {{on "click" this.connectApp}}
        >
          Mobile Signer App (Amber, etc.)
        </button>
      </div>

      {{#if (eq this.nostrAuth.connectStatus "waiting")}}
        <div class="nostr-connect-status">
          {{#if this.nostrAuth.isMobile}}
            <p>Waiting for you to approve the connection in your mobile signer
              app...</p>
            <div class="mobile-connect-actions">
              <a href={{this.nostrAuth.connectUri}} class="btn btn-primary">
                Open Signer App
              </a>
              <button
                class="btn btn-outline"
                type="button"
                {{on "click" this.copyConnectUri}}
              >
                Copy Connection Link
              </button>
            </div>
          {{else}}
            <p>Scan this QR code with a Nostr signer app (like Amber):</p>
            <div class="qr-code-container">
              <canvas {{qrCode this.nostrAuth.connectUri}}></canvas>
            </div>
          {{/if}}
        </div>
      {{/if}}
    </div>
  </template>
}
