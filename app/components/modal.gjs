import Component from '@glimmer/component';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import Icon from './icon';

export default class Modal extends Component {
  @action
  stopProp(e) {
    e.stopPropagation();
  }

  @action
  close() {
    if (this.args.disableClose) return;
    if (this.args.onClose) {
      this.args.onClose();
    }
  }

  <template>
    <div
      class="modal-overlay"
      role="dialog"
      tabindex="-1"
      {{on "click" this.close}}
    >
      <div
        class="modal-content"
        role="document"
        tabindex="0"
        {{on "click" this.stopProp}}
      >
        <button
          type="button"
          class="close-modal-btn btn-text {{if @disableClose 'disabled'}}"
          disabled={{@disableClose}}
          {{on "click" this.close}}
        >
          <Icon @name="x" @size={{24}} @color="currentColor" />
        </button>
        {{yield}}
      </div>
    </div>
  </template>
}
