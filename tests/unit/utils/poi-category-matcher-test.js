import { module, test } from 'qunit';
import { POI_CATEGORIES } from 'marco/utils/poi-categories';
import {
  getMatchingPoiCategories,
  getMatchingPoiCategoryIds,
} from 'marco/utils/poi-category-matcher';

module('Unit | Utility | poi-category-matcher', function () {
  test('matches multiple categories from OSM tags', function (assert) {
    const tags = { amenity: 'cafe' };
    const categoryIds = getMatchingPoiCategoryIds(tags, POI_CATEGORIES);

    assert.ok(categoryIds.includes('restaurants'));
    assert.ok(categoryIds.includes('coffee'));
  });

  test('supports semicolon-separated values', function (assert) {
    const tags = { amenity: 'cafe;bar' };
    const categoryIds = getMatchingPoiCategoryIds(tags, POI_CATEGORIES);

    assert.ok(categoryIds.includes('coffee'));
  });

  test('negative regex clause fails if any value matches', function (assert) {
    const tags = { amenity: 'cafe', cuisine: 'coffee;irish' };
    const categoryIds = getMatchingPoiCategoryIds(tags, POI_CATEGORIES);

    assert.notOk(categoryIds.includes('restaurants'));
  });

  test('presence clause matches when tag exists', function (assert) {
    const tags = { historic: 'castle' };
    const categories = getMatchingPoiCategories(tags, POI_CATEGORIES);
    const categoryIds = categories.map((category) => category.id);

    assert.ok(categoryIds.includes('things-to-do'));
  });
});
