import { getIconNameForTags, POI_ICON_RULES } from 'marco/utils/osm-icons';
import { getIcon } from 'marco/utils/icons';
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

  test('it returns shopping-bag for unknown shop types (catch-all)', function (assert) {
    let result = getIconNameForTags({ shop: 'unknown_shop_type' });
    assert.strictEqual(result, 'shopping-bag');
  });

  test('it returns null for unknown tags', function (assert) {
    let result = getIconNameForTags({ foo: 'bar' });
    assert.strictEqual(result, null);
  });

  test('all icons used in POI_ICON_RULES exist in the icons utility', function (assert) {
    for (let rule of POI_ICON_RULES) {
      let icon = getIcon(rule.icon);
      assert.ok(
        icon,
        `Icon "${rule.icon}" specified in POI_ICON_RULES should be imported and available in getIcon`
      );
    }
  });
});
