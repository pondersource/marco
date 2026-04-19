import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';

export default class NostrConnectComponent extends Component {
  @service nostrAuth;

  get hasExtension() {
    return typeof window !== 'undefined' && typeof window.nostr !== 'undefined';
  }

  @action
  async connectExtension() {
    try {
      await this.nostrAuth.login('extension');
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
      await this.nostrAuth.login('connect');
      if (this.args.onConnect) {
        this.args.onConnect();
      }
    } catch (e) {
      console.error(e);
      alert(e.message);
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
            class="btn btn-secondary"
            type="button"
            disabled
            title="No Nostr extension found in your browser."
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
        <div class="alert alert-info nostr-connect-status">
          <p>Waiting for you to approve the connection in your mobile signer
            app...</p>
        </div>
      {{/if}}
    </div>
  </template>
}
