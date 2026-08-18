import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';

function formatRelativeDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default class ContributionPhoto extends Component {
  get item() {
    return this.args.item;
  }

  get primaryPhoto() {
    return this.item?.photos?.[0] || null;
  }

  get extraPhotoCount() {
    return Math.max(0, (this.item?.photos?.length || 0) - 1);
  }

  get placeName() {
    return this.item?.placeName;
  }

  get isNameLoading() {
    return this.item?.placeNameLoading;
  }

  get relativeDate() {
    return formatRelativeDate(this.item?.createdAt);
  }

  get tags() {
    // Collect unique tags across all photos in the contribution group
    const all = (this.item?.photos || []).flatMap((p) => p.tags || []);
    return [...new Set(all)];
  }

  <template>
    <li>
      <button
        type="button"
        class="contribution-item"
        {{on "click" (fn @onSelect @item)}}
      >
        <div class="contribution-thumb">
          {{#if this.primaryPhoto}}
            <img
              src={{or this.primaryPhoto.thumbUrl this.primaryPhoto.url}}
              alt={{or this.primaryPhoto.alt "Place photo"}}
              loading="lazy"
            />
          {{/if}}
          {{#if (gt this.extraPhotoCount 0)}}
            <span
              class="contribution-thumb-badge"
            >+{{this.extraPhotoCount}}</span>
          {{/if}}
        </div>
        <div class="contribution-info">
          <div class="contribution-place">
            {{#if this.placeName}}
              {{this.placeName}}
            {{else if this.isNameLoading}}
              <span class="contribution-name-loading">Loading…</span>
            {{else}}
              <span class="contribution-name-loading">Unnamed place</span>
            {{/if}}
          </div>
          <div class="contribution-meta">
            {{this.relativeDate}}
            {{#if (gt this.item.photos.length 1)}}
              ·
              {{this.item.photos.length}}
              photos
            {{else}}
              · 1 photo
            {{/if}}
          </div>
          {{#if this.tags.length}}
            <div class="contribution-tags">
              {{#each this.tags as |tag|}}
                <span class="contribution-tag">{{tag}}</span>
              {{/each}}
            </div>
          {{/if}}
        </div>
      </button>
    </li>
  </template>
}
