import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { fn } from '@ember/helper';
import Icon from '#components/icon';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  normalizeRelayUrl,
} from '../../../utils/nostr';

const stripProtocol = (url) => (url ? url.replace(/^wss?:\/\//, '') : '');

export default class AppMenuSettingsNostr extends Component {
  @service settings;
  @service nostrData;
  @service toast;

  @tracked newReadRelay = '';
  @tracked newWriteRelay = '';

  get customReadRelays() {
    return excludeRequiredRelays(
      this.settings.nostrReadRelays || [],
      this.nostrData.requiredReadRelays
    );
  }

  get customWriteRelays() {
    return excludeRequiredRelays(
      this.settings.nostrWriteRelays || [],
      this.nostrData.requiredWriteRelays
    );
  }

  get readRelayExclusions() {
    return this.settings.nostrReadRelayExclusions || [];
  }

  get writeRelayExclusions() {
    return this.settings.nostrWriteRelayExclusions || [];
  }

  get requiredReadRelaySet() {
    return new Set(this.nostrData.requiredReadRelays.filter(Boolean));
  }

  get requiredWriteRelaySet() {
    return new Set(this.nostrData.requiredWriteRelays.filter(Boolean));
  }

  get mailboxReadRelaySet() {
    return new Set(this.nostrData.mailboxReadRelays);
  }

  get mailboxWriteRelaySet() {
    return new Set(this.nostrData.mailboxWriteRelays);
  }

  get hasReadOverrides() {
    return (
      this.customReadRelays.length > 0 || this.readRelayExclusions.length > 0
    );
  }

  get hasWriteOverrides() {
    return (
      this.customWriteRelays.length > 0 || this.writeRelayExclusions.length > 0
    );
  }

  get readRelaysForDisplay() {
    return this.nostrData.activeReadRelays.map((url) => {
      return {
        url,
        isRequired: this.requiredReadRelaySet.has(url),
      };
    });
  }

  get writeRelaysForDisplay() {
    return this.nostrData.activeWriteRelays.map((url) => {
      return {
        url,
        isRequired: this.requiredWriteRelaySet.has(url),
      };
    });
  }

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

    const merged = mergeRequiredRelays(this.nostrData.requiredReadRelays, [
      ...this.customReadRelays,
      url,
    ]);
    const custom = excludeRequiredRelays(
      merged,
      this.nostrData.requiredReadRelays
    );

    const readExclusions = this.readRelayExclusions.filter((relay) => {
      return normalizeRelayUrl(relay) !== url;
    });

    this.settings.update('nostrReadRelays', custom.length > 0 ? custom : null);
    this.settings.update(
      'nostrReadRelayExclusions',
      readExclusions.length > 0 ? readExclusions : null
    );
    this.newReadRelay = '';
  }

  @action
  removeReadRelay(url) {
    if (this.requiredReadRelaySet.has(url)) {
      return;
    }

    const normalizedUrl = normalizeRelayUrl(url);

    const remainingCustom = this.customReadRelays.filter((relay) => {
      return normalizeRelayUrl(relay) !== normalizedUrl;
    });

    const nextExclusions = this.mailboxReadRelaySet.has(normalizedUrl)
      ? Array.from(new Set([...this.readRelayExclusions, normalizedUrl]))
      : this.readRelayExclusions;

    this.settings.update(
      'nostrReadRelays',
      remainingCustom.length > 0 ? remainingCustom : null
    );
    this.settings.update(
      'nostrReadRelayExclusions',
      nextExclusions.length > 0 ? nextExclusions : null
    );
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
    this.settings.update('nostrReadRelayExclusions', null);
  }

  @action
  addWriteRelay() {
    const url = normalizeRelayUrl(this.newWriteRelay);
    if (!url) return;

    const merged = mergeRequiredRelays(this.nostrData.requiredWriteRelays, [
      ...this.customWriteRelays,
      url,
    ]);
    const custom = excludeRequiredRelays(
      merged,
      this.nostrData.requiredWriteRelays
    );

    const writeExclusions = this.writeRelayExclusions.filter((relay) => {
      return normalizeRelayUrl(relay) !== url;
    });

    this.settings.update('nostrWriteRelays', custom.length > 0 ? custom : null);
    this.settings.update(
      'nostrWriteRelayExclusions',
      writeExclusions.length > 0 ? writeExclusions : null
    );
    this.newWriteRelay = '';
  }

  @action
  removeWriteRelay(url) {
    if (this.requiredWriteRelaySet.has(url)) {
      return;
    }

    const normalizedUrl = normalizeRelayUrl(url);

    const remainingCustom = this.customWriteRelays.filter((relay) => {
      return normalizeRelayUrl(relay) !== normalizedUrl;
    });

    const nextExclusions = this.mailboxWriteRelaySet.has(normalizedUrl)
      ? Array.from(new Set([...this.writeRelayExclusions, normalizedUrl]))
      : this.writeRelayExclusions;

    this.settings.update(
      'nostrWriteRelays',
      remainingCustom.length > 0 ? remainingCustom : null
    );
    this.settings.update(
      'nostrWriteRelayExclusions',
      nextExclusions.length > 0 ? nextExclusions : null
    );
  }

  @action
  resetWriteRelays() {
    this.settings.update('nostrWriteRelays', null);
    this.settings.update('nostrWriteRelayExclusions', null);
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
            {{#each this.readRelaysForDisplay as |relay|}}
              <li>
                <span>{{stripProtocol relay.url}}</span>
                {{#unless relay.isRequired}}
                  <button
                    type="button"
                    class="btn-remove-relay"
                    title="Remove relay"
                    aria-label="Remove"
                    {{on "click" (fn this.removeReadRelay relay.url)}}
                  >
                    <Icon @name="x" @size={{14}} @color="currentColor" />
                  </button>
                {{/unless}}
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
          {{#if this.hasReadOverrides}}
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
            {{#each this.writeRelaysForDisplay as |relay|}}
              <li>
                <span>{{stripProtocol relay.url}}</span>
                {{#unless relay.isRequired}}
                  <button
                    type="button"
                    class="btn-remove-relay"
                    title="Remove relay"
                    aria-label="Remove"
                    {{on "click" (fn this.removeWriteRelay relay.url)}}
                  >
                    <Icon @name="x" @size={{14}} @color="currentColor" />
                  </button>
                {{/unless}}
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
          {{#if this.hasWriteOverrides}}
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
