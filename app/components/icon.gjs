import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { getIcon, isIconFilled } from '../utils/icons';

function formatDimension(dim) {
  if (typeof dim === 'number') {
    return `${dim}px`;
  }
  if (typeof dim === 'string' && /^\d+(\.\d+)?$/.test(dim.trim())) {
    return `${dim.trim()}px`;
  }
  return dim;
}

export default class IconComponent extends Component {
  get svg() {
    return getIcon(this.args.name);
  }

  get size() {
    return this.args.size || 16;
  }

  get width() {
    return this.args.width !== undefined ? this.args.width : this.size;
  }

  get height() {
    return this.args.height !== undefined ? this.args.height : this.size;
  }

  get color() {
    return this.args.color || '#898989';
  }

  get style() {
    return htmlSafe(
      `width:${formatDimension(this.width)};height:${formatDimension(this.height)};color:${this.color}`
    );
  }

  get title() {
    return this.args.title || '';
  }

  get isFilled() {
    return this.args.filled || isIconFilled(this.args.name);
  }

  <template>
    {{#if this.svg}}
      <span
        class="icon {{if this.isFilled 'icon-filled'}}"
        style={{this.style}}
        title={{this.title}}
        ...attributes
      >
        {{htmlSafe this.svg}}
      </span>
    {{/if}}
  </template>
}
