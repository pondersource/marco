import Component from '@glimmer/component';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from '#components/icon';
import UserMenu from '#components/user-menu';
import SearchBox from '#components/search-box';
import CategoryChips from '#components/category-chips';
import { and } from 'ember-truth-helpers';
import cachedImage from '../modifiers/cached-image';
import { getCategoryById } from '../utils/poi-categories';

export default class AppHeaderComponent extends Component {
  @service storage;
  @service settings;
  @service nostrAuth;
  @service nostrData;
  @service mapUi;
  @service router;
  @tracked isUserMenuOpen = false;
  @tracked searchQuery = '';

  constructor() {
    super(...arguments);
    if (this.router && typeof this.router.on === 'function') {
      this.router.on('routeDidChange', this.syncSearchQuery);
    }
    this.syncSearchQuery();
  }

  willDestroy() {
    if (this.router && typeof this.router.off === 'function') {
      this.router.off('routeDidChange', this.syncSearchQuery);
    }
    super.willDestroy(...arguments);
  }

  @action
  syncSearchQuery() {
    const qp =
      this.mapUi.currentSearch || this.router?.currentRoute?.queryParams;
    if (qp?.q) {
      this.searchQuery = qp.q;
    } else if (qp?.category) {
      const category = getCategoryById(qp.category);
      this.searchQuery = category ? category.label : qp.category;
    } else {
      this.searchQuery = '';
    }
  }

  get isSearching() {
    // 1. If we are actively focusing/typing in the search box with a query, hide pills
    if (this.mapUi.searchBoxHasFocus && this.searchQuery) {
      return true;
    }

    // 2. If we are on the search route, check loading and results status
    if (this.router?.currentRouteName === 'search') {
      if (this.mapUi.loadingState) {
        return false; // Keep pills visible while loading
      }
      return this.mapUi.searchResults && this.mapUi.searchResults.length > 0;
    }

    // 3. Fallback for integration tests (non-search route with a query)
    if (this.router?.currentRouteName !== 'search' && this.searchQuery) {
      return true;
    }

    return false;
  }

  get showQuickSearch() {
    const zoom = this.mapUi.currentZoom ?? 13;
    return this.settings.showQuickSearchButtons && zoom >= 12;
  }

  @action
  toggleUserMenu() {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @action
  closeUserMenu() {
    this.isUserMenuOpen = false;
  }

  @action
  handleQueryChange(query) {
    this.searchQuery = query;
  }

  @action
  handleChipSelect(category) {
    this.searchQuery = category.label;
    // The existing logic in CategoryChips triggers the route transition.
    // This update simply fills the search box.
  }

  <template>
    <header class="app-header">
      <div class="header-left">
        <SearchBox
          @query={{this.searchQuery}}
          @onToggleMenu={{@onToggleMenu}}
          @onQueryChange={{this.handleQueryChange}}
        />
      </div>

      {{#if this.showQuickSearch}}
        <div class="header-center {{if this.isSearching 'searching'}}">
          <CategoryChips @onSelect={{this.handleChipSelect}} />
        </div>
      {{/if}}

      <div class="header-right">
        <div class="user-menu-container">
          <button
            class="user-btn btn-press"
            type="button"
            aria-label="User Menu"
            {{on "click" this.toggleUserMenu}}
          >
            {{#if
              (and this.nostrAuth.isConnected this.nostrData.profile.picture)
            }}
              <img
                {{cachedImage this.nostrData.profile.picture}}
                class="user-avatar"
                alt="User Avatar"
              />
            {{else}}
              <div class="user-avatar-placeholder">
                <Icon @name="user" @size={{20}} @color="white" />
              </div>
            {{/if}}
          </button>

          {{#if this.isUserMenuOpen}}
            <UserMenu
              @storage={{this.storage}}
              @onClose={{this.closeUserMenu}}
            />
            <div
              class="menu-backdrop"
              {{on "click" this.closeUserMenu}}
              role="button"
            ></div>
          {{/if}}
        </div>
      </div>
    </header>
  </template>
}
