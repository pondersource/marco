# Project Status: Marco

**Last Updated:** Wed Jan 21 2026

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
- **Persistence:** Saves and restores map center and zoom level using `localStorage` (key: `marco:map-view`).
- **Controls:** Enabled standard OpenLayers Rotate control (re-north) and custom Locate control.

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
  - `places-sidebar.gjs`: Displays a list of nearby POIs.
  - `place-details.gjs`: Dedicated component for displaying rich place information.
    - **Features:** Icons (via `feather-icons`), Address, Phone, Website, Opening Hours, Cuisine, Wikipedia.
    - **Layout:** Polished UI with distinct sections for Actions and Meta info.
- **Geo Utils:**
  - `app/utils/geo.js`: Haversine distance calculations.
  - `app/utils/geohash-coverage.js`: Logic to calculate required 4-char geohash prefixes for a given bounding box.

### 4. Routing & Data Optimization

- **Explicit URLs:** Implemented routing support for specific OSM entities via `/place/osm:node:<id>` and `/place/osm:way:<id>`, distinguishing them from local bookmarks (ULIDs).
- **Data Normalization:** Refactored `OsmService` to return normalized objects (`osmTags`, `osmType`) for all queries. This ensures consistent data structures between fresh Overpass results and saved bookmarks throughout the app.
- **Performance:** Optimized navigation to prevent redundant network requests. Clicking a map pin passes the existing data object to the route, skipping the `model` hook (no re-fetch) while maintaining correct deep-linkable URLs via a custom `serialize` hook in `PlaceRoute`.

## Current State

- **Repo:** The app runs via `pnpm start`.
- **Workflow:**
  1.  User pans map -> `moveend` triggers `storage.loadPlacesInBounds`.
  2.  User clicks map -> "Pulse" animation -> hybrid hit detection (Visual Tile vs Overpass).
  3.  **Navigation:** Selected place is passed to the route (`transitionTo` with model), updating the URL to `/place/<id>` or `/place/osm:<type>:<id>` without re-fetching data.
  4.  Sidebar displays details via `<PlaceDetails>` component.
  5.  User clicks "Save Bookmark" -> Stores JSON in RemoteStorage.
  6.  RemoteStorage change event -> Debounced reload updates the map reactive-ly.

## Files Currently in Focus

- `app/components/place-details.gjs`: UI logic for place info.
- `app/routes/place.js`: Routing logic.
- `app/components/map.gjs`: Map rendering and interaction.
- `app/services/storage.js`: Data sync logic.

## Next Steps & Pending Tasks

1.  **App Header:** Implement a transparent header bar with the App Logo (left) and Login/User Info (right).
2.  **Edit Bookmarks:** Allow users to edit the title and description of saved places.
3.  **Performance:** Monitor performance with large datasets (thousands of bookmarks).
4.  **Testing:** Add automated tests for the geohash coverage and retry logic.

## Technical Constraints

- **Template Style:** Strict Mode GJS (`<template>`).
- **Package Manager:** `pnpm` for the main app, `npm` for the vendor module.
- **Visuals:** No Tailwind/Bootstrap; using custom CSS in `app/styles/app.css`.
