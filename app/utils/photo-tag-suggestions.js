import { POI_CATEGORIES } from './poi-categories';
import { getMatchingPoiCategoryIds } from './poi-category-matcher';

export const CATEGORY_TAGS = {
  restaurants: ['front', 'food', 'drinks', 'menu', 'vibe'],
  coffee: ['front', 'food', 'drinks', 'menu', 'vibe'],
  groceries: ['front', 'products'],
  'things-to-do': ['front', 'architecture', 'amenities', 'vibe'],
  accommodation: ['front', 'rooms', 'amenities', 'food', 'drinks', 'vibe'],
};

export function getSuggestedPhotoTags(place) {
  const osmTags = place?.osmTags || place?.tags || {};
  const categoryIds = getMatchingPoiCategoryIds(osmTags, POI_CATEGORIES);

  const suggested = [];
  for (const categoryId of categoryIds) {
    const tags = CATEGORY_TAGS[categoryId];
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      if (!suggested.includes(tag)) {
        suggested.push(tag);
      }
    }
  }

  if (suggested.length === 0) {
    return [];
  }

  return suggested;
}
