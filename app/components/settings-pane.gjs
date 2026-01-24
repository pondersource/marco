import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import Icon from '#components/icon';

export default class SettingsPane extends Component {
  constructor() {
    super(...arguments);
  }

  <template>
    <div class="sidebar settings-pane">
      <div class="sidebar-header">
        <h2>Marco</h2>
        <button type="button" class="close-btn" {{on "click" @onClose}}>
          <Icon @name="x" @size={{20}} @color="#333" />
        </button>
      </div>

      <div class="sidebar-content">
        <section class="settings-section">
          <h3>Settings</h3>
        </section>
        <section class="settings-section">
          <h3>About</h3>
          <p>
            <strong>Marco</strong> (as in <a
            href="https://en.wikipedia.org/wiki/Marco_Polo"
            target="_blank" rel="noopener">Marco Polo</a>) is an unhosted maps application
            that respects your privacy and choices.
          </p>
          <p>
            Connect your own <a href="https://remotestorage.io/"
              target="_blank" rel="noopener">remote storage</a> to sync place bookmarks across
            devices.
          </p>
          <ul class="link-list">
            <li>
              <a href="https://gitea.kosmos.org/raucao/marco" target="_blank" rel="noopener">
                Source Code
              </a> (<a href="https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License" target="_blank" rel="noopener">AGPL</a>)
            </li>
            <li>
              <a href="https://openstreetmap.org/copyright" target="_blank" rel="noopener">
                Map Data © OpenStreetMap
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </template>
}
