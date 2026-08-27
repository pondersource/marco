# Relay Trust in Marco

## Purpose

Marco fetches Nostr content (currently kind 360 place photos, later kind 30360 reviews) from the user's read relays. Because anyone can run a relay and publish spam, Marco only displays content by default when it was seen on a **trusted relay** — a relay the user (or Marco's defaults) treats as sufficiently moderated.

## Trust Model

| Rule                     | Description                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Required relays**      | Always trusted (e.g. `wss://nostr.kosmos.org`). Cannot be untrusted.                                         |
| **Custom relays**        | Untrusted by default. Users toggle them to trusted in **Settings → Nostr → Read Relays**.                    |
| **Own content**          | Events authored by the connected user's pubkey are always trusted.                                           |
| **Non-content kinds**    | Kind 5 deletions and metadata always pass through unfiltered.                                                |
| **Provenance upgrades**  | If an event is first seen on an untrusted relay and later on a trusted one, it becomes visible.              |
| **Hiding, not blocking** | Untrusted content is cached and stored; it is filtered at presentation time so it can be revealed on demand. |

## How It Works Under the Hood

### 1. Provenance Capture

- Instead of `pool.request()` (which drops relay origin via an internal `map(m => m.event)`), Marco uses `RelayPool.req()` from `applesauce-relay`.
- Each `EVENT` message includes `from: relayUrl`.
- Every sighting is recorded in an in-memory map: `eventId → Set<relayUrl>`.
- Duplicate deliveries are _not_ deduplicated at the stream level, so full provenance across all responding relays is preserved.

### 2. Persistence

- Provenance is persisted to IndexedDB via `localForage` under the store `event-relay-provenance`.
- On app start, it is hydrated into memory so cached photos render instantly with correct trust state before relay connections are established.

### 3. Trust Evaluation

- `trustedRelays` = required read relays + `settings.nostrTrustedRelays` (user-marked custom relays).
- An event is trusted if any relay URL in its provenance set matches `trustedRelays` (compared via normalized URLs).
- Trust is evaluated when presenting the photo timeline for a place.

### 4. Presentation Filtering

- `NostrDataService.placePhotos` contains only trusted events.
- `untrustedContentCount` tracks how many are hidden.
- A session-only toggle `showUntrustedContent` reveals them via the "Show N hidden photo(s) (untrusted relays)" button in place details.

### 5. Deletions

- When a kind 5 deletion event enters the store, provenance entries for the referenced event IDs are removed from memory and IndexedDB.

## Key Code Paths

| File                                         | What it does                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app/services/nostr-data.js`                 | `_requestContentWithProvenance()`, `isTrustedEvent()`, `partitionByTrust()`, `trustedRelays` getter, provenance hydration/persistence |
| `app/services/settings.js`                   | `nostrTrustedRelays` setting (null = required relays only)                                                                            |
| `app/components/app-menu/settings/nostr.gjs` | Per-relay shield toggle in read-relay list                                                                                            |
| `app/components/place-details.gjs`           | Hidden-content reveal link in meta section                                                                                            |
| `app/utils/nostr.js`                         | `relayUrlMatches()` normalization/matching helper                                                                                     |
| `app/utils/icons.js`                         | `shield` icon used for trusted state                                                                                                  |
| `app/styles/app.css`                         | `.btn-trust-relay` styles in relay settings                                                                                           |

## Extending the Feature

- **Add kind 30360 reviews:** Add `30360` to `TRUSTED_CONTENT_KINDS` in `app/services/nostr-data.js`. Reuse `partitionByTrust` in the reviews timeline.
- **Followee trust:** Extend `isTrustedEvent()` to also check `event.pubkey` against a contact/follow list.
- **Spam eviction from cache:** Provenance data already supports this; future work can purge cached events from `nostr-idb` if they only appear on relays marked untrusted.
- **Provenance UI:** The stored `eventId → relayUrls` map can power a "Seen on these relays" tooltip or details pane.

## Known Limitations / Future Work

- Provenance store is currently unbounded; add LRU/TTL cleanup.
- Untrusting a relay hides its content immediately, but does not purge the `nostr-idb` event cache.
- Relay settings UI is currently the only way to manage trust; no global "trust all" toggle.
