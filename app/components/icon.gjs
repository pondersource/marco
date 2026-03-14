import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { getIcon } from '../utils/icons';

export default class IconComponent extends Component {
  get svg() {
    return getIcon(this.args.name);
  }

  get size() {
    return this.args.size || 16;
  }

  get color() {
    return this.args.color || '#898989';
  }

  get style() {
    return htmlSafe(
      `width:${this.size}px;height:${this.size}px;color:${this.color}`
    );
  }

  get title() {
    return this.args.title || '';
  }

  <template>
    {{#if this.svg}}
      <span
        class="icon {{if @filled 'icon-filled'}}"
        style={{this.style}}
        title={{this.title}}
      >
        {{htmlSafe this.svg}}
      </span>
    {{/if}}
  </template>
}
