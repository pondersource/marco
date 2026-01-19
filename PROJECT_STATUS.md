# Project Status: Marco

**Last Updated:** Mon Jan 19 2026

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
- **Optimization:** Added **10px hit tolerance** for easier tapping on mobile devices.
- **Visuals:** Increased bookmark marker size (Radius 9px) and added a subtle drop shadow.
- **Feedback:** Implemented a "pulse" animation (via OpenLayers Overlay) at the click location to visualize the search radius (30m/50m).
- **Mobile UX:** Disabled browser tap highlights (`-webkit-tap-highlight-color: transparent`) to prevent blue flashing on Android.
- **Geolocation ("Locate Me"):**
  - Implemented a "Locate Me" button with robust tracking logic.
  - **Dynamic Zoom:** Automatically zooms to a level where the accuracy circle covers ~10% of the map (fallback logic handles missing accuracy data).
  - **Smart Pulse:** Displays a pulsing blue circle during the search phase.
  - **Auto-Stop:** Pulse and tracking automatically stop when high accuracy (≤20m) is achieved or after a 10s timeout.

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
    - **Optimization:** Implemented **Debounced Reload** (200ms) for bookmark updates to handle rapid change events efficiently.
    - **Optimization:** Correctly handles deletion/updates by clearing stale data for reloaded geohash sectors.
  - `osm.js`: Fetches nearby POIs from Overpass API.
    - **Reliability:** Implemented `fetchWithRetry` to handle HTTP 504/502/503 timeouts and 429 rate limits, in addition to network errors.
- **UI Components:**
  - `places-sidebar.gjs`: Displays a list of nearby POIs. Allows selecting a place to view details and saving it as a bookmark. Links to the OSM website via the node ID.
- **Geo Utils:**
  - `app/utils/geo.js`: Haversine distance calculations.
  - `app/utils/geohash-coverage.js`: Logic to calculate required 4-char geohash prefixes for a given bounding box.

## Current State

- **Repo:** The app runs via `pnpm start`.
- **Workflow:**
  1.  User pans map -> `moveend` triggers `storage.loadPlacesInBounds`, fetching only new geohash prefixes.
  2.  User clicks map -> "Pulse" animation shows search area.
  3.  Sidebar opens with POI details (heuristic match) or list.
  4.  User clicks "Save Bookmark" -> Stores JSON in RemoteStorage.
  5.  RemoteStorage change event -> Debounced reload updates the map reactive-ly.

## Files Currently in Focus

- `app/components/map.gjs`: Map rendering, event handling, and UI feedback.
- `app/services/storage.js`: Data sync logic and caching strategy.

## Next Steps & Pending Tasks

1.  **App Header:** Implement a transparent header bar with the App Logo (left) and Login/User Info (right).
2.  **Persist View:** Store the current map center and zoom level in `localStorage` to restore the view upon re-opening the app.
3.  **Edit Bookmarks:** Allow users to edit the title and description of saved places.
4.  **Refine UI/UX:** Further polish sidebar interactions and mobile responsiveness.
5.  **Performance:** Monitor performance with large datasets (thousands of bookmarks).
6.  **Testing:** Add automated tests for the geohash coverage and retry logic.

## Technical Constraints

- **Template Style:** Strict Mode GJS (`<template>`).
- **Package Manager:** `pnpm` for the main app, `npm` for the vendor module.
- **Visuals:** No Tailwind/Bootstrap; using custom CSS in `app/styles/app.css`.
