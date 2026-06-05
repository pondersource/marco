import { module, test } from 'qunit';
import { POI_CATEGORIES } from 'marco/utils/poi-categories';
import { getMatchingPoiCategoryIds } from 'marco/utils/poi-category-matcher';
import {
  getSuggestedPhotoTags,
  CATEGORY_TAGS,
} from 'marco/utils/photo-tag-suggestions';

module('Unit | Utility | photo-tag-suggestions', function () {
  test('returns tags for all matching categories with de-duplication', function (assert) {
    const place = { osmTags: { amenity: 'cafe' } };
    const categoryIds = getMatchingPoiCategoryIds(
      place.osmTags,
      POI_CATEGORIES
    );

    assert.ok(categoryIds.includes('restaurants'));
    assert.ok(categoryIds.includes('coffee'));

    const result = getSuggestedPhotoTags(place);
    assert.deepEqual(result, CATEGORY_TAGS.restaurants);
  });

  test('returns no tags when no category matches', function (assert) {
    const place = { osmTags: { office: 'lawyer' } };
    const result = getSuggestedPhotoTags(place);

    assert.deepEqual(result, []);
  });
});
