import Component from '@glimmer/component';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import Icon from '#components/icon';
import { htmlSafe } from '@ember/template';

export default class ListsIndexTemplate extends Component {
  @service storage;
  @service router;
  @service mapUi;

  styleFor(color) {
    return htmlSafe(`background-color: ${color}`);
  }

  @action
  selectList(listId) {
    this.router.transitionTo('lists.list', listId);
  }

  @action
  close() {
    this.router.transitionTo('index');
  }

  @action
  backToMenu() {
    this.router.transitionTo('menu');
  }

  <template>
    {{#if this.mapUi.isSidebarVisible}}
      <div class="sidebar">
        <div class="sidebar-header">
          <button type="button" class="back-btn" {{on "click" this.backToMenu}}>
            <Icon @name="arrow-left" @size={{20}} @color="#333" />
          </button>
          <h2><Icon @name="bookmark" @size={{20}} @color="#333" />
            Saved places</h2>
          <button type="button" class="close-btn" {{on "click" this.close}}>
            <Icon @name="x" @size={{20}} @color="#333" />
          </button>
        </div>

        <div class="sidebar-content">
          <ul class="places-list">
            {{#each this.storage.lists as |list|}}
              <li>
                <button
                  type="button"
                  class="lists-index-item"
                  {{on "click" (fn this.selectList list.id)}}
                >
                  <div class="lists-index-item-left">
                    {{! template-lint-disable no-inline-styles }}
                    <span
                      class="list-color-dot"
                      style={{this.styleFor list.color}}
                    ></span>
                    <div class="lists-index-name">{{list.title}}</div>
                  </div>
                  <div class="lists-index-count">
                    {{#if list.placeRefs.length}}
                      {{list.placeRefs.length}}
                      places
                    {{else}}
                      empty
                    {{/if}}
                  </div>
                </button>
              </li>
            {{/each}}
          </ul>
        </div>
      </div>
    {{/if}}
  </template>
}
