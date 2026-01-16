import Component from '@glimmer/component';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class PlaceTemplate extends Component {
  @service router;
  @service storage;

  @tracked localPlace = null;

  constructor() {
    super(...arguments);
    this.localPlace = this.args.model;
  }

  // Update local place if model changes (e.g. navigation)
  // We can use a getter or an effect, but in GJS a getter is easiest if we don't need manual overrides often.
  // But we DO need to override it when saving.

  // Actually, we can just use a derived state that prefers the local override?
  // Let's use a modifier or just sync it.

  get place() {
    // If we have a manually updated place (from save), use it.
    // Otherwise use the route model.
    // We need to ensure we reset `localPlace` when navigating to a NEW place.
    // Comparing IDs is a safe bet.

    const model = this.args.model;
    if (
      this.localPlace &&
      (this.localPlace.id === model.id || this.localPlace.osmId === model.osmId)
    ) {
      // If the local place is "richer" (has createdAt), prefer it.
      if (this.localPlace.createdAt && !model.createdAt) return this.localPlace;
      // If we deleted it (local has no createdAt, model might?) - wait, if we delete, we close sidebar.
    }
    return model;
  }

  @action
  handleUpdate(newPlace) {
    console.log('Updating local place state:', newPlace);
    this.localPlace = newPlace;
    this.storage.notifyChange();
  }

  @action
  refreshMap() {
    this.storage.notifyChange();
  }

  @action
  close() {
    this.router.transitionTo('index');
  }

  <template>
    <PlacesSidebar
      @selectedPlace={{this.place}}
      @onClose={{this.close}}
      @onBookmarkChange={{this.refreshMap}}
      @onUpdate={{this.handleUpdate}}
    />
  </template>
}
