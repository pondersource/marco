import Component from '@glimmer/component';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import config from 'marco/config/environment';
import Icon from './icon';

const ModalContent = <template>
  <div class="modal-overlay" role="dialog" tabindex="-1" {{on "click" @close}}>
    <div
      class="modal-content"
      role="document"
      tabindex="0"
      {{on "click" @stopProp}}
    >
      <button
        type="button"
        class="close-modal-btn btn-text {{if @disableClose 'disabled'}}"
        disabled={{@disableClose}}
        {{on "click" @close}}
      >
        <Icon @name="x" @size={{24}} @color="currentColor" />
      </button>
      {{yield}}
    </div>
  </div>
</template>;

export default class Modal extends Component {
  get isTesting() {
    return config.environment === 'test';
  }

  get destinationElement() {
    return document.getElementById('modal-portal') || document.body;
  }

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
    {{#if this.isTesting}}
      <ModalContent
        @close={{this.close}}
        @stopProp={{this.stopProp}}
        @disableClose={{@disableClose}}
      >
        {{yield}}
      </ModalContent>
    {{else}}
      {{#in-element this.destinationElement}}
        <ModalContent
          @close={{this.close}}
          @stopProp={{this.stopProp}}
          @disableClose={{@disableClose}}
        >
          {{yield}}
        </ModalContent>
      {{/in-element}}
    {{/if}}
  </template>
}
