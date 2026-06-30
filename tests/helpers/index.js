import {
  setupApplicationTest as upstreamSetupApplicationTest,
  setupRenderingTest as upstreamSetupRenderingTest,
  setupTest as upstreamSetupTest,
} from 'ember-qunit';
import { setupNostrMocks } from './mock-nostr';
import sinon from 'sinon';

function setupMapStyleMocks(hooks) {
  hooks.beforeEach(function () {
    // Stub window.fetch to capture map-style assets before they hit the network
    this.fetchStub = sinon.stub(window, 'fetch');

    this.fetchStub.callsFake(async (input, init) => {
      let url = input;
      if (typeof input === 'object' && input !== null && 'url' in input) {
        url = input.url;
      }

      if (typeof url === 'string' && url.includes('tiles.openfreemap.org')) {
        // A. Mock Style Sheet
        if (url.includes('/styles/liberty')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              version: 8,
              name: 'Mock Style',
              sources: {
                openmaptiles: {
                  type: 'vector',
                  tiles: [], // Empty tiles list prevents any map tile fetching completely!
                },
              },
              sprite: 'https://tiles.openfreemap.org/sprites/liberty',
              glyphs:
                'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
              layers: [
                {
                  id: 'background',
                  type: 'background',
                  paint: { 'background-color': '#f8f9fa' },
                },
              ],
            }),
          };
        }

        // B. Mock Sprite Atlas JSON
        if (url.endsWith('.json') && url.includes('/sprites/')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({}), // Empty sprite dictionary
          };
        }

        // C. Mock Sprite Atlas PNG (Returns a valid 1x1 transparent PNG)
        if (url.endsWith('.png') && url.includes('/sprites/')) {
          const bytes = new Uint8Array([
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0,
            0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 11, 73,
            68, 65, 84, 120, 156, 99, 96, 0, 0, 0, 2, 0, 1, 226, 33, 188, 51, 0,
            0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
          ]);
          const blob = new Blob([bytes], { type: 'image/png' });
          return {
            ok: true,
            status: 200,
            blob: async () => blob,
          };
        }

        // Catch-all mock for other openfreemap endpoints
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
        };
      }

      // Pass through to original fetch (e.g. Photon results, local mock APIs)
      return this.fetchStub.wrappedMethod(input, init);
    });
  });

  hooks.afterEach(function () {
    if (this.fetchStub && typeof this.fetchStub.restore === 'function') {
      this.fetchStub.restore();
    }
  });
}

// This file exists to provide wrappers around ember-qunit's
// test setup functions. This way, you can easily extend the setup that is
// needed per test type.

function setupApplicationTest(hooks, options) {
  upstreamSetupApplicationTest(hooks, options);
  setupNostrMocks(hooks);
  setupMapStyleMocks(hooks);

  // Additional setup for application tests can be done here.
  //
  // For example, if you need an authenticated session for each
  // application test, you could do:
  //
  // hooks.beforeEach(async function () {
  //   await authenticateSession(); // ember-simple-auth
  // });
  //
  // This is also a good place to call test setup functions coming
  // from other addons:
  //
  // setupIntl(hooks, 'en-us'); // ember-intl
  // setupMirage(hooks); // ember-cli-mirage
}

function setupRenderingTest(hooks, options) {
  upstreamSetupRenderingTest(hooks, options);
  setupNostrMocks(hooks);

  // Additional setup for rendering tests can be done here.
}

function setupTest(hooks, options) {
  upstreamSetupTest(hooks, options);
  setupNostrMocks(hooks);

  // Additional setup for unit tests can be done here.
}

export { setupApplicationTest, setupRenderingTest, setupTest };
