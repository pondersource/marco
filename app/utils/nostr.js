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
    // Find all imeta tags
    const imetas = event.tags.filter((t) => t[0] === 'imeta');
    for (const imeta of imetas) {
      let url = null;
      let thumbUrl = null;
      let blurhash = null;
      let isLandscape = false;
      let aspectRatio = 16 / 9; // default

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
        }
      }

      if (url) {
        allPhotos.push({
          eventId: event.id,
          pubkey: event.pubkey,
          createdAt: event.created_at,
          url,
          thumbUrl,
          blurhash,
          isLandscape,
          aspectRatio,
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
