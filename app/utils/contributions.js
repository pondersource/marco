/**
 * Utilities for grouping the user's Nostr contribution events into timeline entries.
 *
 * A contribution "entry" groups one or more related Nostr events that are part of the
 * same logical action (e.g. uploading several photos of the same place in quick
 * succession). Entries are ordered newest-first.
 */

import { tracked } from '@glimmer/tracking';

const HOUR_IN_SECONDS = 60 * 60;

/**
 * A single contribution timeline entry.
 *
 * `placeName` and `placeNameLoading` are tracked so that mutating them after
 * the entry has been rendered (e.g. when the background OSM batch fetch
 * resolves a place name) re-renders the consuming component. The remaining
 * fields are static data and do not need to be tracked.
 */
export class ContributionEntry {
  type = 'photo';
  placeIdentifier;
  osmType;
  osmId;
  photos;
  createdAt;
  eventCount;
  @tracked placeName = null;
  @tracked placeNameLoading = true;

  constructor({
    placeIdentifier,
    osmType,
    osmId,
    photos,
    createdAt,
    eventCount,
  }) {
    this.placeIdentifier = placeIdentifier;
    this.osmType = osmType;
    this.osmId = osmId;
    this.photos = photos;
    this.createdAt = createdAt;
    this.eventCount = eventCount;
  }
}

/**
 * Parses a single kind 360 (Place Photo) event's `imeta` tag into a photo object.
 * Reuses the same field shape as `parsePlacePhotos` in `utils/nostr.js` but operates
 * on a single event (the NIP mandates exactly one `imeta` tag per event).
 *
 * @param {object} event A NIP-360 (kind 360) Nostr event
 * @returns {object|null} A photo object, or null if no usable `imeta` was found
 */
function parsePhotoFromEvent(event) {
  const tags = event.tags || [];

  const eventTags = tags
    .filter((t) => t[0] === 't')
    .map((t) => t[1])
    .filter(Boolean);

  const imeta = tags.find((t) => t[0] === 'imeta');
  if (!imeta) return null;

  let url = null;
  let thumbUrl = null;
  let blurhash = null;
  let isLandscape = false;
  let aspectRatio = 16 / 9;
  let altText = null;

  for (const tag of imeta.slice(1)) {
    if (tag.startsWith('url ')) {
      url = tag.substring(4);
    } else if (tag.startsWith('thumb ')) {
      thumbUrl = tag.substring(6);
    } else if (tag.startsWith('blurhash ')) {
      blurhash = tag.substring(9);
    } else if (tag.startsWith('dim ')) {
      const [width, height] = tag.substring(4).split('x').map(Number);
      if (width && height) {
        aspectRatio = width / height;
        if (width > height) isLandscape = true;
      }
    } else if (tag.startsWith('alt ')) {
      const alt = tag.substring(4).trim();
      altText = alt === 'A photo of a place' ? null : alt || null;
    }
  }

  if (!url) return null;

  const placeIdentifier = tags.find((t) => t[0] === 'i')?.[1];

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    url,
    thumbUrl,
    blurhash,
    isLandscape,
    aspectRatio,
    placeIdentifier,
    tags: eventTags,
    alt: altText,
  };
}

/**
 * Applies kind 5 deletion events to a list of kind 360 events, returning the
 * surviving kind 360 events.
 *
 * @param {Array} events Mixed kind 360 and kind 5 events
 * @returns {Array} Surviving kind 360 events
 */
function applyDeletions(events) {
  const deletedIds = new Set();
  for (const event of events) {
    if (event.kind === 5) {
      for (const tag of event.tags || []) {
        if (tag[0] === 'e' && tag[1]) deletedIds.add(tag[1]);
      }
    }
  }
  return events.filter(
    (event) => event.kind === 360 && !deletedIds.has(event.id)
  );
}

/**
 * Groups kind 360 (Place Photo) events into contribution entries.
 *
 * Grouping rules:
 *   1. Events are grouped by their OSM entity identifier (the `i` tag).
 *   2. Within an entity, events are sub-grouped by time proximity: a new
 *      sub-group starts whenever the gap between two consecutive events
 *      exceeds `thresholdHours`.
 *   3. Each sub-group becomes a single contribution entry with one or more
 *      photos, sorted by `created_at` descending (newest entry first).
 *
 * @param {Array} events Mixed kind 360 / kind 5 events from the user
 * @param {number} [thresholdHours=3] Max gap in hours within a sub-group
 * @returns {Array} Sorted contribution entries (newest first)
 */
export function groupPhotoContributions(events, thresholdHours = 3) {
  if (!events || events.length === 0) return [];

  const photoEvents = applyDeletions(events);
  if (photoEvents.length === 0) return [];

  // Group by OSM entity identifier
  const byEntity = new Map();
  for (const event of photoEvents) {
    const entityTag = (event.tags || []).find((t) => t[0] === 'i');
    const entityId = entityTag?.[1];
    if (!entityId) continue;

    if (!byEntity.has(entityId)) byEntity.set(entityId, []);
    byEntity.get(entityId).push(event);
  }

  const thresholdSeconds = thresholdHours * HOUR_IN_SECONDS;
  const entries = [];

  for (const [entityId, entityEvents] of byEntity) {
    // Sort newest-first within the entity
    const sorted = [...entityEvents].sort(
      (a, b) => b.created_at - a.created_at
    );

    // Walk newest -> oldest, starting a new sub-group when the gap to the
    // previous event exceeds the threshold.
    let currentGroup = [];
    let prevTime = null;

    for (const event of sorted) {
      if (prevTime !== null && prevTime - event.created_at > thresholdSeconds) {
        entries.push(buildEntry(entityId, currentGroup));
        currentGroup = [];
      }
      currentGroup.push(event);
      prevTime = event.created_at;
    }
    if (currentGroup.length > 0) {
      entries.push(buildEntry(entityId, currentGroup));
    }
  }

  // Sort entries by their newest event's created_at, descending. Entries with
  // no usable photos (e.g. malformed imeta) are filtered out.
  return entries
    .filter((e) => e.photos.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Builds a single contribution entry object from a group of events for the
 * same OSM entity.
 *
 * @param {string} placeIdentifier e.g. "osm:node:123456"
 * @param {Array} events Kind 360 events in this sub-group
 * @returns {object} Contribution entry
 */
function buildEntry(placeIdentifier, events) {
  const photos = events
    .map(parsePhotoFromEvent)
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);

  const createdAt = events.reduce(
    (max, e) => (e.created_at > max ? e.created_at : max),
    0
  );

  const [, osmType, osmId] = placeIdentifier.split(':');

  return new ContributionEntry({
    placeIdentifier,
    osmType,
    osmId,
    photos,
    createdAt,
    eventCount: events.length,
  });
}
