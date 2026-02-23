import { humanizeOsmTag } from './format-text';

export function getLocalizedName(tags, defaultName = 'Untitled Place') {
  if (!tags) return defaultName;

  // 1. Get user's preferred languages
  const languages = navigator.languages || [navigator.language || 'en'];

  // 2. Try to find a match for each preferred language
  for (const lang of languages) {
    if (!lang) continue;

    // Handle "en-US", "de-DE", etc. -> look for "name:en", "name:de"
    const shortLang = lang.split('-')[0];
    const tagKey = `name:${shortLang}`;

    if (tags[tagKey]) {
      return tags[tagKey];
    }
  }

  // 3. Fallback to standard "name"
  if (tags.name) {
    return tags.name;
  }

  // 4. Fallback to "name:en" (common in international places without local name)
  if (tags['name:en']) {
    return tags['name:en'];
  }

  // 5. Final fallback
  return defaultName;
}

export function getPlaceType(tags) {
  if (!tags) return null;

  const rawType =
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.historic ||
    tags.office ||
    tags.craft ||
    tags.building ||
    tags.landuse ||
    tags.place ||
    tags.natural ||
    tags.public_transport ||
    tags.aeroway ||
    tags.waterway ||
    tags.border_type ||
    tags.admin_title;

  return humanizeOsmTag(rawType);
}
