import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';

module('Unit | Service | photon', function (hooks) {
  setupTest(hooks);

  test('it exists', function (assert) {
    let service = this.owner.lookup('service:photon');
    assert.ok(service);
  });

  test('search truncates coordinates to 4 decimal places', async function (assert) {
    let service = this.owner.lookup('service:photon');
    const originalFetch = window.fetch;

    let capturedUrl;
    window.fetch = async (url) => {
      capturedUrl = url;
      return {
        ok: true,
        json: async () => ({ features: [] }),
      };
    };

    try {
      await service.search('Test', 52.123456, 13.987654);
      assert.ok(
        capturedUrl.includes('lat=52.1235'),
        'lat is rounded to 4 decimals'
      );
      assert.ok(
        capturedUrl.includes('lon=13.9877'),
        'lon is rounded to 4 decimals'
      );
    } finally {
      window.fetch = originalFetch;
    }
  });

  test('search handles successful response', async function (assert) {
    let service = this.owner.lookup('service:photon');

    // Mock fetch
    const originalFetch = window.fetch;
    window.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                name: 'Test Place',
                osm_id: 123,
                osm_type: 'N',
                city: 'Test City',
                country: 'Test Country',
              },
              geometry: {
                coordinates: [13.4, 52.5], // lon, lat
              },
            },
          ],
        }),
      };
    };

    try {
      const results = await service.search('Test', 52.5, 13.4);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].title, 'Test Place');
      assert.strictEqual(results[0].lat, 52.5);
      assert.strictEqual(results[0].lon, 13.4);
      assert.strictEqual(results[0].description, 'Test City, Test Country');
      assert.strictEqual(results[0].osmType, 'node', 'Normalizes N to node');
    } finally {
      window.fetch = originalFetch;
    }
  });

  test('search handles empty response', async function (assert) {
    let service = this.owner.lookup('service:photon');

    // Mock fetch
    const originalFetch = window.fetch;
    window.fetch = async () => {
      return {
        ok: true,
        json: async () => ({ features: [] }),
      };
    };

    try {
      const results = await service.search('Nonexistent', 52.5, 13.4);
      assert.strictEqual(results.length, 0);
    } finally {
      window.fetch = originalFetch;
    }
  });

  test('normalizeFeature handles missing properties', function (assert) {
    let service = this.owner.lookup('service:photon');

    const feature = {
      properties: {
        street: 'Main St',
        housenumber: '123',
        city: 'Metropolis',
      },
      geometry: {
        coordinates: [10, 20],
      },
    };

    const result = service.normalizeFeature(feature);
    assert.strictEqual(result.title, 'Main St 123, Metropolis'); // Fallback to address description
    assert.strictEqual(result.lat, 20);
    assert.strictEqual(result.lon, 10);
  });

  test('normalizeFeature normalizes OSM types correctly', function (assert) {
    let service = this.owner.lookup('service:photon');

    const checkType = (input, expected) => {
      const feature = {
        properties: { osm_type: input, name: 'Test' },
        geometry: { coordinates: [0, 0] },
      };
      const result = service.normalizeFeature(feature);
      assert.strictEqual(result.osmType, expected, `${input} -> ${expected}`);
    };

    checkType('N', 'node');
    checkType('W', 'way');
    checkType('R', 'relation');
    checkType('unknown', 'unknown'); // Fallback
  });
});
