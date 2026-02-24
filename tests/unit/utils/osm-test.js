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
