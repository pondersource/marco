import Component from '@glimmer/component';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from '#components/icon';
import UserMenu from '#components/user-menu';

export default class AppHeaderComponent extends Component {
  @service storage;
  @tracked isUserMenuOpen = false;

  @action
  toggleUserMenu() {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  @action
  closeUserMenu() {
    this.isUserMenuOpen = false;
  }

  <template>
    <header class="app-header">
      <div class="header-left">
        <button
          class="menu-btn btn-press"
          type="button"
          aria-label="Menu"
          {{on "click" @onToggleMenu}}
        >
          <Icon @name="menu" @size={{24}} @color="#333" />
        </button>
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
