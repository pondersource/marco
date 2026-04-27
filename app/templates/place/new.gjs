import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import PlaceEditForm from '#components/place-edit-form';
import Icon from '#components/icon';

export default class PlaceNewTemplate extends Component {
  @service router;
  @service storage;
  @service mapUi;

  get initialPlace() {
    return {
      title: '',
      description: '',
    };
  }

  @action
  close() {
    this.router.transitionTo('index');
  }

  @action
  async savePlace(changes) {
    try {
      // Use coordinates from Map UI (which tracks the crosshair center)
      // Fallback to URL params if map state isn't ready
      const center = this.mapUi.creationCoordinates || {
        lat: this.args.model.lat,
        lon: this.args.model.lon,
      };

      const lat = parseFloat(center.lat.toFixed(6));
      const lon = parseFloat(center.lon.toFixed(6));

      const placeData = {
        title: changes.title || 'Untitled Place',
        description: changes.description,
        lat: lat,
        lon: lon,
        tags: [],
        osmTags: {},
      };

      const savedPlace = await this.storage.storePlace(placeData);
      console.debug('Created private place:', savedPlace.title);

      // Transition to the new place
      this.router.replaceWith('place', savedPlace);
    } catch (e) {
      console.error('Failed to create place:', e);
      alert('Failed to create place: ' + e.message);
    }
  }

  <template>
    {{#if this.mapUi.isSidebarVisible}}
      <div class="sidebar">
        <div class="sidebar-header">
          <h2><Icon @name="plus-circle" @size={{20}} @color="#ea4335" />
            New Place</h2>
          <button
            type="button"
            class="close-btn"
            {{on "click" this.close}}
          ><Icon @name="x" @size={{20}} @color="#333" /></button>
        </div>

        <div class="sidebar-content">
          <p class="helper-text">
            Drag the map to position the crosshair.
          </p>

          <PlaceEditForm
            @place={{this.initialPlace}}
            @onSave={{this.savePlace}}
            @onCancel={{this.close}}
          />
        </div>
      </div>
    {{/if}}
  </template>
}
