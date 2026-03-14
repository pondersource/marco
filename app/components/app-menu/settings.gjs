import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { action } from '@ember/object';
import Icon from '#components/icon';
import eq from 'ember-truth-helpers/helpers/eq';

export default class AppMenuSettings extends Component {
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
    <div class="sidebar-header">
      <button type="button" class="back-btn" {{on "click" @onBack}}>
        <Icon @name="arrow-left" @size={{20}} @color="#333" />
      </button>
      <h2>Settings</h2>
      <button type="button" class="close-btn" {{on "click" @onClose}}>
        <Icon @name="x" @size={{20}} @color="#333" />
      </button>
    </div>

    <div class="sidebar-content">
      <section class="settings-section">
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
    </div>
  </template>
}
