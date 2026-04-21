import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { action } from '@ember/object';
import Icon from '#components/icon';
import eq from 'ember-truth-helpers/helpers/eq';

export default class AppMenuSettingsApis extends Component {
  @service settings;

  @action
  updateApi(event) {
    this.settings.updateOverpassApi(event.target.value);
  }

  @action
  updatePhotonApi(event) {
    this.settings.updatePhotonApi(event.target.value);
  }

  <template>
    {{! template-lint-disable no-nested-interactive }}
    <details>
      <summary>
        <Icon @name="server" @size={{20}} />
        <span>API Providers</span>
      </summary>
      <div class="details-content">
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
        <div class="form-group">
          <label for="photon-api">Photon API Provider</label>
          <select
            id="photon-api"
            class="form-control"
            {{on "change" this.updatePhotonApi}}
          >
            {{#each this.settings.photonApis as |api|}}
              <option
                value={{api.url}}
                selected={{if (eq api.url this.settings.photonApi) "selected"}}
              >
                {{api.name}}
              </option>
            {{/each}}
          </select>
        </div>
      </div>
    </details>
  </template>
}
