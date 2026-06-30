import Component from '@glimmer/component';
import AppMenu from '#components/app-menu/index';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class MenuTemplate extends Component {
  @service router;

  @action
  close() {
    this.router.transitionTo('index');
  }

  <template><AppMenu @onClose={{this.close}} /></template>
}
