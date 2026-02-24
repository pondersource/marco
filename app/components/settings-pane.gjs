import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { action } from '@ember/object';
import Icon from '#components/icon';
import eq from 'ember-truth-helpers/helpers/eq';
import not from 'ember-truth-helpers/helpers/not';

export default class SettingsPane extends Component {
  @service settings;

  @action
  updateApi(event) {
    this.settings.updateOverpassApi(event.target.value);
  }

  @action
  toggleKinetic(event) {
    this.settings.updateMapKinetic(event.target.value === 'true');
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
          <div class="form-group">
            <label for="map-kinetic">Map Inertia (Kinetic Panning)</label>
            <select
              id="map-kinetic"
              class="form-control"
              {{on "change" this.toggleKinetic}}
            >
              <option
                value="true"
                selected={{if this.settings.mapKinetic "selected"}}
              >
                On
              </option>
              <option
                value="false"
                selected={{unless this.settings.mapKinetic "selected"}}
              >
                Off
              </option>
            </select>
          </div>
          <div class="form-group">
            <label for="overpass-api">Overpass API Provider</label>
            <select
              id="overpass-api"
              class="form-control"
              {{on "change" this.updateApi}}
            >
              {{#each this.settings.overpassApis as |api|}}
                <option
                  value={{api.url}}
                  selected={{if
                    (eq api.url this.settings.overpassApi)
                    "selected"
                  }}
                >
                  {{api.name}}
                </option>
              {{/each}}
            </select>
          </div>
        </section>
        <section class="settings-section">
          <h3>About</h3>
          <p>
            <strong>Marco</strong>
            (as in
            <a
              href="https://en.wikipedia.org/wiki/Marco_Polo"
              target="_blank"
              rel="noopener"
            >Marco Polo</a>) is an unhosted maps application that respects your
            privacy and choices.
          </p>
          <p>
            Connect your own
            <a
              href="https://remotestorage.io/"
              target="_blank"
              rel="noopener"
            >remote storage</a>
            to sync place bookmarks across apps and devices.
          </p>
          <ul class="link-list">
            <li>
              <a
                href="https://gitea.kosmos.org/raucao/marco"
                target="_blank"
                rel="noopener"
              >
                Source Code
              </a>
              (<a
                href="https://en.wikipedia.org/wiki/GNU_Affero_General_Public_License"
                target="_blank"
                rel="noopener"
              >AGPL</a>)
            </li>
            <li>
              <a
                href="https://openstreetmap.org/copyright"
                target="_blank"
                rel="noopener"
              >
                Map Data © OpenStreetMap
              </a>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </template>
}
