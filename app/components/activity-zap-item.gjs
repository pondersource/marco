import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import formatRelativeDate from '../helpers/format-relative-date';
import { npubEncode } from 'applesauce-core/helpers/pointers';
import Icon from './icon';

export default class ActivityZapItem extends Component {
  get item() {
    return this.args.item;
  }

  get senderName() {
    return this.item?.senderName;
  }

  get senderDisplayName() {
    const name = this.senderName;
    if (name) return name;
    const pubkey = this.item?.senderPubkey;
    if (!pubkey) return 'Someone';
    try {
      return `${npubEncode(pubkey).slice(0, 12)}…`;
    } catch {
      return `${pubkey.slice(0, 12)}…`;
    }
  }

  get senderAvatar() {
    return this.item?.senderAvatar;
  }

  get hasPhoto() {
    return !!this.item?.photo;
  }

  get photoThumbUrl() {
    return this.item?.photo?.thumbUrl || this.item?.photo?.url;
  }

  get placeName() {
    return this.item?.placeName;
  }

  get placeNameLoading() {
    return this.item?.placeNameLoading;
  }

  <template>
    <li>
      <button
        type="button"
        class="activity-zap-item"
        {{on "click" (fn @onSelect @item)}}
      >
        <div class="zap-header">
          <span class="zap-sender-line">
            <span class="zap-sender-name">{{this.senderDisplayName}}</span>
            {{! template-lint-disable no-whitespace-for-layout }}
            <span class="zap-action"> zapped your photo</span>
          </span>
          <span class="zap-amount">{{this.item.amountSats}} ⚡</span>
        </div>

        <div class="zap-context">
          <div class="zap-context-images">
            {{#if this.senderAvatar}}
              <img
                class="zap-sender-avatar"
                src={{this.senderAvatar}}
                alt=""
                loading="lazy"
              />
            {{else}}
              <div class="zap-sender-avatar-placeholder">
                <Icon @name="user" @size={{16}} @color="#999" />
              </div>
            {{/if}}
            {{#if this.hasPhoto}}
              <div class="zap-context-thumb">
                <img src={{this.photoThumbUrl}} alt="" loading="lazy" />
              </div>
            {{/if}}
          </div>
          <span class="zap-context-text">
            {{#if this.placeName}}
              {{this.placeName}}
            {{else if this.placeNameLoading}}
              <span class="contribution-name-loading">Loading…</span>
            {{else}}
              <span class="contribution-name-loading">Unnamed place</span>
            {{/if}}
            ·
            {{formatRelativeDate @item.createdAt}}
          </span>
        </div>

        {{#if this.item.message}}
          <div class="zap-message">{{this.item.message}}</div>
        {{/if}}
      </button>
    </li>
  </template>
}
