import Component from '@glimmer/component';
import { action } from '@ember/object';
import { service } from '@ember/service';
import Icon from '#components/icon';
import { on } from '@ember/modifier';
import { tracked } from '@glimmer/tracking';
import Modal from './modal';
import NostrConnect from './nostr-connect';

export default class UserMenuComponent extends Component {
  @service storage;
  @service osmAuth;
  @service nostrAuth;
  @service nostrData;

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
  disconnectNostr() {
    this.nostrAuth.disconnect();
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
                {{this.nostrData.userDisplayName}}
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
        <NostrConnect @onConnect={{this.closeNostrConnectModal}} />
      </Modal>
    {{/if}}
  </template>
}
