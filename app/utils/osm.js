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
