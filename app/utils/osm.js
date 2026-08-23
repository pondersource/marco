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

const PLACE_TYPE_KEYS = [
  'craft',
  'amenity',
  'shop',
  'tourism',
  'historic',
  'leisure',
  'office',
  'building',
  'landuse',
  'public_transport',
  'highway',
  'aeroway',
  'waterway',
  'natural',
  'place',
  'border_type',
  'admin_title',
];

export function getPlaceType(tags) {
  if (!tags) return null;

  let fallbackKey = null;

  for (const key of PLACE_TYPE_KEYS) {
    const value = tags[key];
    if (value) {
      if (value === 'yes') {
        if (!fallbackKey) {
          fallbackKey = key;
        }
        continue;
      }
      return humanizeOsmTag(value);
    }
  }

  if (fallbackKey) {
    return humanizeOsmTag(fallbackKey);
  }

  return null;
}
