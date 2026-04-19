import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import Icon from '#components/icon';
import { on } from '@ember/modifier';
import { tracked } from '@glimmer/tracking';
import { eq } from 'ember-truth-helpers';
import Modal from './modal';

export default class UserMenuComponent extends Component {
  @service storage;
  @service osmAuth;
  @service nostrAuth;

  @tracked isNostrConnectModalOpen = false;

  @action
  connectRS() {
    this.args.onClose();
    this.args.storage.showConnectWidget();
  }

  @action
  disconnectRS() {
    this.args.storage.disconnect();
  }

  @action
  connectOsm() {
    this.args.onClose();
    this.osmAuth.login();
  }

  @action
  disconnectOsm() {
    this.osmAuth.logout();
  }

  @action
  openNostrConnectModal() {
    this.isNostrConnectModalOpen = true;
  }

  @action
  closeNostrConnectModal() {
    this.isNostrConnectModalOpen = false;
  }

  @action
  async connectNostrExtension() {
    try {
      await this.nostrAuth.login('extension');
      this.closeNostrConnectModal();
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  @action
  async connectNostrApp() {
    try {
      await this.nostrAuth.login('connect');
      this.closeNostrConnectModal();
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  }

  @action
  disconnectNostr() {
    this.nostrAuth.logout();
  }

  get hasExtension() {
    return typeof window !== 'undefined' && typeof window.nostr !== 'undefined';
  }

  <template>
    <div class="user-menu-popover">
      <ul class="account-list">
        <li class="account-item">
          <div class="account-header">
            <div class="account-info">
              <Icon @name="remotestorage" @size={{18}} />
              <span>RemoteStorage</span>
            </div>
            {{#if @storage.connected}}
              <button
                class="btn-text text-danger"
                type="button"
                {{on "click" this.disconnectRS}}
              >Disconnect</button>
            {{else}}
              <button
                class="btn-text text-primary"
                type="button"
                {{on "click" this.connectRS}}
              >Connect</button>
            {{/if}}
          </div>
          <div class="account-status">
            {{#if @storage.connected}}
              <strong>{{@storage.userAddress}}</strong>
            {{else}}
              Not connected
            {{/if}}
          </div>
        </li>

        <li class="account-item">
          <div class="account-header">
            <div class="account-info">
              <Icon @name="map" @size={{18}} />
              <span>OpenStreetMap</span>
            </div>
            {{#if this.osmAuth.isConnected}}
              <button
                class="btn-text text-danger"
                type="button"
                {{on "click" this.disconnectOsm}}
              >Disconnect</button>
            {{else}}
              <button
                class="btn-text text-primary"
                type="button"
                {{on "click" this.connectOsm}}
              >Connect</button>
            {{/if}}
          </div>
          <div class="account-status">
            {{#if this.osmAuth.isConnected}}
              <strong>{{this.osmAuth.userDisplayName}}</strong>
            {{else}}
              Not connected
            {{/if}}
          </div>
        </li>

        <li class="account-item">
          <div class="account-header">
            <div class="account-info">
              <Icon @name="zap" @size={{18}} />
              <span>Nostr</span>
            </div>
            {{#if this.nostrAuth.isConnected}}
              <button
                class="btn-text text-danger"
                type="button"
                {{on "click" this.disconnectNostr}}
              >Disconnect</button>
            {{else}}
              <button
                class="btn-text text-primary"
                type="button"
                {{on "click" this.openNostrConnectModal}}
              >Connect</button>
            {{/if}}
          </div>
          <div class="account-status">
            {{#if this.nostrAuth.isConnected}}
              <strong title={{this.nostrAuth.pubkey}}>
                {{this.nostrAuth.pubkey}}
              </strong>
            {{else}}
              Not connected
            {{/if}}
          </div>
        </li>
      </ul>
    </div>

    {{#if this.isNostrConnectModalOpen}}
      <Modal @onClose={{this.closeNostrConnectModal}}>
        <div class="nostr-connect-modal">
          <h2>Connect with Nostr</h2>

          <div class="nostr-connect-options">
            {{#if this.hasExtension}}
              <button
                class="btn btn-primary"
                type="button"
                {{on "click" this.connectNostrExtension}}
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
              {{on "click" this.connectNostrApp}}
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
      </Modal>
    {{/if}}
  </template>
}
