import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { service } from '@ember/service';
import Icon from '#components/icon';
import AppMenuSettingsMapUi from './settings/map-ui';
import AppMenuSettingsApis from './settings/apis';
import AppMenuSettingsNostr from './settings/nostr';
import AppMenuSettingsExperimental from './settings/experimental';

export default class AppMenuSettings extends Component {
  @service settings;

  @action
  updateSetting(key, event) {
    let value = event.target.value;
    if (value === 'true') value = true;
    if (value === 'false') value = false;

    this.settings.update(key, value);
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
        <AppMenuSettingsMapUi @onChange={{this.updateSetting}} />
        <AppMenuSettingsApis @onChange={{this.updateSetting}} />
        <AppMenuSettingsNostr @onChange={{this.updateSetting}} />
        <AppMenuSettingsExperimental @onChange={{this.updateSetting}} />
      </section>
    </div>
  </template>
}
