# Agent Instructions for Marco

Marco is a privacy-respecting, unhosted maps application that allows users to connect their own remote storage to sync place bookmarks across apps and devices.

## Relevant Commands

All commands must be executed using `pnpm`. Never use `npm`.

- **Install dependencies:** `pnpm install`
- **Start development server:** `pnpm start` (Runs Vite)
- **Run tests:** `pnpm test` (Builds and runs via Testem)
- **Linting:**
  - `pnpm lint` (Runs ESLint, Stylelint, Prettier, and ember-template-lint concurrently)
  - `pnpm lint:fix` (Automatically fixes linting and formatting errors)

### NEVER RUN

- `pnpm build` (only run for releases by the devs)
- `git add`, `git commit`, or any other commands that modify git history or the staging area

## Application Architecture & Frameworks

### Core Stack

- **Framework:** Ember.js (Octane / Polaris editions). The project heavily uses modern Ember paradigms including `.gjs` (template-tag format), `@glimmer/component`, and `@glimmer/tracking`.
- **Build System:** Vite coupled with Embroider (`@embroider/vite`) for fast, modern asset compilation.

### Mapping & Geocoding

- **Maps:** Uses OpenLayers (`ol` and `ol-mapbox-style`) for rendering the map interface.
- **Search:** Uses the Photon API (via `app/services/photon.js`) for geocoding and search functionality.
- **Data Source:** OpenStreetMap (OSM) data is fetched and parsed to display rich place details.

### Storage & Authentication

- **RemoteStorage:** The app is "unhosted" meaning user data isn't locked in a central database. It uses `remotestoragejs` and `@remotestorage/module-places` to sync bookmarks to a user's chosen storage provider. (Managed in `app/services/storage.js`).
- **OSM Auth:** Allows users to log into OpenStreetMap using OAuth 2.0 PKCE (`oauth2-pkce`) to fetch user info and potentially interact with OSM directly (Managed in `app/services/osm-auth.js`).

### Directory Structure Highlights

- `app/components/`: UI components using `.gjs` (Glimmer JS with embedded `<template>` tags).
- `app/services/`: Core business logic, state management, and API integrations.
- `app/utils/`: Helper functions for geohashing, parsing OSM tags, icon mapping, and link formatting.
- `tests/`: Comprehensive QUnit test suite containing unit, integration, and acceptance tests.

### Key Libraries

- `ember-concurrency` / `ember-lifeline`: Managing async tasks and debouncing.
- `remotestorage-widget`: The UI widget for connecting to a RemoteStorage provider.
