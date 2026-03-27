import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import AppHeader from '#components/app-header';
import AppMenu from '#components/app-menu/index';
import Toast from '#components/toast';
import { service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { or } from 'ember-truth-helpers';
import { on } from '@ember/modifier';

export default class ApplicationComponent extends Component {
  @service storage;
  @service mapUi;
  @service router;

  @tracked isAppMenuOpen = false;

  get isSidebarOpen() {
    // We consider the sidebar "open" if we are in search or place routes.
    // This helps the map know if it should shift the center or adjust view.
    return (
      this.router.currentRouteName === 'place' ||
      this.router.currentRouteName === 'place.new' ||
      this.router.currentRouteName === 'search'
    );
  }

  constructor() {
    super(...arguments);
    console.debug('Application component constructed');
    // Access the service to ensure it is instantiated
    this.storage;
  }

  @action
  toggleAppMenu() {
    this.isAppMenuOpen = !this.isAppMenuOpen;
  }

  @action
  closeAppMenu() {
    this.isAppMenuOpen = false;
  }

  @action
  handleOutsideClick() {
    if (this.isAppMenuOpen) {
      this.closeAppMenu();
    } else if (this.router.currentRouteName === 'search') {
      this.router.transitionTo('index');
    } else if (this.router.currentRouteName === 'place') {
      // If in place route, decide if we want to go back to search or index
      // For now, let's go to index or maybe back to search if search params exist?
      // Simplest behavior: clear selection
      this.router.transitionTo('index');
    }
  }

  @action
  refreshBookmarks() {
    this.storage.notifyChange();
  }

  <template>
    {{pageTitle "Marco"}}

    <AppHeader @onToggleMenu={{this.toggleAppMenu}} />

    <div
      id="rs-widget-container"
      class={{if this.storage.isWidgetOpen "visible"}}
    ></div>

    {{#if this.storage.isWidgetOpen}}
      <div
        class="rs-backdrop"
        role="button"
        {{on "click" this.storage.closeWidget}}
      ></div>
    {{/if}}

    <Map
      @isSidebarOpen={{or this.isSidebarOpen this.isAppMenuOpen}}
      @onOutsideClick={{this.handleOutsideClick}}
    />

    {{#if this.isAppMenuOpen}}
      <AppMenu @onClose={{this.closeAppMenu}} />
    {{/if}}

    <Toast />

    {{outlet}}
  </template>
}
