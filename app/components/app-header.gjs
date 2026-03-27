import Component from '@glimmer/component';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from '#components/icon';
import UserMenu from '#components/user-menu';
import SearchBox from '#components/search-box';
import CategoryChips from '#components/category-chips';

export default class AppHeaderComponent extends Component {
  @service storage;
  @tracked isUserMenuOpen = false;
  @tracked searchQuery = '';

  get hasQuery() {
    return !!this.searchQuery;
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

      <div class="header-center {{if this.hasQuery 'searching'}}">
        <CategoryChips @onSelect={{this.handleChipSelect}} />
      </div>

      <div class="header-right">
        <div class="user-menu-container">
          <button
            class="user-btn btn-press"
            type="button"
            aria-label="User Menu"
            {{on "click" this.toggleUserMenu}}
          >
            <div class="user-avatar-placeholder">
              <Icon @name="user" @size={{20}} @color="white" />
            </div>
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
