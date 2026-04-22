import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { fn } from '@ember/helper';
import Icon from '#components/icon';

export default class AppMenuSettingsMapUi extends Component {
  @service settings;

  <template>
    {{! template-lint-disable no-nested-interactive }}
    <details>
      <summary>
        <Icon @name="map" @size={{20}} />
        <span>Map & UI</span>
      </summary>
      <div class="details-content">
        <div class="form-group">
          <label for="show-quick-search">Quick search buttons visible</label>
          <select
            id="show-quick-search"
            class="form-control"
            {{on "change" (fn @onChange "showQuickSearchButtons")}}
          >
            <option
              value="true"
              selected={{if this.settings.showQuickSearchButtons "selected"}}
            >
              Yes
            </option>
            <option
              value="false"
              selected={{unless
                this.settings.showQuickSearchButtons
                "selected"
              }}
            >
              No
            </option>
          </select>
        </div>
        <div class="form-group">
          <label for="map-kinetic">Map Inertia (Kinetic Panning)</label>
          <select
            id="map-kinetic"
            class="form-control"
            {{on "change" (fn @onChange "mapKinetic")}}
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
      </div>
    </details>
  </template>
}
