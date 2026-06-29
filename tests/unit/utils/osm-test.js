import { module, test } from 'qunit';
import { setupTest } from 'marco/tests/helpers';
import { getLocalizedName, getPlaceType } from 'marco/utils/osm';

module('Unit | Utility | osm', function (hooks) {
  setupTest(hooks);

  test('getLocalizedName returns default name if tags are missing', function (assert) {
    const result = getLocalizedName(null);
    assert.strictEqual(result, 'Untitled Place');
  });

  test('getLocalizedName returns name tag', function (assert) {
    const tags = { name: 'Foo' };
    const result = getLocalizedName(tags);
    assert.strictEqual(result, 'Foo');
  });

  test('getLocalizedName falls back to name:en if name is missing', function (assert) {
    const tags = { 'name:en': 'English Name' };
    const result = getLocalizedName(tags);
    assert.strictEqual(result, 'English Name');
  });

  test('getLocalizedName returns local name (name tag) if no preferred language match found', function (assert) {
    // Assuming the test environment doesn't have 'fr' as a preferred language
    const tags = { name: 'Local Name', 'name:fr': 'French Name' };
    // Temporarily mock navigator to ensure no match
    const originalLanguages = navigator.languages;
    const originalLanguage = navigator.language;
    Object.defineProperty(navigator, 'languages', {
      value: ['es'],
      configurable: true,
    });
    Object.defineProperty(navigator, 'language', {
      value: 'es',
      configurable: true,
    });

    try {
      const result = getLocalizedName(tags);
      assert.strictEqual(result, 'Local Name');
    } finally {
      // Restore
      Object.defineProperty(navigator, 'languages', {
        value: originalLanguages,
        configurable: true,
      });
      Object.defineProperty(navigator, 'language', {
        value: originalLanguage,
        configurable: true,
      });
    }
  });

  test('getLocalizedName matches user preferred language', function (assert) {
    const tags = {
      name: 'Standard Name',
      'name:de': 'Deutscher Name',
      'name:fr': 'Nom Français',
    };

    const originalLanguages = navigator.languages;
    Object.defineProperty(navigator, 'languages', {
      value: ['de', 'en'],
      configurable: true,
    });

    try {
      const result = getLocalizedName(tags);
      assert.strictEqual(result, 'Deutscher Name');
    } finally {
      Object.defineProperty(navigator, 'languages', {
        value: originalLanguages,
        configurable: true,
      });
    }
  });

  test('getPlaceType returns value for normal tags', function (assert) {
    const tags = { amenity: 'restaurant' };
    const result = getPlaceType(tags);
    assert.strictEqual(result, 'Restaurant');
  });

  test('getPlaceType returns key name if value is "yes"', function (assert) {
    const tags = { building: 'yes' };
    const result = getPlaceType(tags);
    assert.strictEqual(result, 'Building');
  });

  test('getPlaceType ignores generic "yes" values if a more specific tag is present', function (assert) {
    const tags = { historic: 'yes', building: 'tower' };
    const result = getPlaceType(tags);
    assert.strictEqual(result, 'Tower');
  });

  test('getPlaceType prioritizes order (amenity > shop > building)', function (assert) {
    // If something is both a shop and a building, it should be a shop
    const tags = { building: 'yes', shop: 'supermarket' };
    const result = getPlaceType(tags);
    assert.strictEqual(result, 'Supermarket');
  });

  test('getPlaceType returns null if no known type found', function (assert) {
    const tags = { foo: 'bar' };
    const result = getPlaceType(tags);
    assert.strictEqual(result, null);
  });
});
