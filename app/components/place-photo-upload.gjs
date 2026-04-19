import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { on } from '@ember/modifier';
import { EventFactory } from 'applesauce-core';
import Geohash from 'latlon-geohash';

export default class PlacePhotoUpload extends Component {
  @service nostrAuth;
  @service nostrRelay;

  @tracked photoUrl = '';
  @tracked status = '';
  @tracked error = '';

  get place() {
    return this.args.place || {};
  }

  get title() {
    return this.place.title || 'this place';
  }

  @action
  async login() {
    try {
      this.error = '';
      await this.nostrAuth.login();
    } catch (e) {
      this.error = e.message;
    }
  }

  @action
  async uploadPhoto(event) {
    event.preventDefault();
    this.error = '';
    this.status = 'Uploading...';

    try {
      // Mock upload
      await new Promise((resolve) => setTimeout(resolve, 1000));
      this.photoUrl =
        'https://dummyimage.com/600x400/000/fff.jpg&text=Mock+Place+Photo';
      this.status = 'Photo uploaded! Ready to publish.';
    } catch (e) {
      this.error = 'Upload failed: ' + e.message;
      this.status = '';
    }
  }

  @action
  async publish() {
    if (!this.nostrAuth.isConnected) {
      this.error = 'You must connect Nostr first.';
      return;
    }

    if (!this.photoUrl) {
      this.error = 'Please upload a photo.';
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

    try {
      const factory = new EventFactory({ signer: this.nostrAuth.signer });

      const tags = [['i', `osm:${osmType}:${osmId}`]];

      if (lat && lon) {
        tags.push(['g', Geohash.encode(lat, lon, 4)]);
        tags.push(['g', Geohash.encode(lat, lon, 6)]);
        tags.push(['g', Geohash.encode(lat, lon, 7)]);
        tags.push(['g', Geohash.encode(lat, lon, 9)]);
      }

      tags.push([
        'imeta',
        `url ${this.photoUrl}`,
        'm image/jpeg',
        'dim 600x400',
        'alt A photo of a place',
      ]);

      // NIP-XX draft Place Photo event
      const template = {
        kind: 360,
        content: '',
        tags,
      };

      // Ensure created_at is present before signing
      if (!template.created_at) {
        template.created_at = Math.floor(Date.now() / 1000);
      }

      const event = await factory.sign(template);
      await this.nostrRelay.publish(event);

      this.status = 'Published successfully!';
      // Reset form
      this.photoUrl = '';
    } catch (e) {
      this.error = 'Failed to publish: ' + e.message;
      this.status = '';
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

      {{#if this.status}}
        <div class="alert alert-info">
          {{this.status}}
        </div>
      {{/if}}

      {{#if this.nostrAuth.isConnected}}
        <div class="connected-status">
          <strong>Connected:</strong>
          {{this.nostrAuth.pubkey}}
        </div>

        <form {{on "submit" this.uploadPhoto}}>
          {{#if this.photoUrl}}
            <div class="preview-group">
              <p>Photo Preview:</p>
              <img src={{this.photoUrl}} alt="Preview" />
            </div>
            <button
              type="button"
              class="btn btn-primary"
              {{on "click" this.publish}}
            >
              Publish Event (kind: 360)
            </button>
          {{else}}
            <button type="submit" class="btn btn-secondary">
              Mock Upload Photo
            </button>
          {{/if}}
        </form>
      {{else}}
        <button type="button" class="btn btn-primary" {{on "click" this.login}}>
          Connect Nostr Extension
        </button>
      {{/if}}
    </div>
  </template>
}
