import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import onClickOutside from '../modifiers/on-click-outside';

export default class PlaceListsManager extends Component {
  @service storage;
  @service router;
  @tracked _forceClear = false;

  get isSaved() {
    return this.args.isSaved;
  }

  get placeListIds() {
    if (this._forceClear) return [];
    return this.args.place._listIds || [];
  }

  styleFor(color) {
    return htmlSafe(`background-color: ${color}`);
  }

  @action
  isInList(list) {
    if (!this.placeListIds) return false;
    return this.placeListIds.includes(list.id);
  }

  @action
  async toggleSaved() {
    if (this.isSaved) {
      const { osmId, osmType } = this.args.place;

      await this.storage.removePlace(this.args.place);

      // Clean up the local object reference immediately to prevent UI flicker
      // or stale state if the transition is delayed/cancelled.
      if (this.args.place) {
        this.args.place.id = null;
        this.args.place.createdAt = null;
        this.args.place._listIds = [];
        this._forceClear = true;
      }

      // Transition immediately to the canonical state
      if (osmId && osmType) {
        // Create a transient copy that looks like a fresh OSM result
        const rawPlace = { ...this.args.place };
        delete rawPlace.id;
        delete rawPlace.createdAt;
        delete rawPlace._listIds;

        // Transition to the place route using the raw object
        // This updates the URL to 'osm:...' and renders immediately
        this.router.transitionTo('place', rawPlace);
      } else {
        // Custom place deleted -> go home
        this.router.transitionTo('index');
      }

      if (this.args.onClose) this.args.onClose();
    } else {
      await this.storage.storePlace(this.args.place);
    }
  }

  @action
  async toggleList(list) {
    const isMember = this.placeListIds.includes(list.id);
    const shouldAdd = !isMember;

    if (shouldAdd && !this.isSaved) {
      // Auto-save if adding to list
      await this.storage.storePlace(this.args.place);
    }

    try {
      // Toggle membership
      // We must pass the SAVED place (with ID) to the toggle function
      // If we just saved it above, the args.place might still be the old object reference unless storage updates it in-place?
      // StorageService.storePlace returns the new object.
      // But togglePlaceList handles saving internally if ID is missing.

      // Let's rely on storage.togglePlaceList to handle the "save if needed" part.
      await this.storage.togglePlaceList(this.args.place, list.id, shouldAdd);
    } catch (e) {
      console.error(e);
      alert('Failed to update list: ' + e.message);
    }
  }

  <template>
    <div class="place-lists-manager" {{onClickOutside @onClose}}>
      <div class="list-item master-toggle">
        <label>
          <input
            type="checkbox"
            checked={{this.isSaved}}
            {{on "change" this.toggleSaved}}
          />
          <span class="list-color"></span>
          <span class="list-name">Saved places</span>
        </label>
      </div>

      <div class="divider"></div>

      <div class="lists-container">
        {{#each this.storage.lists as |list|}}
          <div class="list-item">
            <label>
              <input
                type="checkbox"
                checked={{this.isInList list}}
                {{on "change" (fn this.toggleList list)}}
                disabled={{unless this.isSaved true}}
              />
              {{! template-lint-disable no-inline-styles }}
              <span
                class="list-color"
                style={{this.styleFor list.color}}
              ></span>
              <span class="list-name">{{list.title}}</span>
            </label>
          </div>
        {{/each}}
      </div>
    </div>
  </template>
}
