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
import { getSuggestedPhotoTags } from '../utils/photo-tag-suggestions';
import capitalize from '../helpers/capitalize';
import includes from '../helpers/includes';
import { fn } from '@ember/helper';
import { or, not } from 'ember-truth-helpers';

export default class PlacePhotoUpload extends Component {
  @service nostrAuth;
  @service nostrRelay;
  @service nostrData;
  @service blossom;
  @service toast;

  @tracked file = null;
  @tracked uploadedPhoto = null;
  @tracked error = '';
  @tracked isPublishing = false;
  @tracked isDragging = false;
  @tracked selectedTags = [];
  @tracked altText = '';

  get place() {
    return this.args.place || {};
  }

  get title() {
    return this.place.title || 'this place';
  }

  get allUploaded() {
    return (
      this.file && this.uploadedPhoto && this.file === this.uploadedPhoto.file
    );
  }

  get suggestedTags() {
    return getSuggestedPhotoTags(this.place);
  }

  @action
  handleFileSelect(event) {
    this.addFile(event.target.files[0]);
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
    if (event.dataTransfer.files.length > 0) {
      this.addFile(event.dataTransfer.files[0]);
    }
  }

  addFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      this.error = 'Please select a valid image file.';
      return;
    }
    this.error = '';
    // If a photo was already uploaded but not published, delete it from the server
    if (this.uploadedPhoto) {
      this.deletePhotoTask.perform(this.uploadedPhoto);
    }
    this.file = file;
    this.uploadedPhoto = null;
    if (this.args.onUploadStateChange) {
      this.args.onUploadStateChange(true);
    }
  }

  @action
  handleUploadSuccess(photoData) {
    this.uploadedPhoto = photoData;
  }

  @action
  removeFile() {
    if (this.uploadedPhoto) {
      this.deletePhotoTask.perform(this.uploadedPhoto);
    }
    this.file = null;
    this.uploadedPhoto = null;
    this.selectedTags = [];
    this.altText = '';
    if (this.args.onUploadStateChange) {
      this.args.onUploadStateChange(false);
    }
  }

  @action
  toggleTag(tag) {
    if (this.selectedTags.includes(tag)) {
      this.selectedTags = [];
      return;
    }

    this.selectedTags = [tag];
  }

  @action
  updateAltText(event) {
    this.altText = event.target.value;
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

    this.error = '';
    this.isPublishing = true;

    try {
      const tags = [['i', `osm:${osmType}:${osmId}`]];

      for (const tag of this.selectedTags) {
        tags.push(['t', tag]);
      }

      if (lat && lon) {
        tags.push(['g', Geohash.encode(lat, lon, 4)]);
        tags.push(['g', Geohash.encode(lat, lon, 6)]);
        tags.push(['g', Geohash.encode(lat, lon, 7)]);
        tags.push(['g', Geohash.encode(lat, lon, 9)]);
      }

      const photo = this.uploadedPhoto;
      const imeta = ['imeta', `url ${photo.url}`];

      imeta.push(`m ${photo.type}`);

      if (photo.dim) {
        imeta.push(`dim ${photo.dim}`);
      }

      const alt = this.altText.trim();
      if (alt) {
        imeta.push(`alt ${alt}`);
      }

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

      // NIP-XX draft Place Photo event
      const event = await EventFactory.fromKind(360)
        .content('')
        .modifyPublicTags(() => tags)
        .as(this.nostrAuth.signer)
        .sign();
      const responses = await this.nostrRelay.publish(
        this.nostrData.activeWriteRelays,
        event
      );
      this.nostrData.recordPublishResult(event.id, responses);
      if (!responses?.some((res) => res.ok)) {
        throw new Error('Failed to publish event.');
      }
      this.nostrData.store.add(event);

      this.toast.show('Photo published successfully');

      // Clear out the file so user can upload more or be done
      this.file = null;
      this.uploadedPhoto = null;
      this.altText = '';

      if (this.args.onUploadStateChange) {
        this.args.onUploadStateChange(false);
      }

      if (this.args.onClose) {
        this.args.onClose(event.id);
      }
    } catch (e) {
      this.error = 'Failed to publish: ' + e.message;
    } finally {
      this.isPublishing = false;
    }
  }

  <template>
    <div class="place-photo-upload">
      <h2>Add Photo for {{this.title}}</h2>

      {{#if this.error}}
        <div class="alert alert-error">
          {{this.error}}
        </div>
      {{/if}}

      {{#if this.file}}
        <PlacePhotoUploadItem
          @file={{this.file}}
          @onSuccess={{this.handleUploadSuccess}}
          @onRemove={{this.removeFile}}
        />

        {{#if this.suggestedTags.length}}
          <div class="photo-tag-suggestions">
            <p class="photo-tag-suggestions-title">
              Choose a tag/category (optional):
            </p>
            <div class="photo-tag-suggestions-list">
              {{#each this.suggestedTags as |tag|}}
                <button
                  type="button"
                  class="photo-tag-chip
                    {{if (includes this.selectedTags tag) 'is-selected'}}"
                  {{on "click" (fn this.toggleTag tag)}}
                >
                  {{capitalize tag}}
                </button>
              {{/each}}
            </div>
          </div>
        {{/if}}

        <div class="form-group">
          <label for="photo-alt-input">Description (optional):</label>
          <input
            id="photo-alt-input"
            type="text"
            class="form-control"
            placeholder="Describe this photo"
            value={{this.altText}}
            disabled={{this.isPublishing}}
            {{on "input" this.updateAltText}}
          />
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
            Publish Photo
          {{/if}}
        </button>
      {{else}}
        <div
          class="dropzone {{if this.isDragging 'is-dragging'}}"
          {{on "dragover" this.handleDragOver}}
          {{on "dragleave" this.handleDragLeave}}
          {{on "drop" this.handleDrop}}
        >
          <label for="photo-upload-input" class="dropzone-label">
            <Icon @name="upload-cloud" @size={{48}} @color="#ccc" />
            <p>Drag and drop a photo here, or click to browse</p>
          </label>
          <input
            id="photo-upload-input"
            type="file"
            accept="image/*"
            class="file-input-hidden"
            disabled={{this.isPublishing}}
            {{on "change" this.handleFileSelect}}
          />
        </div>
      {{/if}}
    </div>
  </template>
}
