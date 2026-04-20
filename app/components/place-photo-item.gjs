import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { action } from '@ember/object';
import { task } from 'ember-concurrency';
import Icon from '#components/icon';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const MAX_IMAGE_DIMENSION = 1920;
const IMAGE_QUALITY = 0.94;
const MAX_THUMBNAIL_DIMENSION = 350;
const THUMBNAIL_QUALITY = 0.9;

export default class PlacePhotoItem extends Component {
  @service blossom;
  @service imageProcessor;
  @service toast;

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

  @action
  showErrorToast() {
    if (this.error) {
      this.toast.show(this.error);
    }
  }

  uploadTask = task(async (file) => {
    this.error = '';
    try {
      // 1. Process main image and generate blurhash in worker
      const mainData = await this.imageProcessor.process(
        file,
        MAX_IMAGE_DIMENSION,
        IMAGE_QUALITY,
        true // computeBlurhash
      );

      // 2. Process thumbnail (no blurhash needed)
      const thumbData = await this.imageProcessor.process(
        file,
        MAX_THUMBNAIL_DIMENSION,
        THUMBNAIL_QUALITY,
        false
      );

      // 3. Upload main image (to all servers concurrently)
      const mainUploadPromise = this.blossom.upload(mainData.blob);

      // 4. Upload thumbnail (to all servers concurrently)
      const thumbUploadPromise = this.blossom.upload(thumbData.blob);

      // Await both uploads
      const [mainResult, thumbResult] = await Promise.all([
        mainUploadPromise,
        thumbUploadPromise,
      ]);

      this.isUploaded = true;

      if (this.args.onSuccess) {
        this.args.onSuccess({
          file,
          url: mainResult.url,
          fallbackUrls: mainResult.fallbackUrls,
          thumbUrl: thumbResult.url,
          blurhash: mainData.blurhash,
          type: 'image/jpeg',
          dim: mainData.dim,
          hash: mainResult.hash,
          thumbHash: thumbResult.hash,
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
        <button
          type="button"
          class="photo-item-overlay error-overlay"
          title={{this.error}}
          {{on "click" this.showErrorToast}}
        >
          <Icon @name="alert-circle" @size={{24}} @color="white" />
        </button>
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
