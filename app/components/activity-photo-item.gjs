import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import formatRelativeDate from '../helpers/format-relative-date';
import { npubEncode } from 'applesauce-core/helpers/pointers';
import Icon from './icon';

export default class ActivityPhotoItem extends Component {
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
    return this.photos.length > 0;
  }

  get photos() {
    const photos = this.item?.photos;
    if (photos && photos.length > 0) return photos;
    const single = this.item?.photo;
    return single ? [single] : [];
  }

  get primaryPhoto() {
    return this.photos[0];
  }

  get extraPhotoCount() {
    return Math.max(0, this.photos.length - 1);
  }

  get photoCountText() {
    const count = this.photos.length;
    return count === 1 ? 'a photo' : `${count} photos`;
  }

  get photoThumbUrl() {
    return this.primaryPhoto?.thumbUrl || this.primaryPhoto?.url;
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
            <span class="action"> added {{this.photoCountText}}</span>
          </span>
          <span class="amount">
            <Icon
              @name="feather-camera"
              @size={{16}}
              @color="var(--secondary-text-color)"
            />
          </span>
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
                {{#if (gt this.extraPhotoCount 0)}}
                  <span
                    class="context-thumb-badge"
                  >+{{this.extraPhotoCount}}</span>
                {{/if}}
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
      </button>
    </li>
  </template>
}
