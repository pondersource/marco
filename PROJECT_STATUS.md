# Project Status: Marco

**Last Updated:** Mon Jan 26 2026

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
  - **Logic Upgrade:** Map intelligently detects if _any_ sidebar/pane is open and handles outside clicks to close them instead of initiating new searches.
- **Optimization:** Added **10px hit tolerance** for easier tapping on mobile devices.
- **Visuals:** Increased bookmark marker size (Radius 9px) and added a subtle drop shadow.
- **Feedback:** Implemented a "pulse" animation (via OpenLayers Overlay) at the click location to visualize the search radius (30m/50m).
- **Mobile UX:**
  - **Touch:** Disabled browser tap highlights (`-webkit-tap-highlight-color: transparent`) to prevent blue flashing on Android.
  - **Scroll:** Disabled "pull-to-refresh" (`overscroll-behavior: none`) on the body to prevent accidental reloads while keeping the sidebar scrollable (`contain`).
  - **Auto-Pan:** On mobile screens, if a selected pin is obscured by the bottom sheet, the map automatically pans to center the pin in the visible top half of the screen.
  - **Controls:** Fixed positioning of "Locate" and "Rotate" buttons on mobile by correcting CSS `inset` syntax.
  - **iOS Polish:**
    - Prevented input auto-zoom by ensuring `.form-control` font size is `1rem` (16px).
    - Added `-webkit-text-size-adjust: 100%` to prevent text inflation on rotation.
    - Set base `body` font size to `16px`.
- **Geolocation ("Locate Me"):**
  - Implemented a "Locate Me" button with robust tracking logic.
  - **Dynamic Zoom:** Automatically zooms to a level where the accuracy circle covers ~10% of the map (fallback logic handles missing accuracy data).
  - **Smart Pulse:** Displays a pulsing blue circle during the search phase.
  - **Auto-Stop:** Pulse and tracking automatically stop when high accuracy (≤20m) is achieved or after a 10s timeout.
- **Persistence:** Saves and restores map center and zoom level using `localStorage` (key: `marco:map-view`).
- **Controls:** Enabled standard OpenLayers Rotate control (re-north) and custom Locate control.
- **Pin Animation:** Selected pins are highlighted with a custom **Red Pin** overlay that drops in with an animation. The center dot is styled as a solid dark red circle (`#b31412`).

### 2. RemoteStorage Module (`@remotestorage/module-places`)

- Created a custom TypeScript module in `vendor/remotestorage-module-places/`.
- **Schema:** `place` object containing `id` (ULID), `title`, `lat`, `lon`, `geohash`, `osmId`, `url`, etc.
- **Storage Path:** Nested `<2-char>/<2-char>/<id>` (based on geohash) for scalability.
- **API:**
  - `getPlaces(prefixes?)`: efficient partial loading of specific sectors (or full recursive scan if no prefixes provided).
  - Uses `getListing` for directory traversal and `getAll` for object retrieval.
  - configured with `maxAge: false` to ensure data freshness.
- **Dependencies:** Uses `ulid` and `latlon-geohash` internally.

### 3. App Infrastructure & Build

- **Services:**
  - `storage.js`: Initializes RemoteStorage, claims access, enables caching, and sets up the widget. Consumes the new `getPlaces` API.
    - **Optimization:** Implemented **Debounced Reload** (200ms) for bookmark updates to handle rapid change events efficiently.
    - **Optimization:** Correctly handles deletion/updates by clearing stale data for reloaded geohash sectors.
  - `osm.js`: Fetches nearby POIs from Overpass API.
    - **Configurable:** Now supports dynamic API endpoints via `SettingsService`.
    - **Reliability:** Implemented `fetchWithRetry` to handle HTTP 504/502/503 timeouts and 429 rate limits, in addition to network errors.
  - `settings.js`: Manages user preferences (currently Overpass API provider) persisted to `localStorage`.
- **UI Components:**
  - `places-sidebar.gjs`: Displays a list of nearby POIs.
    - **Layout:** Responsive design that transforms into a **Bottom Sheet** (50% height) on mobile screens (`<=768px`) with rounded corners and upward shadow.
  - `place-details.gjs`: Dedicated component for displaying rich place information.
    - **Features:** Icons (via `feather-icons`), Address, Phone, Website, Opening Hours, Cuisine, Wikipedia.
    - **Layout:** Polished UI with distinct sections for Actions and Meta info.
  - `app-header.gjs`: Transparent header with "Menu" button (Settings) and User Avatar (Login).
  - `settings-pane.gjs`: Sidebar component for app info ("About" section) and settings.
    - **Features:** Dropdown to select Overpass API provider (bke.ro, overpass-api.de, private.coffee).
    - **Mobile:** Renders as a 2/3 height bottom sheet on mobile.
    - **Z-Index:** Configured to overlay the Places sidebar correctly (`z-index: 3200`).
- **Geo Utils:**
  - `app/utils/geo.js`: Haversine distance calculations.
  - `app/utils/geohash-coverage.js`: Logic to calculate required 4-char geohash prefixes for a given bounding box.
- **Build & DevOps:**
  - **Icon Generation:** Added `build:icons` script using `magick` and `rsvg-convert` to automate PNG generation from SVG.
  - **Dependencies:** Documented system requirements (ImageMagick, librsvg) in `README.md`.
  - **Ember CLI:** Added as dev dependency to support generator commands.
  - **License:** Added AGPLv3 license.

### 4. Routing & Data Optimization

- **Explicit URLs:** Implemented routing support for specific OSM entities via `/place/osm:node:<id>` and `/place/osm:way:<id>`, distinguishing them from local bookmarks (ULIDs).
- **Smart Linking:** The `showPlaces` action intercepts search results and automatically resolves them to existing **Bookmarks** if a match is found (via `storage.findPlaceById`). This ensures the app navigates to the persistent Bookmark URL (ULID) and correctly reflects the "Saved" status in the UI instead of treating it as a new generic OSM place.
- **Data Normalization:** Refactored `OsmService` to return normalized objects (`osmTags`, `osmType`) for all queries. This ensures consistent data structures between fresh Overpass results and saved bookmarks throughout the app.
- **Performance:** Optimized navigation to prevent redundant network requests. Clicking a map pin passes the existing data object to the route, skipping the `model` hook (no re-fetch) while maintaining correct deep-linkable URLs via a custom `serialize` hook in `PlaceRoute`.

## Current State

- **Repo:** The app runs via `pnpm start`.
- **Workflow:**
  1.  User pans map -> `moveend` triggers `storage.loadPlacesInBounds`.
  2.  User clicks map -> "Pulse" animation -> hybrid hit detection (Visual Tile vs Overpass).
  3.  **Navigation:** Selected place is checked against bookmarks; if found, it uses the Bookmark object. Otherwise, it uses the OSM object.
  4.  Sidebar displays details via `<PlaceDetails>` component (Bottom sheet on mobile).
  5.  User clicks "Save Bookmark" -> Stores JSON in RemoteStorage.
  6.  RemoteStorage change event -> Debounced reload updates the map reactive-ly.
  7.  **Editing:** User can edit the Title and Description of saved bookmarks via an "Edit" button in the details view.
  8.  **Settings:** User can change the Overpass API provider via the new Settings menu.

## Files Currently in Focus

- `app/styles/app.css`: Mobile CSS fixes (font sizes, control positioning).
- `package.json`: New scripts and dependencies.
- `README.md`: Updated documentation.

## Next Steps & Pending Tasks

1.  **Mobile Polish:** Verify "Locate Me" animation on iOS Safari.
2.  **Collections/Lists:** Implement ability to organize bookmarks into lists/collections.
3.  **Linting & Code Quality:** Fix remaining CSS errors, remove inline styles in `map.gjs`, and address unused variables/runloop usage.
4.  **Performance:** Monitor performance with large datasets (thousands of bookmarks).
5.  **Testing:** Add automated tests for the geohash coverage, retry logic, and new editing features.

## Technical Constraints

- **Template Style:** Strict Mode GJS (`<template>`).
- **Package Manager:** `pnpm` for the main app, `npm` for the vendor module.
- **Visuals:** No Tailwind/Bootstrap; using custom CSS in `app/styles/app.css`.
