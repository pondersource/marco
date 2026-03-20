import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from '#components/icon';
import { POI_CATEGORIES } from '../utils/poi-categories';

export default class CategoryChipsComponent extends Component {
  @service router;
  @service mapUi;

  get categories() {
    return POI_CATEGORIES;
  }

  @action
  searchCategory(category) {
    // If passed an onSelect action, call it (e.g. to clear search box)
    if (this.args.onSelect) {
      this.args.onSelect(category);
    }

    let queryParams = { category: category.id, q: null };

    if (this.mapUi.currentCenter) {
      const { lat, lon } = this.mapUi.currentCenter;
      queryParams.lat = parseFloat(lat).toFixed(4);
      queryParams.lon = parseFloat(lon).toFixed(4);
    }

    this.router.transitionTo('search', { queryParams });
  }

  <template>
    <div class="category-chips-scroll">
      <div class="category-chips-container">
        {{#each this.categories as |category|}}
          <button
            type="button"
            class="category-chip"
            {{on "click" (fn this.searchCategory category)}}
            aria-label={{category.label}}
          >
            <Icon @name={{category.icon}} @size={{16}} />
            <span>{{category.label}}</span>
          </button>
        {{/each}}
      </div>
    </div>
  </template>
}
