import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { fn } from '@ember/helper';
import eq from 'ember-truth-helpers/helpers/eq';
import Icon from '#components/icon';
import {
  excludeRequiredRelays,
  mergeRequiredRelays,
  normalizeRelayUrl,
  uniqNormalizedRelays,
} from '../../../utils/nostr';
import { DEFAULT_BLOSSOM_SERVER } from '../../../services/blossom';
import tooltip from '../../../modifiers/tooltip';

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

  get trustedRelaySet() {
    return new Set(this.nostrData.trustedRelays.filter(Boolean));
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
        isTrusted: this.trustedRelaySet.has(url),
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

  get mediaServerOptions() {
    const servers = this.nostrData.blossomServers;
    return servers.length ? servers : [DEFAULT_BLOSSOM_SERVER];
  }

  get hasMultipleMediaServers() {
    return this.mediaServerOptions.length > 1;
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
  toggleRelayTrust(url) {
    const normalized = normalizeRelayUrl(url);
    if (!normalized) return;
    // Required relays are always trusted and cannot be untrusted.
    if (this.requiredReadRelaySet.has(normalized)) return;

    const current = uniqNormalizedRelays(
      this.settings.nostrTrustedRelays || []
    );
    const idx = current.indexOf(normalized);
    let next;
    if (idx >= 0) {
      next = current.filter((r) => r !== normalized);
    } else {
      next = [...current, normalized];
    }
    this.settings.update('nostrTrustedRelays', next.length > 0 ? next : null);
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
    {{! template-lint-disable no-nested-interactive no-unsupported-role-attributes }}
    <details>
      <summary>
        <Icon @name="zap" @size={{20}} />
        <span>Nostr</span>
      </summary>
      <div class="details-content form-layout">
        <div class="form-group">
          <label for="new-read-relay">Read Relays</label>
          <p class="relay-list-hint">
            Mark relays as trusted to show
            <strong>all</strong>
            photos and reviews from them by default (risk of spam).
          </p>
          <ul class="relay-list">
            {{#each this.readRelaysForDisplay as |relay|}}
              <li>
                <span>{{stripProtocol relay.url}}</span>
                <div class="relay-actions">
                  <button
                    type="button"
                    class="btn-trust-relay {{if relay.isTrusted 'is-trusted'}}"
                    aria-label="Toggle trust"
                    aria-description={{if
                      relay.isRequired
                      "Required relay — always trusted"
                      (if
                        relay.isTrusted
                        "Trusted: show all content from this relay"
                        "Untrusted: hide content from outside of my circles"
                      )
                    }}
                    disabled={{relay.isRequired}}
                    {{tooltip}}
                    {{on "click" (fn this.toggleRelayTrust relay.url)}}
                  >
                    <Icon
                      @name="shield"
                      @size={{14}}
                      @color="currentColor"
                      @filled={{relay.isTrusted}}
                    />
                  </button>
                  <button
                    type="button"
                    class="btn-remove-relay"
                    aria-label="Remove"
                    aria-description={{if
                      relay.isRequired
                      "Required relays cannot be removed"
                      "Remove relay"
                    }}
                    disabled={{relay.isRequired}}
                    {{tooltip}}
                    {{on "click" (fn this.removeReadRelay relay.url)}}
                  >
                    <Icon @name="x" @size={{14}} @color="currentColor" />
                  </button>
                </div>
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
                <div class="relay-actions">
                  <button
                    type="button"
                    class="btn-remove-relay"
                    aria-label="Remove"
                    aria-description={{if
                      relay.isRequired
                      "Required relays cannot be removed"
                      "Remove relay"
                    }}
                    disabled={{relay.isRequired}}
                    {{tooltip}}
                    {{on "click" (fn this.removeWriteRelay relay.url)}}
                  >
                    <Icon @name="x" @size={{14}} @color="currentColor" />
                  </button>
                </div>
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
          <label for="nostr-media-server">Media server</label>
          <select
            id="nostr-media-server"
            class="form-control"
            {{on "change" (fn @onChange "nostrMediaServer")}}
          >
            {{#each this.mediaServerOptions as |server|}}
              <option
                value={{server}}
                selected={{if
                  (eq server this.settings.nostrMediaServer)
                  "selected"
                }}
              >
                {{server}}
              </option>
            {{/each}}
          </select>
        </div>

        {{#if this.hasMultipleMediaServers}}
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
                selected={{if
                  this.settings.nostrPhotoFallbackUploads
                  "selected"
                }}
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
        {{/if}}

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
