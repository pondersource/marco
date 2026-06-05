import { POI_CATEGORIES } from './poi-categories';
import { getMatchingPoiCategoryIds } from './poi-category-matcher';

export const CATEGORY_TAGS = {
  restaurants: ['food', 'menu', 'vibe', 'front'],
  coffee: ['food', 'menu', 'vibe', 'front'],
  groceries: ['front', 'food'],
  'things-to-do': ['architecture', 'amenities', 'vibe', 'front'],
  accommodation: ['rooms', 'amenities', 'food', 'vibe', 'front'],
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
