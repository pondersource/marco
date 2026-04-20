import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import Icon from '#components/icon';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

export default class PlacePhotoItem extends Component {
  @service blossom;

  @tracked thumbnailUrl = '';
  @tracked error = '';
  @tracked isUploaded = false;

  constructor() {
    super(...arguments);
    if (this.args.file) {
      this.thumbnailUrl = URL.createObjectURL(this.args.file);
      this.uploadTask.perform(this.args.file);
    }
  }

  willDestroy() {
    super.willDestroy(...arguments);
    if (this.thumbnailUrl) {
      URL.revokeObjectURL(this.thumbnailUrl);
    }
  }

  uploadTask = task(async (file) => {
    this.error = '';
    try {
      const dim = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.width}x${img.height}`);
        img.onerror = () => resolve('');
        img.src = this.thumbnailUrl;
      });

      const result = await this.blossom.upload(file);
      this.isUploaded = true;

      if (this.args.onSuccess) {
        this.args.onSuccess({
          file,
          url: result.url,
          fallbackUrls: result.fallbackUrls,
          type: result.type,
          dim,
          hash: result.hash,
        });
      }
    } catch (e) {
      this.error = e.message;
    }
  });

  <template>
    <div
      class="photo-item
        {{if this.uploadTask.isRunning 'is-uploading'}}
        {{if this.error 'has-error'}}"
    >
      <img src={{this.thumbnailUrl}} alt="thumbnail" class="photo-item-img" />

      {{#if this.uploadTask.isRunning}}
        <div class="photo-item-overlay">
          <Icon
            @name="loading-ring"
            @size={{24}}
            @color="white"
            class="spin-animation"
          />
        </div>
      {{/if}}

      {{#if this.error}}
        <div class="photo-item-overlay error-overlay" title={{this.error}}>
          <Icon @name="alert-circle" @size={{24}} @color="white" />
        </div>
      {{/if}}

      {{#if this.isUploaded}}
        <div class="photo-item-overlay success-overlay">
          <Icon @name="check" @size={{24}} @color="white" />
        </div>
      {{/if}}

      <button
        type="button"
        class="btn-remove-photo"
        title="Remove photo"
        {{on "click" (fn @onRemove @file)}}
      >
        <Icon @name="x" @size={{16}} @color="white" />
      </button>
    </div>
  </template>
}
