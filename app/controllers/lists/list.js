import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { tracked } from '@glimmer/tracking';
import { task } from 'ember-concurrency';

function getPlaceTime(place) {
  const dateVal = place.createdAt;
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') {
    return dateVal;
  }
  const parsed = Date.parse(dateVal);
  return isNaN(parsed) ? 0 : parsed;
}

const SAVED_LIST_ID = 'saved';

export default class ListsListController extends Controller {
  @service router;
  @service mapUi;
  @service storage;

  @tracked model;
  @tracked loadedPlaces = [];
  @tracked loadedListId = null;

  get listId() {
    return this.model?.list_id;
  }

  get isLoading() {
    // Only show the spinner when there is nothing to display yet. On re-entry
    // the previously loaded places (plus live storage state) render instantly,
    // so we avoid a loading flash and preserve restored scroll position.
    return this.loadPlacesTask.isRunning && this.places.length === 0;
  }

  loadPlacesTask = task({ restartable: true }, async (listId) => {
    // Already loaded this list: keep the existing places so returning from
    // place details is instant (mirrors the activity service's load guard).
    if (this.loadedListId === listId) {
      return;
    }

    this.loadedListId = listId;
    this.loadedPlaces = []; // Clear previous elements immediately to show fresh loader
    try {
      this.loadedPlaces = await this.storage.getPlacesInList(listId);
    } catch (e) {
      console.error('Failed to load places in list', listId, e);
      this.loadedPlaces = [];
      this.loadedListId = null; // Allow a retry on next entry
    }
  });

  get scrollTop() {
    return this.mapUi.getScrollPosition(`list-${this.listId}`);
  }

  get listColor() {
    if (this.listId === SAVED_LIST_ID) {
      return getComputedStyle(document.documentElement)
        .getPropertyValue('--default-list-color')
        .trim();
    }

    const list = this.storage.lists.find((l) => l.id === this.listId);
    if (list && list.color) {
      return list.color;
    }
    return getComputedStyle(document.documentElement)
      .getPropertyValue('--default-list-color')
      .trim();
  }

  get listTitle() {
    if (this.listId === SAVED_LIST_ID) {
      return 'Saved Places';
    }

    const list = this.storage.lists.find((l) => l.id === this.listId);
    return list ? list.title : 'Collections';
  }

  get places() {
    if (this.listId === SAVED_LIST_ID) {
      return [...this.storage.savedPlaces].sort(
        (a, b) => getPlaceTime(b) - getPlaceTime(a)
      );
    }

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

    // Supplement with any background-fetched places that are still valid but not in live state yet
    this.loadedPlaces.forEach((p) => {
      if (placeRefsIds.has(p.id) && !seen.has(p.id)) {
        merged.push(p);
        seen.add(p.id);
      }
    });

    return merged.sort((a, b) => getPlaceTime(b) - getPlaceTime(a));
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
}
