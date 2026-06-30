import Component from '@glimmer/component';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';

export default class PlaceTemplate extends Component {
  @service router;
  @service storage;
  @service mapUi;

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
    // 1. Resolve the ID from the model (OSM ID or internal ID)
    const model = this.args.model;
    const id = model.osmId || model.id;

    // 2. Check the storage service for a LIVE version of this bookmark
    // This is the most critical fix: Storage is the source of truth.
    // Since `this.storage.savedPlaces` is @tracked, this getter will re-compute
    // whenever a bookmark is added or removed.
    const saved = this.storage.findPlaceById(id);
    if (saved) {
      return saved;
    }

    // 3. If not saved, check our local "optimistic" state (from handleUpdate)
    // This handles the "unsaved" state immediately after deletion before any other sync
    if (
      this.localPlace &&
      (this.localPlace.osmId === id || this.localPlace.id === id)
    ) {
      return this.localPlace;
    }

    // 4. Fallback to the route model (which might be the stale "saved" object from when the route loaded)
    // If the model *has* a createdAt but we didn't find it in step 2 (storage),
    // it means it was deleted. We must return a sanitized version.
    if (model.createdAt) {
      return {
        ...model,
        id: undefined,
        createdAt: undefined,
        geohash: undefined,
      };
    }

    return model;
  }

  @action
  handleUpdate(newPlace) {
    console.debug('Updating local place state:', newPlace);
    this.localPlace = newPlace;
    this.storage.notifyChange();
  }

  @action
  refreshMap() {
    this.storage.notifyChange();
  }

  @action
  navigateBack(place) {
    // The sidebar calls this with null when "Back" is clicked.
    if (place === null) {
      // If we have an active route context (e.g. lists), return to it
      if (this.mapUi.returnToRoute) {
        this.mapUi.showSidebar();
        const { name, model } = this.mapUi.returnToRoute;
        this.router.transitionTo(name, model);
      }
      // If we have an active search context, return to it (UP navigation)
      else if (this.mapUi.returnToSearch && this.mapUi.currentSearch) {
        this.mapUi.showSidebar();
        this.router.transitionTo('search', {
          queryParams: this.mapUi.currentSearch,
        });
      } else {
        // Otherwise just close the sidebar (return to map index)
        this.router.transitionTo('index');
      }
    } else {
      // If a place is selected (unlikely in this view, but possible if we add related links)
      this.mapUi.showSidebar();
      this.router.transitionTo('place', place);
    }
  }

  @action
  close() {
    this.mapUi.clearSelection();
    this.mapUi.hideSidebar();
  }

  <template>
    {{#if this.mapUi.isSidebarVisible}}
      <PlacesSidebar
        @selectedPlace={{this.place}}
        @onClose={{this.close}}
        @onSelect={{this.navigateBack}}
        @onBookmarkChange={{this.refreshMap}}
        @onUpdate={{this.handleUpdate}}
      />
    {{/if}}
  </template>
}
