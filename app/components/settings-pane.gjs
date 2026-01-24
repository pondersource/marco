import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import Icon from '#components/icon';

export default class SettingsPane extends Component {
  <template>
    <div class="sidebar settings-pane">
      <div class="sidebar-header">
        <h2>Settings</h2>
        <button type="button" class="close-btn" {{on "click" @onClose}}>
          <Icon @name="x" @size={{20}} @color="#333" />
        </button>
      </div>

      <div class="sidebar-content">
        <p>Settings content placeholder...</p>
      </div>
    </div>
  </template>
}
