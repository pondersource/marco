import { mapToStorageSchema } from 'marco/utils/place-mapping';
import { module, test } from 'qunit';

module('Unit | Utility | place-mapping', function () {
  test('it maps a raw place object to the storage schema', function (assert) {
    const rawPlace = {
      osmId: 12345,
      osmType: 'node',
      lat: 52.52,
      lon: 13.405,
      osmTags: {
        name: 'Test Place',
        website: 'https://example.com',
      },
      description: 'A test description',
    };

    const result = mapToStorageSchema(rawPlace);

    assert.strictEqual(result.title, 'Test Place');
    assert.strictEqual(result.lat, 52.52);
    assert.strictEqual(result.lon, 13.405);
    assert.strictEqual(result.osmId, '12345');
    assert.strictEqual(result.osmType, 'node');
    assert.strictEqual(result.url, 'https://example.com');
    assert.strictEqual(result.description, 'A test description');
    assert.deepEqual(result.osmTags, rawPlace.osmTags);
    assert.deepEqual(result.tags, []);
  });

  test('it prioritizes place.title over osmTags.name', function (assert) {
    const rawPlace = {
      osmId: 123,
      lat: 0,
      lon: 0,
      title: 'Custom Title',
      osmTags: {
        name: 'OSM Name',
      },
    };

    const result = mapToStorageSchema(rawPlace);
    assert.strictEqual(result.title, 'Custom Title');
  });

  test('it handles fallback title correctly when no name is present', function (assert) {
    const rawPlace = {
      id: 987,
      lat: 10,
      lon: 20,
      osmTags: {},
    };

    const result = mapToStorageSchema(rawPlace);
    assert.strictEqual(result.title, 'Untitled Place');
    assert.strictEqual(result.osmId, '987');
  });
});
