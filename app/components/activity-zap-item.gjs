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
        class="activity-item"
        {{on "click" (fn @onSelect @item)}}
      >
        <div class="header">
          <span class="sender-line">
            <span class="sender-name">{{this.senderDisplayName}}</span>
            {{! template-lint-disable no-whitespace-for-layout }}
            <span class="action"> zapped your photo</span>
          </span>
          <span class="amount">{{this.item.amountSats}} ⚡</span>
        </div>

        <div class="context">
          <div class="context-images">
            {{#if this.senderAvatar}}
              <img
                class="sender-avatar"
                src={{this.senderAvatar}}
                alt=""
                loading="lazy"
              />
            {{else}}
              <div class="sender-avatar-placeholder">
                <Icon @name="user" @size={{16}} @color="#999" />
              </div>
            {{/if}}
            {{#if this.hasPhoto}}
              <div class="context-thumb">
                <img src={{this.photoThumbUrl}} alt="" loading="lazy" />
              </div>
            {{/if}}
          </div>
          <div class="context-text">
            <span class="activity-place-name">
              {{#if this.placeName}}
                {{this.placeName}}
              {{else if this.placeNameLoading}}
                <span class="contribution-name-loading">Loading…</span>
              {{else}}
                <span class="contribution-name-loading">Unnamed place</span>
              {{/if}}
            </span>
            <span class="activity-date">{{formatRelativeDate
                @item.createdAt
              }}</span>
          </div>
        </div>

        {{#if this.item.message}}
          <div class="message">{{this.item.message}}</div>
        {{/if}}
      </button>
    </li>
  </template>
}
