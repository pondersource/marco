import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PlaceEditForm extends Component {
  @tracked title = '';
  @tracked description = '';

  constructor() {
    super(...arguments);
    this.title = this.args.place?.title || '';
    this.description = this.args.place?.description || '';
  }

  get shouldAutofocus() {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 768;
    }
    return false;
  }

  @action
  handleSubmit(event) {
    event.preventDefault();
    if (this.args.onSave) {
      this.args.onSave({
        title: this.title,
        description: this.description,
      });
    }
  }

  @action
  updateTitle(e) {
    this.title = e.target.value;
  }

  @action
  updateDescription(e) {
    this.description = e.target.value;
  }

  <template>
    <form class="edit-form" {{on "submit" this.handleSubmit}}>
      <div class="form-group">
        <label for="edit-title">Title</label>
        <input
          id="edit-title"
          type="text"
          value={{this.title}}
          {{on "input" this.updateTitle}}
          class="form-control"
          placeholder="Name of the place"
          autofocus={{this.shouldAutofocus}}
        />
      </div>
      <div class="form-group">
        <label for="edit-desc">Description</label>
        <textarea
          id="edit-desc"
          value={{this.description}}
          {{on "input" this.updateDescription}}
          class="form-control"
          rows="3"
          placeholder="Add some details..."
        ></textarea>
      </div>
      <div class="edit-actions">
        <button type="submit" class="btn btn-blue">Save</button>
        <button
          type="button"
          class="btn btn-outline"
          {{on "click" @onCancel}}
        >Cancel</button>
      </div>
    </form>
  </template>
}
