import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { service } from '@ember/service';
import { on } from '@ember/modifier';
import { EventFactory } from 'applesauce-core';
import { task } from 'ember-concurrency';
import Geohash from 'latlon-geohash';
import PlacePhotoUploadItem from './place-photo-upload-item';
import Icon from '#components/icon';
import { or, not } from 'ember-truth-helpers';

export default class PlacePhotoUpload extends Component {
  @service nostrAuth;
  @service nostrRelay;
  @service blossom;
  @service toast;

  @tracked files = [];
  @tracked uploadedPhotos = [];
  @tracked status = '';
  @tracked error = '';
  @tracked isPublishing = false;
  @tracked isDragging = false;

  get place() {
    return this.args.place || {};
  }

  get title() {
    return this.place.title || 'this place';
  }

  get allUploaded() {
    return (
      this.files.length > 0 && this.files.length === this.uploadedPhotos.length
    );
  }

  get photoWord() {
    return this.files.length === 1 ? 'Photo' : 'Photos';
  }

  @action
  handleFileSelect(event) {
    this.addFiles(event.target.files);
    event.target.value = ''; // Reset input
  }

  @action
  handleDragOver(event) {
    event.preventDefault();
    this.isDragging = true;
  }

  @action
  handleDragLeave(event) {
    event.preventDefault();
    this.isDragging = false;
  }

  @action
  handleDrop(event) {
    event.preventDefault();
    this.isDragging = false;
    this.addFiles(event.dataTransfer.files);
  }

  addFiles(fileList) {
    if (!fileList) return;
    const newFiles = Array.from(fileList).filter((f) =>
      f.type.startsWith('image/')
    );
    this.files = [...this.files, ...newFiles];
  }

  @action
  handleUploadSuccess(photoData) {
    this.uploadedPhotos = [...this.uploadedPhotos, photoData];
  }

  @action
  removeFile(fileToRemove) {
    const photoData = this.uploadedPhotos.find((p) => p.file === fileToRemove);
    this.files = this.files.filter((f) => f !== fileToRemove);
    this.uploadedPhotos = this.uploadedPhotos.filter(
      (p) => p.file !== fileToRemove
    );

    if (photoData && photoData.hash && photoData.url) {
      this.deletePhotoTask.perform(photoData);
    }
  }

  deletePhotoTask = task(async (photoData) => {
    try {
      if (photoData.hash) {
        await this.blossom.delete(photoData.hash);
      }
      if (photoData.thumbHash) {
        await this.blossom.delete(photoData.thumbHash);
      }
    } catch (e) {
      this.toast.show(`Failed to delete photo from server: ${e.message}`, 5000);
    }
  });

  @action
  async publish() {
    if (!this.nostrAuth.isConnected) {
      this.error = 'You must connect Nostr first.';
      return;
    }

    if (!this.allUploaded) {
      this.error = 'Please wait for all photos to finish uploading.';
      return;
    }

    const { osmId, lat, lon } = this.place;
    const osmType = this.place.osmType || 'node';

    if (!osmId) {
      this.error = 'This place does not have a valid OSM ID.';
      return;
    }

    this.status = 'Publishing event...';
    this.error = '';
    this.isPublishing = true;

    try {
      const factory = new EventFactory({ signer: this.nostrAuth.signer });

      const tags = [['i', `osm:${osmType}:${osmId}`]];

      if (lat && lon) {
        tags.push(['g', Geohash.encode(lat, lon, 4)]);
        tags.push(['g', Geohash.encode(lat, lon, 6)]);
        tags.push(['g', Geohash.encode(lat, lon, 7)]);
        tags.push(['g', Geohash.encode(lat, lon, 9)]);
      }

      for (const photo of this.uploadedPhotos) {
        const imeta = ['imeta', `url ${photo.url}`];

        imeta.push(`m ${photo.type}`);

        if (photo.dim) {
          imeta.push(`dim ${photo.dim}`);
        }

        imeta.push('alt A photo of a place');

        if (photo.fallbackUrls && photo.fallbackUrls.length > 0) {
          for (const fallbackUrl of photo.fallbackUrls) {
            imeta.push(`fallback ${fallbackUrl}`);
          }
        }

        if (photo.thumbUrl) {
          imeta.push(`thumb ${photo.thumbUrl}`);
        }

        if (photo.blurhash) {
          imeta.push(`blurhash ${photo.blurhash}`);
        }

        tags.push(imeta);
      }

      // NIP-XX draft Place Photo event
      const template = {
        kind: 360,
        content: '',
        tags,
      };

      if (!template.created_at) {
        template.created_at = Math.floor(Date.now() / 1000);
      }

      const event = await factory.sign(template);
      await this.nostrRelay.publish(event);

      this.status = 'Published successfully!';

      // Clear out the files so user can upload more or be done
      this.files = [];
      this.uploadedPhotos = [];
    } catch (e) {
      this.error = 'Failed to publish: ' + e.message;
      this.status = '';
    } finally {
      this.isPublishing = false;
    }
  }

  <template>
    <div class="place-photo-upload">
      <h2>Add Photos for {{this.title}}</h2>

      {{#if this.error}}
        <div class="alert alert-error">
          {{this.error}}
        </div>
      {{/if}}

      {{#if this.status}}
        <div class="alert alert-info">
          {{this.status}}
        </div>
      {{/if}}

      <div
        class="dropzone {{if this.isDragging 'is-dragging'}}"
        {{on "dragover" this.handleDragOver}}
        {{on "dragleave" this.handleDragLeave}}
        {{on "drop" this.handleDrop}}
      >
        <label for="photo-upload-input" class="dropzone-label">
          <Icon @name="upload-cloud" @size={{48}} @color="#ccc" />
          <p>Drag and drop photos here, or click to browse</p>
        </label>
        <input
          id="photo-upload-input"
          type="file"
          accept="image/*"
          multiple
          class="file-input-hidden"
          disabled={{this.isPublishing}}
          {{on "change" this.handleFileSelect}}
        />
      </div>

      {{#if this.files.length}}
        <div class="photo-grid">
          {{#each this.files as |file|}}
            <PlacePhotoUploadItem
              @file={{file}}
              @onSuccess={{this.handleUploadSuccess}}
              @onRemove={{this.removeFile}}
            />
          {{/each}}
        </div>

        <button
          type="button"
          class="btn btn-primary btn-publish"
          disabled={{or (not this.allUploaded) this.isPublishing}}
          {{on "click" this.publish}}
        >
          {{#if this.isPublishing}}
            Publishing...
          {{else}}
            Publish
            {{this.files.length}}
            {{this.photoWord}}
          {{/if}}
        </button>
      {{/if}}
    </div>
  </template>
}
