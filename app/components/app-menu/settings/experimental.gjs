import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { fn } from '@ember/helper';
import Icon from '#components/icon';

export default class AppMenuSettingsExperimental extends Component {
  @service settings;

  <template>
    {{! template-lint-disable no-nested-interactive }}
    <details>
      <summary>
        <Icon @name="alert-triangle" @size={{20}} />
        <span>Experimental</span>
      </summary>
      <div class="details-content form-layout">
        <div class="form-group">
          <label for="experimental-enable-photo-deletion">Enable photo deletion
            (own photos)</label>
          <select
            id="experimental-enable-photo-deletion"
            class="form-control"
            {{on "change" (fn @onChange "experimentalEnablePhotoDeletion")}}
          >
            <option
              value="true"
              selected={{if
                this.settings.experimentalEnablePhotoDeletion
                "selected"
              }}
            >
              On
            </option>
            <option
              value="false"
              selected={{unless
                this.settings.experimentalEnablePhotoDeletion
                "selected"
              }}
            >
              Off
            </option>
          </select>
        </div>
      </div>
    </details>
  </template>
}
