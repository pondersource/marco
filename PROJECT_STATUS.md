# Project Status: Marco

**Last Updated:** Wed Apr 1 2026

## Project Context

We are building **Marco**, a decentralized maps application using **Ember.js** (Octane/Polaris), **Vite**, and **OpenLayers**. The core feature is storing place bookmarks in **RemoteStorage.js**.

## What We Have Done

### 1. Map Integration

- **Vector Tiles:** Using **OpenFreeMap Liberty** style with a hybrid click handler (Visual Tiles + Overpass API fallback).
- **Smart Interaction:**
  - **Hit Tolerance:** 10px buffer for easier mobile tapping.
  - **Auto-Pan:** Selected pins automatically center in the visible area (respecting bottom sheets/sidebars).
  - **Smart Zoom:** `zoomToBbox` fits complex geometries (ways/relations) with dynamic padding, only zooming out to fit.
- **Visuals:** Custom "Red Pin" overlay with drop animation. Selected OSM ways/relations show distinct blue outlines.
- **Geolocation:** Robust "Locate Me" with dynamic zoom and accuracy visualization.

### 2. RemoteStorage Module (`@remotestorage/module-places`)

- **Custom Module:** Handles `place` objects with Geohash-based partitioning (`<2-char>/<2-char>/<id>`).
- **Optimization:** Supports efficient spatial querying via prefix loading.
- **Lists Support:** Manages collection-based organization (e.g., "To Visit", "Favorites").

### 3. App Infrastructure

- **Services:**
  - `storage.js`: Manages RemoteStorage, caching, and the new **Lists** feature (`to-go`, `to-do`).
  - `osm.js`: Fetches/caches POIs from Overpass API (configurable endpoints).
  - `settings.js`: Persists user preferences (e.g., API provider).
- **UI Components:**
  - **Responsive Layout:** Sidebar transforms into a Bottom Sheet on mobile.
  - **Place Details:** Rich info (Address, Socials, Opening Hours) with distinct "Actions" and "Meta" sections.
  - **App Menu:** Comprehensive settings and about section, implemented as a secondary sidebar.
- **CI/CD:** Gitea Actions for automated testing and release drafting.

### 4. Routing & Architecture

- **URL-Driven:** `/search` (list) and `/place/:id` (details) routes.
- **Smart Navigation:**
  - Direct hits redirect to details.
  - Search results automatically resolve to existing **Bookmarks**.
  - "Back" navigation returns to cached search results instantly.

### 5. Features

- **Search:** Typo-tolerant **Photon API** integration with location bias, debounce, query aborting, and loading indicators.
- **Category Search:** Quick search buttons/chips for POI categories, rendering distinct map markers with custom icons for results.
- **UI Enhancements:** Toast notifications for failed search requests
- **Creation & Editing:**
  - "Crosshair" mode for precise location picking.
  - Edit Title/Description for saved places.
- **Lists:** Users can add places to default lists ("To Go", "To Do") directly from the details view.
- **Socials:** Place details now include Email, Facebook, and Instagram links.
- **Data Sync:** Auto-refreshes OSM data (coords/tags) for saved places on view, preserving custom titles.

## Current State

- **Repo:** Runs via `pnpm start`.
- **Workflow:**
  1.  **Explore:** Pan/Zoom loads bookmarks from RemoteStorage.
  2.  **Search:** Query via Photon -> List or Direct Result.
  3.  **View:** Details pane (Sidebar/Bottom Sheet) shows rich info + social links.
  4.  **Action:**
      - **Save:** Persist to RemoteStorage.
      - **Organize:** Add to "To Go" / "To Do" lists.
      - **Edit:** Custom Title/Description.
  5.  **Sync:** Background check updates OSM data if changed.

## Next Steps

1.  **Testing:** Add automated tests for the new Lists logic and Geohash coverage.
2.  **Performance:** Monitor with large datasets.
3.  **Refinement:** Polish list UI and interactions.
