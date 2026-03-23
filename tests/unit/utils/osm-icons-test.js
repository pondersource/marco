import { getIconNameForTags } from 'marco/utils/osm-icons';
import { module, test } from 'qunit';

module('Unit | Utility | osm-icons', function () {
  test('it returns molar-tooth for amenity=dentist', function (assert) {
    let result = getIconNameForTags({ amenity: 'dentist' });
    assert.strictEqual(result, 'molar-tooth');
  });

  test('it returns molar-tooth for healthcare=dentist', function (assert) {
    let result = getIconNameForTags({ healthcare: 'dentist' });
    assert.strictEqual(result, 'molar-tooth');
  });

  test('it returns greek-cross for healthcare=hospital (catch-all)', function (assert) {
    let result = getIconNameForTags({ healthcare: 'hospital' });
    assert.strictEqual(result, 'greek-cross');
  });

  test('it returns greek-cross for healthcare=yes (catch-all)', function (assert) {
    let result = getIconNameForTags({ healthcare: 'yes' });
    assert.strictEqual(result, 'greek-cross');
  });

  test('it returns shopping-basket for known shop types like convenience', function (assert) {
    let result = getIconNameForTags({ shop: 'convenience' });
    assert.strictEqual(result, 'shopping-basket');
  });

  test('it returns shopping-basket for unknown shop types (catch-all)', function (assert) {
    let result = getIconNameForTags({ shop: 'unknown_shop_type' });
    assert.strictEqual(result, 'shopping-basket');
  });

  test('it returns null for unknown tags', function (assert) {
    let result = getIconNameForTags({ foo: 'bar' });
    assert.strictEqual(result, null);
  });
});
