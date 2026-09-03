import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { task } from 'ember-concurrency';

export default class ActivityController extends Controller {
  @service router;
  @service mapUi;
  @service nostrAuth;
  @service activity;

  loadTask = task({ restartable: true }, async (pubkey) => {
    await this.activity.load(pubkey);
  });

  get scrollTop() {
    return this.mapUi.getScrollPosition('activity');
  }

  get items() {
    return this.activity.items;
  }

  get isLoading() {
    return this.activity.isLoading;
  }

  get isConnected() {
    return this.nostrAuth.isConnected;
  }

  get sourceMode() {
    return this.activity.sourceMode;
  }

  get isLoadingMore() {
    return this.activity.isLoadingMore;
  }

  @action
  setSourceMode(mode) {
    this.activity.setSourceMode(mode);
  }

  @action
  loadMore() {
    this.activity.loadMore();
  }

  @action
  selectItem(item) {
    if (!item || !item.placeIdentifier) return;

    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
      this.mapUi.saveScrollPosition('activity', sidebarContent.scrollTop);
    }

    this.mapUi.returnToRoute = { name: 'activity' };
    this.mapUi.showSidebar();
    this.mapUi.preventNextZoom = true;

    this.router.transitionTo(`/place/${item.placeIdentifier}`);
  }

  @action
  onNostrConnected() {
    this.loadTask.perform(this.nostrAuth.pubkey);
  }

  @action
  backToMenu() {
    this.router.transitionTo('menu');
  }

  @action
  close() {
    this.router.transitionTo('index');
  }
}
