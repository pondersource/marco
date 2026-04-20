import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import { EventFactory } from 'applesauce-core';
import Icon from '#components/icon';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';

const DEFAULT_BLOSSOM_SERVER = 'https://blossom.nostr.build';

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default class PlacePhotoItem extends Component {
  @service nostrAuth;
  @service nostrData;

  @tracked thumbnailUrl = '';
  @tracked error = '';
  @tracked isUploaded = false;

  get blossomServer() {
    return this.nostrData.blossomServers[0] || DEFAULT_BLOSSOM_SERVER;
  }

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
      if (!this.nostrAuth.isConnected) throw new Error('Not connected');

      const dim = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.width}x${img.height}`);
        img.onerror = () => resolve('');
        img.src = this.thumbnailUrl;
      });

      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const payloadHash = bufferToHex(hashBuffer);

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
      this.isUploaded = true;

      if (this.args.onSuccess) {
        this.args.onSuccess({
          file,
          url: result.url,
          type: file.type,
          dim,
          hash: payloadHash,
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
