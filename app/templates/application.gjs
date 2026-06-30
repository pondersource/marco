import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import AppHeader from '#components/app-header';
import Toast from '#components/toast';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';

export default class ApplicationComponent extends Component {
  @service storage;
  @service mapUi;
  @service router;

  get isSidebarOpen() {
    // We consider the sidebar "open" if we are in search, menu, lists or place routes AND it's visible.
    // This helps the map know if it should shift the center or adjust view.
    const name = this.router.currentRouteName;
    return (
      this.mapUi.isSidebarVisible &&
      (name === 'place' ||
        name === 'place.new' ||
        name === 'search' ||
        name === 'menu' ||
        name.startsWith('lists'))
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
    if (this.router.currentRouteName === 'menu') {
      this.router.transitionTo('index');
    } else {
      this.router.transitionTo('menu');
    }
  }

  @action
  handleOutsideClick() {
    const name = this.router.currentRouteName;
    if (
      name === 'search' ||
      name === 'place' ||
      name === 'menu' ||
      name.startsWith('lists')
    ) {
      this.mapUi.clearSelection();
      this.mapUi.hideSidebar();
      if (name === 'menu' || name.startsWith('lists')) {
        this.router.transitionTo('index');
      } else if (name === 'place') {
        if (this.mapUi.returnToSearch && this.mapUi.currentSearch) {
          this.router.transitionTo('search', {
            queryParams: this.mapUi.currentSearch,
          });
        } else {
          this.router.transitionTo('index');
        }
      }
    }
  }

  @action
  refreshBookmarks() {
    this.storage.notifyChange();
  }

  <template>
    {{pageTitle "Marco"}}

    <div class={{if this.mapUi.isSidebarOpening "sidebar-opening"}}>
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
        @isSidebarOpen={{this.isSidebarOpen}}
        @onOutsideClick={{this.handleOutsideClick}}
      />

      <Toast />

      {{outlet}}
    </div>
  </template>
}
