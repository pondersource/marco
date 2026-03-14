import Component from '@glimmer/component';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import eq from 'ember-truth-helpers/helpers/eq';

import AppMenuHome from './home';
import AppMenuSettings from './settings';
import AppMenuAbout from './about';

export default class AppMenu extends Component {
  @tracked currentView = 'menu'; // 'menu', 'settings', 'about'

  @action
  setView(view) {
    this.currentView = view;
  }

  <template>
    <div class="sidebar settings-pane">
      {{#if (eq this.currentView "menu")}}
        <AppMenuHome @onNavigate={{this.setView}} @onClose={{@onClose}} />

      {{else if (eq this.currentView "settings")}}
        <AppMenuSettings
          @onBack={{fn this.setView "menu"}}
          @onClose={{@onClose}}
        />

      {{else if (eq this.currentView "about")}}
        <AppMenuAbout
          @onBack={{fn this.setView "menu"}}
          @onClose={{@onClose}}
        />
      {{/if}}
    </div>
  </template>
}
