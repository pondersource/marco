import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from './icon';
import ContributionPhoto from './contribution-photo';
import Modal from './modal';
import NostrConnect from './nostr-connect';
import eq from 'ember-truth-helpers/helpers/eq';
import not from 'ember-truth-helpers/helpers/not';
import restoreScroll from '../modifiers/restore-scroll';

export default class ContributionsTimelineComponent extends Component {
  @tracked isNostrConnectModalOpen = false;

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
            <Icon @name="user-check" @size={{20}} @color="#898989" />
          </span>
          My Contributions
        </h2>
        <button type="button" class="close-btn" {{on "click" @onClose}}>
          <Icon @name="x" @size={{20}} @color="#333" />
        </button>
      </div>

      <div class="sidebar-content" {{restoreScroll @scrollTop}}>
        {{#if @isLoading}}
          <div class="sidebar-loading">
            <Icon @name="loading-ring" @size={{24}} @color="#898989" />
          </div>
        {{else if (not @isConnected)}}
          <p class="empty-state">
            <a
              href="#"
              role="button"
              tabindex="0"
              {{on "click" this.openNostrConnectModal}}
            >Connect your Nostr account</a>
            to see your contributions.
          </p>
        {{else if (not @items.length)}}
          <p class="empty-state">No contributions yet. Start by adding photos to
            places.</p>
        {{else}}
          <ul class="contributions-list">
            {{#each @items as |item|}}
              {{#if (eq item.type "photo")}}
                <ContributionPhoto @item={{item}} @onSelect={{@onSelect}} />
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
