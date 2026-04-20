import Service, { service } from '@ember/service';
import { EventFactory } from 'applesauce-core';
import { sha256 } from '@noble/hashes/sha2.js';

export const DEFAULT_BLOSSOM_SERVER = 'https://blossom.nostr.build';

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getBlossomUrl(serverUrl, path) {
  let url = serverUrl || DEFAULT_BLOSSOM_SERVER;
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  return path.startsWith('/') ? `${url}${path}` : `${url}/${path}`;
}

export default class BlossomService extends Service {
  @service nostrAuth;
  @service nostrData;

  get servers() {
    const servers = this.nostrData.blossomServers;
    return servers.length ? servers : [DEFAULT_BLOSSOM_SERVER];
  }

  async _getAuthHeader(action, hash, serverUrl) {
    const factory = new EventFactory({ signer: this.nostrAuth.signer });
    const now = Math.floor(Date.now() / 1000);
    const serverHostname = new URL(serverUrl).hostname;

    const authTemplate = {
      kind: 24242,
      created_at: now,
      content: action === 'upload' ? 'Upload photo for place' : 'Delete photo',
      tags: [
        ['t', action],
        ['x', hash],
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
    return `Nostr ${base64url}`;
  }

  async _uploadToServer(file, hash, serverUrl) {
    const uploadUrl = getBlossomUrl(serverUrl, 'upload');
    const authHeader = await this._getAuthHeader('upload', hash, serverUrl);

    // eslint-disable-next-line warp-drive/no-external-request-patterns
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'X-SHA-256': hash,
      },
      body: file,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  async upload(file) {
    if (!this.nostrAuth.isConnected) throw new Error('Not connected');

    const buffer = await file.arrayBuffer();
    let hashBuffer;

    if (
      typeof crypto !== 'undefined' &&
      crypto.subtle &&
      crypto.subtle.digest
    ) {
      hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    } else {
      hashBuffer = sha256(new Uint8Array(buffer));
    }

    const payloadHash = bufferToHex(hashBuffer);

    const servers = this.servers;
    const mainServer = servers[0];
    const fallbackServers = servers.slice(1);

    // Start all uploads concurrently
    const mainPromise = this._uploadToServer(file, payloadHash, mainServer);
    const fallbackPromises = fallbackServers.map((serverUrl) =>
      this._uploadToServer(file, payloadHash, serverUrl)
    );

    // Main server MUST succeed
    const mainResult = await mainPromise;

    // Fallback servers can fail, but we log the warnings
    const fallbackResults = await Promise.allSettled(fallbackPromises);
    const fallbackUrls = [];

    for (let i = 0; i < fallbackResults.length; i++) {
      const result = fallbackResults[i];
      if (result.status === 'fulfilled') {
        fallbackUrls.push(result.value.url);
      } else {
        console.warn(
          `Fallback upload to ${fallbackServers[i]} failed:`,
          result.reason
        );
      }
    }

    return {
      url: mainResult.url,
      fallbackUrls,
      hash: payloadHash,
      type: file.type,
    };
  }

  async _deleteFromServer(hash, serverUrl) {
    const deleteUrl = getBlossomUrl(serverUrl, hash);
    const authHeader = await this._getAuthHeader('delete', hash, serverUrl);

    // eslint-disable-next-line warp-drive/no-external-request-patterns
    const response = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || response.statusText);
    }
  }

  async delete(hash) {
    if (!this.nostrAuth.isConnected) throw new Error('Not connected');

    const servers = this.servers;
    const mainServer = servers[0];
    const fallbackServers = servers.slice(1);

    const mainPromise = this._deleteFromServer(hash, mainServer);
    const fallbackPromises = fallbackServers.map((serverUrl) =>
      this._deleteFromServer(hash, serverUrl)
    );

    // Main server MUST succeed
    await mainPromise;

    // Fallback servers can fail, log warnings
    const fallbackResults = await Promise.allSettled(fallbackPromises);
    for (let i = 0; i < fallbackResults.length; i++) {
      const result = fallbackResults[i];
      if (result.status === 'rejected') {
        console.warn(
          `Fallback delete from ${fallbackServers[i]} failed:`,
          result.reason
        );
      }
    }
  }
}
