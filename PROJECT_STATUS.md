# Project Status: Marco

**Last Updated:** Fri Jan 16 2026

## Project Context

We are building **Marco**, a decentralized maps application using **Ember.js** (Octane/Polaris edition with GJS/GLIMMER), **Vite**, and **OpenLayers**. The core feature is storing place bookmarks in **RemoteStorage.js**, using a custom module structure.

## What We Have Done

### 1. Map Integration

- Set up OpenLayers in `app/components/map.gjs` (class-based component).
- Switched tiles to **OpenFreeMap Liberty** style (supports vector POIs).
- Implemented a hybrid click handler:
  - Detects clicks on visual vector tiles.
  - Falls back to fetching authoritative data from an **Overpass API** service.
  - Uses a **heuristic** (distance + type matching) to link visual clicks to API results (handling data desynchronization).

### 2. RemoteStorage Module (`@remotestorage/module-places`)

- Created a custom TypeScript module in `vendor/remotestorage-module-places/`.
- **Schema:** `place` object containing `id` (ULID), `title`, `lat`, `lon`, `geohash`, `osmId`, `url`, etc.
- **Storage Path:** Nested `<2-char>/<2-char>/<id>` (based on geohash) for scalability.
- **API:**
  - `getPlaces(prefixes?)`: efficient partial loading of specific sectors (or full recursive scan if no prefixes provided).
  - Uses `getListing` for directory traversal and `getAll` for object retrieval.
  - configured with `maxAge: false` to ensure data freshness.
- **Dependencies:** Uses `ulid` and `latlon-geohash` internally.

### 3. App Infrastructure

- **Services:**
  - `storage.js`: Initializes RemoteStorage, claims access, enables caching, and sets up the widget. Consumes the new `getPlaces` API.
  - `osm.js`: Fetches nearby POIs from Overpass API.
- **UI Components:**
  - `places-sidebar.gjs`: Displays a list of nearby POIs. Allows selecting a place to view details and saving it as a bookmark. Links to the OSM website via the node ID.
- **Geo Utils:** Added `app/utils/geo.js` for Haversine distance calculations.

## Current State

- **Repo:** The app runs via `pnpm start`.
- **Workflow:**
  1.  User clicks map -> Sidebar opens.
  2.  If a POI is matched heuristically, it opens "Details" directly.
  3.  Otherwise, it lists nearby places.
  4.  User clicks "Save Bookmark" -> Stores JSON in RemoteStorage.
- **Recent Fixes:**
  - Refactored RemoteStorage module to use nested directory structures.
  - Fixed `getListing` usage to correctly parse the `items` object from the RemoteStorage spec.

## Files Currently in Focus

- `app/services/osm.js`: **NEXT TARGET.** Needs optimization to handle timeouts.
- `vendor/remotestorage-module-places/src/places.ts`: Recently refactored.
- `app/components/map.gjs`: Map rendering and bookmark loading.

## Next Steps & Pending Tasks

1.  **Optimize Overpass API:** The current implementation is timing out frequently. We need to optimize the query or fetch strategy.
2.  **Viewport-based Loading:** Implement logic in the map component to calculate visible geohash prefixes and pass them to `storage.getPlaces()` for efficient partial loading.
3.  **UI Feedback:** Verify the "Save" action gives better visual feedback than `alert()`.

## Technical Constraints

- **Template Style:** Strict Mode GJS (`<template>`).
- **Package Manager:** `pnpm` for the main app, `npm` for the vendor module.
- **Visuals:** No Tailwind/Bootstrap; using custom CSS in `app/styles/app.css`.
