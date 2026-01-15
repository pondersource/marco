import Component from '@glimmer/component';
import { pageTitle } from 'ember-page-title';
import Map from '#components/map';
import { service } from '@ember/service';

export default class ApplicationComponent extends Component {
  @service storage;

  constructor() {
    super(...arguments);
    console.log('Application component constructed');
    // Access the service to ensure it is instantiated
    this.storage;
  }

  <template>
    {{pageTitle "M/\RCO"}}

    <Map />

    {{outlet}}
  </template>
}
