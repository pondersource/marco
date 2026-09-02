import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import Icon from './icon';
import ActivityZapItem from './activity-zap-item';
import ActivityPhotoItem from './activity-photo-item';
import Modal from './modal';
import NostrConnect from './nostr-connect';
import not from 'ember-truth-helpers/helpers/not';
import eq from 'ember-truth-helpers/helpers/eq';
import restoreScroll from '../modifiers/restore-scroll';
import { ActivityEntry } from '../utils/activity';

export default class ActivityTimelineComponent extends Component {
  @tracked isNostrConnectModalOpen = false;

  get dummyPhotoEntry() {
    const entry = new ActivityEntry({
      photoEventId: 'dummy-photo-event-id',
      photos: [
        {
          thumbUrl: 'https://picsum.photos/seed/marco-photo-1/200/200',
          url: 'https://picsum.photos/seed/marco-photo-1/800/800',
          placeIdentifier: 'osm:node:123456789',
        },
      ],
      placeIdentifier: 'osm:node:123456789',
      senderPubkey: 'dummy-sender-pubkey',
      amountSats: 0,
      message: null,
      createdAt: Math.floor(Date.now() / 1000) - 3600,
    });
    entry.type = 'photo';
    entry.senderName = 'Alice Mapper';
    entry.senderAvatar =
      'https://api.dicebear.com/7.x/avataaars/svg?seed=alice';
    entry.placeName = 'Central Park Café';
    entry.placeNameLoading = false;
    entry.senderProfileLoading = false;
    return entry;
  }

  get dummyMultiPhotoEntry() {
    const entry = new ActivityEntry({
      photoEventId: 'dummy-multi-photo-event-id',
      photos: [
        {
          thumbUrl: 'https://picsum.photos/seed/marco-multi-1/200/200',
          url: 'https://picsum.photos/seed/marco-multi-1/800/800',
          placeIdentifier: 'osm:node:987654321',
        },
        {
          thumbUrl: 'https://picsum.photos/seed/marco-multi-2/200/200',
          url: 'https://picsum.photos/seed/marco-multi-2/800/800',
          placeIdentifier: 'osm:node:987654321',
        },
        {
          thumbUrl: 'https://picsum.photos/seed/marco-multi-3/200/200',
          url: 'https://picsum.photos/seed/marco-multi-3/800/800',
          placeIdentifier: 'osm:node:987654321',
        },
      ],
      placeIdentifier: 'osm:node:987654321',
      senderPubkey: 'dummy-multi-sender-pubkey',
      amountSats: 0,
      message: null,
      createdAt: Math.floor(Date.now() / 1000) - 7200,
    });
    entry.type = 'photo';
    entry.senderName = 'Bob Cartographer';
    entry.senderAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob';
    entry.placeName = 'Riverside Lookout';
    entry.placeNameLoading = false;
    entry.senderProfileLoading = false;
    return entry;
  }

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
            <ActivityPhotoItem
              @item={{this.dummyPhotoEntry}}
              @onSelect={{@onSelect}}
            />
            <ActivityPhotoItem
              @item={{this.dummyMultiPhotoEntry}}
              @onSelect={{@onSelect}}
            />
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
