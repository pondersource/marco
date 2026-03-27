import Component from '@glimmer/component';
import PlacesSidebar from '#components/places-sidebar';
import { service } from '@ember/service';
import { action } from '@ember/object';

export default class SearchTemplate extends Component {
  @service router;
  @service mapUi;

  @action
  selectPlace(place) {
    if (place) {
      this.mapUi.returnToSearch = true;
      // We don't need to manually set currentSearch here because
      // it was already set in the route's setupController
      this.router.transitionTo('place', place);
    }
  }

  @action
  close() {
    this.router.transitionTo('index');
  }

  <template>
    <PlacesSidebar
      @places={{@model}}
      @onSelect={{this.selectPlace}}
      @onClose={{this.close}}
    />
  </template>
}
