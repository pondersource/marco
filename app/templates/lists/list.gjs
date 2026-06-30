import Component from '@glimmer/component';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class ListsListTemplate extends Component {
  @service router;
  @service mapUi;
  @service storage;

  get listId() {
    return this.args.model?.listId;
  }

  get scrollTop() {
    return this.mapUi.getScrollPosition(`list-${this.listId}`);
  }

  get listColor() {
    const list = this.storage.lists.find((l) => l.id === this.listId);
    if (list && list.color) {
      return list.color;
    }
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--default-list-color')
      .trim();
  }

  get listTitle() {
    const list = this.storage.lists.find((l) => l.id === this.listId);
    return list ? list.title : 'Collections';
  }

  get places() {
    const modelPlaces = this.args.model?.places || [];
    const currentList = this.storage.lists.find((l) => l.id === this.listId);
    const placeRefsIds = new Set(
      currentList?.placeRefs?.map((ref) => ref.id) || []
    );

    // Filter live tracked savedPlaces that are in this list
    const livePlaces = this.storage.savedPlaces.filter((p) =>
      placeRefsIds.has(p.id)
    );

    const merged = [];
    const seen = new Set();

    // Process live state first to reflect deletions/edits immediately
    livePlaces.forEach((p) => {
      merged.push(p);
      seen.add(p.id);
    });

    // Supplement with any model-fetched places that are still valid but not in live state yet
    modelPlaces.forEach((p) => {
      if (placeRefsIds.has(p.id) && !seen.has(p.id)) {
        merged.push(p);
        seen.add(p.id);
      }
    });

    return merged;
  }

  @action
  selectPlace(place) {
    if (place) {
      const sidebarContent = document.querySelector('.sidebar-content');
      if (sidebarContent) {
        this.mapUi.saveScrollPosition(
          `list-${this.listId}`,
          sidebarContent.scrollTop
        );
      }
      this.mapUi.returnToRoute = {
        name: 'lists.list',
        model: this.listId,
      };
      this.mapUi.showSidebar();
      this.mapUi.preventNextZoom = true;
      this.router.transitionTo('place', place);
    }
  }

  @action
  close() {
    this.router.transitionTo('index');
  }

  @action
  backToLists() {
    this.router.transitionTo('lists.index');
  }

  <template>
    {{#if this.mapUi.isSidebarVisible}}
      <PlacesSidebar
        @places={{this.places}}
        @title={{this.listTitle}}
        @color={{this.listColor}}
        @scrollTop={{this.scrollTop}}
        @onSelect={{this.selectPlace}}
        @onClose={{this.close}}
        @onBack={{this.backToLists}}
      />
    {{/if}}
  </template>
}
