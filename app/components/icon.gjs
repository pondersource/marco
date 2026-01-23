import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';

import clock from 'feather-icons/dist/icons/clock.svg?raw';
import globe from 'feather-icons/dist/icons/globe.svg?raw';
import home from 'feather-icons/dist/icons/home.svg?raw';
import map from 'feather-icons/dist/icons/map.svg?raw';
import mapPin from 'feather-icons/dist/icons/map-pin.svg?raw';
import navigation from 'feather-icons/dist/icons/navigation.svg?raw';
import phone from 'feather-icons/dist/icons/phone.svg?raw';
import user from 'feather-icons/dist/icons/user.svg?raw';
import settings from 'feather-icons/dist/icons/settings.svg?raw';
import arrowLeft from 'feather-icons/dist/icons/arrow-left.svg?raw';
import x from 'feather-icons/dist/icons/x.svg?raw';

const ICONS = {
  clock,
  globe,
  home,
  map,
  mapPin,
  navigation,
  phone,
  user,
  settings,
  'arrow-left': arrowLeft,
  x
};

export default class IconComponent extends Component {
  get svg() {
    return ICONS[this.args.name];
  }

  get size() {
    return this.args.size || 16;
  }

  get color() {
    return this.args.color || '#898989';
  }

  get style() {
    return `width:${this.size}px;height:${this.size}px;color:${this.color}`;
  }

  get title() {
    return this.args.title || '';
  }

  <template>
    {{#if this.svg}}
      <span class="icon" style={{this.style}} title={{this.title}}>
        {{htmlSafe this.svg}}
      </span>
    {{/if}}
  </template>
}
