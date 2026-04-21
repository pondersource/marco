import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { action } from '@ember/object';
import Icon from '#components/icon';

export default class AppMenuSettingsNostr extends Component {
  @service settings;

  @action
  togglePhotoFallbackUploads(event) {
    this.settings.updateNostrPhotoFallbackUploads(
      event.target.value === 'true'
    );
  }

  <template>
    {{! template-lint-disable no-nested-interactive }}
    <details>
      <summary>
        <Icon @name="zap" @size={{20}} />
        <span>Nostr</span>
      </summary>
      <div class="details-content">
        <div class="form-group">
          <label for="nostr-photo-fallback-uploads">Upload photos to fallback
            servers</label>
          <select
            id="nostr-photo-fallback-uploads"
            class="form-control"
            {{on "change" this.togglePhotoFallbackUploads}}
          >
            <option
              value="true"
              selected={{if this.settings.nostrPhotoFallbackUploads "selected"}}
            >
              Yes
            </option>
            <option
              value="false"
              selected={{unless
                this.settings.nostrPhotoFallbackUploads
                "selected"
              }}
            >
              No
            </option>
          </select>
        </div>
      </div>
    </details>
  </template>
}
