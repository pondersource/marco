export function normalizeRelayUrl(url) {
  if (!url) return '';
  let normalized = url.trim().toLowerCase();
  if (!normalized) return '';

  if (!normalized.startsWith('ws://') && !normalized.startsWith('wss://')) {
    normalized = 'wss://' + normalized;
  }

  while (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

export function uniqNormalizedRelays(relays = []) {
  return Array.from(new Set(relays.map(normalizeRelayUrl).filter(Boolean)));
}

export function mergeRequiredRelays(requiredRelays = [], customRelays = []) {
  const requiredSet = new Set(requiredRelays.filter(Boolean));
  const merged = [...requiredRelays.filter(Boolean)];

  for (const relay of uniqNormalizedRelays(customRelays)) {
    if (!requiredSet.has(relay)) {
      merged.push(relay);
    }
  }

  return merged;
}

export function excludeRequiredRelays(customRelays = [], requiredRelays = []) {
  const requiredSet = new Set(requiredRelays.filter(Boolean));
  return uniqNormalizedRelays(customRelays).filter((relay) => {
    return !requiredSet.has(relay);
  });
}

/**
 * Extracts and normalizes photo data from NIP-360 (Place Photos) events.
 * Sorts chronologically and guarantees the first landscape photo (or first portrait) is at index 0.
 *
 * @param {Array} events NIP-360 events
 * @returns {Array} Array of photo objects
 */
export function parsePlacePhotos(events) {
  if (!events || events.length === 0) return [];

  // Sort by created_at ascending (oldest first)
  const sortedEvents = [...events].sort((a, b) => a.created_at - b.created_at);

  const allPhotos = [];

  for (const event of sortedEvents) {
    const eventTagValues = event.tags
      .filter((t) => t[0] === 't')
      .map((t) => t[1])
      .filter(Boolean);

    // Find all imeta tags
    const imetas = event.tags.filter((t) => t[0] === 'imeta');
    for (const imeta of imetas) {
      let url = null;
      let thumbUrl = null;
      let blurhash = null;
      let isLandscape = false;
      let aspectRatio = 16 / 9; // default
      let altText = null;
      let placeIdentifier = event.tags.find((t) => t[0] === 'i')?.[1];
      const publishedAtRaw = event.tags.find(
        (t) => t[0] === 'published_at'
      )?.[1];
      const publishedAt = publishedAtRaw ? Number(publishedAtRaw) : null;

      for (const tag of imeta.slice(1)) {
        if (tag.startsWith('url ')) {
          url = tag.substring(4);
        } else if (tag.startsWith('thumb ')) {
          thumbUrl = tag.substring(6);
        } else if (tag.startsWith('blurhash ')) {
          blurhash = tag.substring(9);
        } else if (tag.startsWith('dim ')) {
          const dimStr = tag.substring(4);
          const [width, height] = dimStr.split('x').map(Number);
          if (width && height) {
            aspectRatio = width / height;
            if (width > height) {
              isLandscape = true;
            }
          }
        } else if (tag.startsWith('alt ')) {
          const alt = tag.substring(4).trim();
          // Strip the legacy placeholder we used to write on every event
          altText = alt === 'A photo of a place' ? null : alt || null;
        }
      }

      if (url) {
        allPhotos.push({
          eventId: event.id,
          pubkey: event.pubkey,
          createdAt: event.created_at,
          publishedAt: publishedAt && publishedAt > 0 ? publishedAt : null,
          url,
          thumbUrl,
          blurhash,
          isLandscape,
          aspectRatio,
          placeIdentifier,
          tags: eventTagValues,
          alt: altText,
        });
      }
    }
  }

  if (allPhotos.length === 0) return [];

  // Find the first landscape photo
  const firstLandscapeIndex = allPhotos.findIndex((p) => p.isLandscape);

  if (firstLandscapeIndex > 0) {
    // Move the first landscape photo to the front
    const [firstLandscape] = allPhotos.splice(firstLandscapeIndex, 1);
    allPhotos.unshift(firstLandscape);
  }

  return allPhotos;
}
