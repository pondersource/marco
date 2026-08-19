import Controller from '@ember/controller';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { task } from 'ember-concurrency';

export default class ContributionsController extends Controller {
  @service router;
  @service mapUi;
  @service nostrAuth;
  @service contributions;
  @service storage;

  loadContributionsTask = task({ restartable: true }, async (pubkey) => {
    if (!pubkey) return;
    await this.contributions.load(pubkey);
  });

  get scrollTop() {
    return this.mapUi.getScrollPosition('contributions');
  }

  get items() {
    return this.contributions.items;
  }

  get isConnected() {
    return this.nostrAuth.isConnected;
  }

  @action
  selectContribution(item) {
    if (!item) return;

    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) {
      this.mapUi.saveScrollPosition('contributions', sidebarContent.scrollTop);
    }

    this.mapUi.returnToRoute = { name: 'contributions' };
    this.mapUi.showSidebar();
    this.mapUi.preventNextZoom = true;

    this.router.transitionTo(`/place/${item.placeIdentifier}`);
  }

  @action
  onNostrConnected() {
    this.loadContributionsTask.perform(this.nostrAuth.pubkey);
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
