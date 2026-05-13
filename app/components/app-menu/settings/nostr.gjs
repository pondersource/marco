import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { fn } from '@ember/helper';
import Icon from '#components/icon';
import { normalizeRelayUrl } from '../../../utils/nostr';

const stripProtocol = (url) => (url ? url.replace(/^wss?:\/\//, '') : '');

export default class AppMenuSettingsNostr extends Component {
  @service settings;
  @service nostrData;
  @service toast;

  @tracked newReadRelay = '';
  @tracked newWriteRelay = '';

  @action
  updateNewReadRelay(event) {
    this.newReadRelay = event.target.value;
  }

  @action
  updateNewWriteRelay(event) {
    this.newWriteRelay = event.target.value;
  }

  @action
  addReadRelay() {
    const url = normalizeRelayUrl(this.newReadRelay);
    if (!url) return;

    const current =
      this.settings.nostrReadRelays || this.nostrData.defaultReadRelays;
    const set = new Set([...current, url]);
    this.settings.update('nostrReadRelays', Array.from(set));
    this.newReadRelay = '';
  }

  @action
  removeReadRelay(url) {
    const current =
      this.settings.nostrReadRelays || this.nostrData.defaultReadRelays;
    const filtered = current.filter((r) => r !== url);
    this.settings.update('nostrReadRelays', filtered);
  }

  @action
  handleReadRelayKeydown(event) {
    if (event.key === 'Enter') {
      this.addReadRelay();
    }
  }

  @action
  handleWriteRelayKeydown(event) {
    if (event.key === 'Enter') {
      this.addWriteRelay();
    }
  }

  @action
  resetReadRelays() {
    this.settings.update('nostrReadRelays', null);
  }

  @action
  addWriteRelay() {
    const url = normalizeRelayUrl(this.newWriteRelay);
    if (!url) return;

    const current =
      this.settings.nostrWriteRelays || this.nostrData.defaultWriteRelays;
    const set = new Set([...current, url]);
    this.settings.update('nostrWriteRelays', Array.from(set));
    this.newWriteRelay = '';
  }

  @action
  removeWriteRelay(url) {
    const current =
      this.settings.nostrWriteRelays || this.nostrData.defaultWriteRelays;
    const filtered = current.filter((r) => r !== url);
    this.settings.update('nostrWriteRelays', filtered);
  }

  @action
  resetWriteRelays() {
    this.settings.update('nostrWriteRelays', null);
  }

  @action
  async clearCache() {
    try {
      await this.nostrData.clearCache();
      this.toast.show('Nostr cache cleared');
    } catch (e) {
      this.toast.show(`Failed to clear Nostr cache: ${e.message}`);
    }
  }

  <template>
    {{! template-lint-disable no-nested-interactive }}
    <details>
      <summary>
        <Icon @name="zap" @size={{20}} />
        <span>Nostr</span>
      </summary>
      <div class="details-content form-layout">
        <div class="form-group">
          <label for="new-read-relay">Read Relays</label>
          <ul class="relay-list">
            {{#each this.nostrData.activeReadRelays as |relay|}}
              <li>
                <span>{{stripProtocol relay}}</span>
                <button
                  type="button"
                  class="btn-remove-relay"
                  title="Remove relay"
                  aria-label="Remove"
                  {{on "click" (fn this.removeReadRelay relay)}}
                >
                  <Icon @name="x" @size={{14}} @color="currentColor" />
                </button>
              </li>
            {{/each}}
          </ul>
          <div class="add-relay-input">
            <input
              id="new-read-relay"
              type="text"
              class="form-control"
              placeholder="relay.example.com"
              value={{this.newReadRelay}}
              {{on "input" this.updateNewReadRelay}}
              {{on "keydown" this.handleReadRelayKeydown}}
            />
            <button
              type="button"
              class="btn btn-secondary"
              {{on "click" this.addReadRelay}}
            >Add</button>
          </div>
          {{#if this.settings.nostrReadRelays}}
            <button
              type="button"
              class="btn-link reset-relays"
              {{on "click" this.resetReadRelays}}
            >
              Reset to Defaults
            </button>
          {{/if}}
        </div>

        <div class="form-group">
          <label for="new-write-relay">Write Relays</label>
          <ul class="relay-list">
            {{#each this.nostrData.activeWriteRelays as |relay|}}
              <li>
                <span>{{stripProtocol relay}}</span>
                <button
                  type="button"
                  class="btn-remove-relay"
                  title="Remove relay"
                  aria-label="Remove"
                  {{on "click" (fn this.removeWriteRelay relay)}}
                >
                  <Icon @name="x" @size={{14}} @color="currentColor" />
                </button>
              </li>
            {{/each}}
          </ul>
          <div class="add-relay-input">
            <input
              id="new-write-relay"
              type="text"
              class="form-control"
              placeholder="relay.example.com"
              value={{this.newWriteRelay}}
              {{on "input" this.updateNewWriteRelay}}
              {{on "keydown" this.handleWriteRelayKeydown}}
            />
            <button
              type="button"
              class="btn btn-secondary"
              {{on "click" this.addWriteRelay}}
            >Add</button>
          </div>
          {{#if this.settings.nostrWriteRelays}}
            <button
              type="button"
              class="btn-link reset-relays"
              {{on "click" this.resetWriteRelays}}
            >
              Reset to Defaults
            </button>
          {{/if}}
        </div>

        <div class="form-group">
          <label for="nostr-photo-fallback-uploads">Upload photos to fallback
            servers</label>
          <select
            id="nostr-photo-fallback-uploads"
            class="form-control"
            {{on "change" (fn @onChange "nostrPhotoFallbackUploads")}}
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

        <div class="form-group">
          <label>Cached data</label>
          <button
            type="button"
            class="btn btn-outline btn-full"
            {{on "click" this.clearCache}}
          >
            <Icon @name="database" @size={{18}} @color="var(--danger-color)" />
            Clear profiles, photos, and reviews
          </button>
        </div>
      </div>
    </details>
  </template>
}
