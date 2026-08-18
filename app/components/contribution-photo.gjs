import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import or from 'ember-truth-helpers/helpers/or';
import formatRelativeDate from '../helpers/format-relative-date';

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
            {{formatRelativeDate @item.createdAt}}
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
