/**
 * Utilities for parsing social activity events into timeline entries.
 *
 * An `ActivityEntry` represents a single social interaction related to the
 * user's content (e.g. a zap received on one of their photos). Entries are
 * ordered newest-first.
 */

import { tracked } from '@glimmer/tracking';
import {
  getZapSender,
  getZapRecipient,
  getZapPayment,
  getZapEventPointer,
  getZapRequest,
} from 'applesauce-common/helpers';
import { parsePhotoFromEvent, applyDeletions } from './contributions';

/**
 * A single activity timeline entry.
 *
 * `senderName`, `senderAvatar`, `senderProfileLoading`, `placeName`,
 * and `placeNameLoading` are tracked so the row re-renders when the sender's
 * profile or place name is resolved asynchronously.
 */
export class ActivityEntry {
  type = 'zap';
  photoEventId;
  photo;
  photos = [];
  placeIdentifier;
  osmType;
  osmId;
  senderPubkey;
  amountSats;
  message;
  createdAt;
  @tracked senderName = null;
  @tracked senderAvatar = null;
  @tracked senderProfileLoading = true;
  @tracked placeName = null;
  @tracked placeNameLoading = true;

  constructor({
    photoEventId,
    photo,
    photos,
    placeIdentifier,
    osmType,
    osmId,
    senderPubkey,
    amountSats,
    message,
    createdAt,
  }) {
    this.photoEventId = photoEventId;
    this.photo = photo;
    this.photos = photos ?? [];
    this.placeIdentifier = placeIdentifier;
    this.osmType = osmType;
    this.osmId = osmId;
    this.senderPubkey = senderPubkey;
    this.amountSats = amountSats;
    this.message = message;
    this.createdAt = createdAt;
  }
}

// TODO: Place-name resolution. Add a shared place-name-resolver util co-used by
// services/contributions.js and this service. Each ActivityEntry should get
// @tracked placeName / placeNameLoading, resolved via the existing cascade
// (bookmarks → localForage cache → osm cache → batch OSM fetch). Extract from
// contributions.js rather than duplicating.

/**
 * Parses a kind 9735 (Zap Receipt) event into an `ActivityEntry`, given the
 * user's pubkey (to confirm they are the recipient).
 *
 * Returns `null` if the receipt is malformed, not directed at the user, or
 * does not reference a zapped event (kind 360 photo).
 *
 * @param {object} receipt A NIP-57 zap receipt event (kind 9735)
 * @param {string} userPubkey The logged-in user's pubkey
 * @returns {ActivityEntry|null}
 */
export function parseZapReceipt(receipt, userPubkey) {
  if (!receipt || receipt.kind !== 9735) return null;

  const recipient = getZapRecipient(receipt);
  if (!recipient || recipient !== userPubkey) return null;

  const sender = getZapSender(receipt);
  if (!sender) return null;

  const payment = getZapPayment(receipt);
  if (!payment || !payment.amount) return null;
  const amountSats = Math.round(payment.amount / 1000);

  const eventPointer = getZapEventPointer(receipt);
  if (!eventPointer || !eventPointer.id) return null;

  const zapRequest = getZapRequest(receipt);
  const message = zapRequest?.content || null;

  return new ActivityEntry({
    photoEventId: eventPointer.id,
    photo: null,
    placeIdentifier: null,
    senderPubkey: sender,
    amountSats,
    message,
    createdAt: receipt.created_at,
  });
}

/**
 * Enriches an `ActivityEntry` with photo and place data from the zapped kind
 * 360 event, if it is available in the store.
 *
 * Returns `true` if the entry was enriched (i.e. the zapped event was found
 * and is a kind 360 authored by the user), or `false` if the entry should be
 * discarded (the zapped event is not one of the user's photos).
 *
 * @param {ActivityEntry} entry
 * @param {object} store The applesauce EventStore to look up the zapped event
 * @param {string} userPubkey The logged-in user's pubkey
 * @returns {boolean}
 */
export function enrichWithPhoto(entry, store, userPubkey) {
  const event = store.getEvent?.(entry.photoEventId);
  if (!event || event.kind !== 360 || event.pubkey !== userPubkey) {
    return false;
  }

  const photo = parsePhotoFromEvent(event);
  if (!photo) return false;

  entry.photo = photo;
  entry.placeIdentifier = photo.placeIdentifier || null;

  // Parse osmType and osmId from placeIdentifier (e.g. "osm:node:123" → "node", "123")
  if (entry.placeIdentifier) {
    const [, osmType, osmId] = entry.placeIdentifier.split(':');
    entry.osmType = osmType;
    entry.osmId = osmId;
  }

  return true;
}

const HOUR_IN_SECONDS = 60 * 60;

/**
 * Builds a single `ActivityEntry` (type 'photo') from a group of kind 360
 * events by the same author for the same OSM entity.
 *
 * @param {Array} events Kind 360 events in this sub-group (same author + place)
 * @returns {ActivityEntry}
 */
function buildSocialEntry(events) {
  const photos = events
    .map(parsePhotoFromEvent)
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);

  const createdAt = events.reduce(
    (max, e) => (e.created_at > max ? e.created_at : max),
    0
  );

  const placeIdentifier =
    events[0].tags?.find((t) => t[0] === 'i')?.[1] || null;

  let osmType;
  let osmId;
  if (placeIdentifier) {
    const parts = placeIdentifier.split(':');
    osmType = parts[1];
    osmId = parts[2];
  }

  const entry = new ActivityEntry({
    photo: photos[0] || null,
    photos,
    placeIdentifier,
    osmType,
    osmId,
    senderPubkey: events[0].pubkey,
    createdAt,
  });
  entry.type = 'photo';
  return entry;
}

/**
 * Groups kind 360 (Place Photo) events from followed contacts into activity
 * entries, keyed by (author + OSM entity + time proximity).
 *
 * This mirrors the time-proximity grouping logic from `groupPhotoContributions`
 * in `utils/contributions.js` but adds author as a grouping dimension so that
 * "Alice added 3 photos to Central Park Café" is one entry.
 *
 * @param {Array} events Mixed kind 360 / kind 5 events from followed contacts
 * @param {number} [thresholdHours=3] Max gap in hours within a sub-group
 * @returns {Array} Sorted `ActivityEntry` entries (newest first)
 */
export function groupSocialPhotos(events, thresholdHours = 3) {
  if (!events || events.length === 0) return [];

  const photoEvents = applyDeletions(events);
  if (photoEvents.length === 0) return [];

  // Group by (author pubkey + OSM entity identifier)
  const byAuthorEntity = new Map();
  for (const event of photoEvents) {
    const entityTag = (event.tags || []).find((t) => t[0] === 'i');
    const entityId = entityTag?.[1];
    if (!entityId) continue;

    const key = `${event.pubkey}:${entityId}`;
    if (!byAuthorEntity.has(key)) byAuthorEntity.set(key, []);
    byAuthorEntity.get(key).push(event);
  }

  const thresholdSeconds = thresholdHours * HOUR_IN_SECONDS;
  const entries = [];

  for (const [, groupEvents] of byAuthorEntity) {
    // Sort newest-first within the group
    const sorted = [...groupEvents].sort((a, b) => b.created_at - a.created_at);

    // Walk newest -> oldest, starting a new sub-group when the gap to the
    // previous event exceeds the threshold.
    let currentGroup = [];
    let prevTime = null;

    for (const event of sorted) {
      if (prevTime !== null && prevTime - event.created_at > thresholdSeconds) {
        entries.push(buildSocialEntry(currentGroup));
        currentGroup = [];
      }
      currentGroup.push(event);
      prevTime = event.created_at;
    }
    if (currentGroup.length > 0) {
      entries.push(buildSocialEntry(currentGroup));
    }
  }

  // Sort entries by their newest event's created_at, descending. Entries with
  // no usable photos (e.g. malformed imeta) are filtered out.
  return entries
    .filter((e) => e.photos.length > 0)
    .sort((a, b) => b.createdAt - a.createdAt);
}
