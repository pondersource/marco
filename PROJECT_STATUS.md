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
- **Storage Path:** `places/<geohash-prefix-6>/<ulid>` (groups places by location).
- **Dependencies:** Uses `ulid` and `latlon-geohash` internally (bundled via `npm run build`).
- **Fixes:** Refactored to `async/await`, removed manual `try/catch` validation, and added logic to strip `undefined` fields to satisfy RemoteStorage validation.

### 3. App Infrastructure

- **Services:**
  - `storage.js`: Initializes RemoteStorage, claims access, enables caching, and sets up the widget.
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
- **Recent Fixes:** Corrected an issue where saving failed due to `undefined` URL fields. Added `osmId` to the schema and sidebar UI.

## Files Currently in Focus

- `vendor/remotestorage-module-places/src/places.ts`: The data module logic (schema, pathing, storage). **Requires `npm run build` in this directory after changes.**
- `app/components/map.gjs`: Map rendering and click interaction logic.
- `app/components/places-sidebar.gjs`: UI for listing POIs and saving them.
- `app/services/storage.js`: RemoteStorage configuration.

## Next Steps & Pending Tasks

1.  **Rendering Bookmarks:** We are saving places, but **not yet displaying them on the map**. We need to fetch stored places from RemoteStorage (likely via `listByPrefix` based on the current map view) and render them as markers on the OpenLayers map.
2.  **UI Feedback:** Verify the "Save" action gives better visual feedback than `alert()`.
3.  **Widget:** The RemoteStorage widget attachment code in `storage.js` is currently commented out; it needs to be enabled or properly placed in the UI.
4.  **Refinement:** The `osmId` property was just added; verify the link in the sidebar works correctly.

## Technical Constraints

- **Template Style:** Strict Mode GJS (`<template>`).
- **Package Manager:** `pnpm` for the main app, `npm` for the vendor module.
- **Visuals:** No Tailwind/Bootstrap; using custom CSS in `app/styles/app.css`.
