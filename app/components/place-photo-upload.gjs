import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';
import { on } from '@ember/modifier';
import { EventFactory } from 'applesauce-core';
import Geohash from 'latlon-geohash';

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default class PlacePhotoUpload extends Component {
  @service nostrAuth;
  @service nostrData;
  @service nostrRelay;

  @tracked photoUrl = '';
  @tracked photoType = 'image/jpeg';
  @tracked photoDim = '';
  @tracked status = '';
  @tracked error = '';
  @tracked isUploading = false;

  get place() {
    return this.args.place || {};
  }

  get title() {
    return this.place.title || 'this place';
  }

  get blossomServer() {
    return this.nostrData.blossomServers[0] || 'https://nostr.build';
  }

  @action
  async handleFileSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    this.error = '';
    this.status = 'Preparing upload...';
    this.isUploading = true;
    this.photoType = file.type;

    try {
      if (!this.nostrAuth.isConnected) {
        throw new Error('You must connect Nostr first.');
      }

      // 1. Get image dimensions
      const dim = await new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(`${img.width}x${img.height}`);
        };
        img.onerror = () => resolve('');
        img.src = url;
      });
      this.photoDim = dim;

      // 2. Read file & compute hash
      this.status = 'Computing hash...';
      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const payloadHash = bufferToHex(hashBuffer);

      // 3. Create BUD-11 Auth Event
      this.status = 'Signing auth event...';
      let serverUrl = this.blossomServer;
      if (serverUrl.endsWith('/')) {
        serverUrl = serverUrl.slice(0, -1);
      }
      const uploadUrl = `${serverUrl}/upload`;

      const factory = new EventFactory({ signer: this.nostrAuth.signer });
      const now = Math.floor(Date.now() / 1000);
      const serverHostname = new URL(serverUrl).hostname;

      const authTemplate = {
        kind: 24242,
        created_at: now,
        content: 'Upload photo for place',
        tags: [
          ['t', 'upload'],
          ['x', payloadHash],
          ['expiration', String(now + 3600)],
          ['server', serverHostname],
        ],
      };

      const authEvent = await factory.sign(authTemplate);
      const base64 = btoa(JSON.stringify(authEvent));
      const base64url = base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const authHeader = `Nostr ${base64url}`;

      // 4. Upload to Blossom
      this.status = `Uploading to ${serverUrl}...`;
      // eslint-disable-next-line warp-drive/no-external-request-patterns
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: authHeader,
          'X-SHA-256': payloadHash,
        },
        body: file,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Upload failed (${response.status}): ${text}`);
      }

      const result = await response.json();

      this.photoUrl = result.url;
      this.status = 'Photo uploaded! Ready to publish.';
    } catch (e) {
      this.error = e.message;
      this.status = '';
    } finally {
      this.isUploading = false;
      if (event && event.target) {
        event.target.value = '';
      }
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

      const imeta = [
        'imeta',
        `url ${this.photoUrl}`,
        `m ${this.photoType}`,
        'alt A photo of a place',
      ];

      if (this.photoDim) {
        imeta.splice(3, 0, `dim ${this.photoDim}`);
      }

      tags.push(imeta);

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

      <div>
        {{#if this.photoUrl}}
          <div class="preview-group">
            <p>Photo Preview:</p>
            <img
              src={{this.photoUrl}}
              alt="Preview"
              class="photo-preview-img"
            />
          </div>
          <button
            type="button"
            class="btn btn-primary"
            {{on "click" this.publish}}
          >
            Publish Event (kind: 360)
          </button>
        {{else}}
          <label for="photo-upload-input">Select Photo</label>
          <input
            id="photo-upload-input"
            type="file"
            accept="image/*"
            class="file-input"
            disabled={{this.isUploading}}
            {{on "change" this.handleFileSelected}}
          />
          {{#if this.isUploading}}
            <p>Uploading...</p>
          {{/if}}
        {{/if}}
      </div>
    </div>
  </template>
}
