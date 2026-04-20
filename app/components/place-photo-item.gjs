import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
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
      // 1. Process main image
      const mainData = await this.imageProcessor.process(
        file,
        MAX_IMAGE_DIMENSION,
        IMAGE_QUALITY
      );

      // 2. Generate blurhash from main image data
      const blurhash = await this.imageProcessor.generateBlurhash(
        mainData.imageData
      );

      // 3. Process thumbnail
      const thumbData = await this.imageProcessor.process(
        file,
        MAX_THUMBNAIL_DIMENSION,
        THUMBNAIL_QUALITY
      );

      // 4. Upload main image (to all servers concurrently)
      const mainUploadPromise = this.blossom.upload(mainData.blob);

      // 5. Upload thumbnail (to all servers concurrently)
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
          blurhash,
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
