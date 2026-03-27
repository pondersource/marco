import Component from '@glimmer/component';
import { service } from '@ember/service';

export default class ToastComponent extends Component {
  @service toast;

  <template>
    {{#if this.toast.isVisible}}
      <div class="toast-notification">
        {{this.toast.message}}
      </div>
    {{/if}}
  </template>
}
