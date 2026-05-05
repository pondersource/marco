import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from '#components/icon';

export default class DropdownMenu extends Component {
  @tracked isOpen = false;

  @action
  toggleMenu(e) {
    e?.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  @action
  closeMenu(e) {
    e?.stopPropagation();
    this.isOpen = false;
  }

  get triggerIcon() {
    return this.args.triggerIcon || 'more-vertical';
  }

  <template>
    <div class="dropdown-menu-container">
      <button
        class="dropdown-trigger-btn btn-press"
        type="button"
        title={{@triggerTitle}}
        {{on "click" this.toggleMenu}}
      >
        <Icon
          @name={{this.triggerIcon}}
          @size={{@iconSize}}
          @color={{@iconColor}}
        />
      </button>

      {{#if this.isOpen}}
        <div class="dropdown-popover {{@popoverClass}}">
          {{yield this.closeMenu}}
        </div>
        <div
          class="menu-backdrop"
          {{on "click" this.closeMenu}}
          role="button"
        ></div>
      {{/if}}
    </div>
  </template>
}
