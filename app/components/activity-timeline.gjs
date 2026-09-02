import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from './icon';
import TabNav from './tab-nav';
import ActivityZapItem from './activity-zap-item';
import ActivityPhotoItem from './activity-photo-item';
import Modal from './modal';
import NostrConnect from './nostr-connect';
import not from 'ember-truth-helpers/helpers/not';
import eq from 'ember-truth-helpers/helpers/eq';
import and from 'ember-truth-helpers/helpers/and';
import restoreScroll from '../modifiers/restore-scroll';

export default class ActivityTimelineComponent extends Component {
  @tracked isNostrConnectModalOpen = false;

  tabs = [
    { label: 'Home', value: 'home' },
    { label: 'Explore', value: 'explore' },
  ];

  @action
  openNostrConnectModal(event) {
    event.preventDefault();
    this.isNostrConnectModalOpen = true;
  }

  @action
  closeNostrConnectModal() {
    this.isNostrConnectModalOpen = false;
  }

  @action
  onNostrConnected() {
    this.closeNostrConnectModal();
    this.args.onNostrConnected?.();
  }

  <template>
    <div class="sidebar">
      <div class="sidebar-header has-back-btn">
        <button type="button" class="back-btn" {{on "click" @onBack}}>
          <Icon @name="arrow-left" @size={{20}} @color="#333" />
        </button>
        <h2 class="sidebar-header-text-centered">
          <span class="sidebar-header-icon-wrapper">
            <Icon @name="activity" @size={{20}} @color="#898989" />
          </span>
          Activity
        </h2>
        <button type="button" class="close-btn" {{on "click" @onClose}}>
          <Icon @name="x" @size={{20}} @color="#333" />
        </button>
      </div>

      <TabNav
        @tabs={{this.tabs}}
        @active={{@sourceMode}}
        @onChange={{@onSetSourceMode}}
      />

      <div class="sidebar-content" {{restoreScroll @scrollTop}}>
        {{#if @isLoading}}
          <div class="sidebar-loading">
            <Icon @name="loading-ring" @size={{24}} @color="#898989" />
          </div>
        {{else if (and (not @isConnected) (eq @sourceMode "home"))}}
          <p class="empty-state">
            <a
              href="#"
              role="button"
              tabindex="0"
              {{on "click" this.openNostrConnectModal}}
            >Connect your Nostr account</a>
            to see your activity.
          </p>
        {{else if (not @items.length)}}
          <p class="empty-state">No activity yet.</p>
        {{else}}
          <ul class="activity-list">
            {{#each @items as |item|}}
              {{#if (eq item.type "zap")}}
                <ActivityZapItem @item={{item}} @onSelect={{@onSelect}} />
              {{else if (eq item.type "photo")}}
                <ActivityPhotoItem @item={{item}} @onSelect={{@onSelect}} />
              {{/if}}
            {{/each}}
          </ul>
        {{/if}}
      </div>
    </div>

    {{#if this.isNostrConnectModalOpen}}
      <Modal @onClose={{this.closeNostrConnectModal}}>
        <NostrConnect @onConnect={{this.onNostrConnected}} />
      </Modal>
    {{/if}}
  </template>
}
