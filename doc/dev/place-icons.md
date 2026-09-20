# Place Icons

How place/POI icons on the map are imported, selected from OSM tags, and rendered.

> Scope: this covers the **POI icon system** used for map markers and UI.
> It does **not** cover the PWA/launcher icons in `public/icons/` and `release/icons/`
> (those are app icons referenced from `index.html` / `web-app-manifest.json`).

## File map

| File                                                    | Responsibility                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `app/utils/icons.js`                                    | Registry. Imports every SVG as a raw string (`?raw`), exposes `getIcon(name)` and `isIconFilled(name)`. |
| `app/utils/osm-icons.js`                                | OSM tag → icon mapping. `POI_ICON_RULES`, `getIconNameForTags(tags)`, `getIconSvgForTags(tags)`.        |
| `app/components/icon.gjs`                               | Generic `<Icon @name="..." />` renderer used across the UI.                                             |
| `app/components/map.gjs`                                | Map marker call site; embeds the icon SVG into an OpenLayers `Icon` data-URI.                           |
| `app/icons/`                                            | Custom/local SVG files.                                                                                 |
| `node_modules/@waysidemapping/pinhead/dist/icons/*.svg` | Pinhead source icons (2,320 files).                                                                     |
| `node_modules/feather-icons/dist/icons/*.svg`           | Feather source icons.                                                                                   |
| `tests/unit/utils/osm-icons-test.js`                    | Tests for tag matching + integrity check that every rule icon exists.                                   |
| `tests/integration/components/icon-test.gjs`            | Tests for the `<Icon>` component.                                                                       |

## How icons are imported (`app/utils/icons.js`)

Every icon is a **static named import** with Vite's `?raw` suffix, so the file contents
arrive as a string. There is **no glob/context import**; each icon is listed explicitly.

Imports are grouped and sorted alphabetically (per the header comment at
`app/utils/icons.js:1`):

1. **Feather icons** — `feather-icons/dist/icons/*.svg`
2. **Pinhead icons** — `@waysidemapping/pinhead/dist/icons/*.svg`
3. **Custom/local icons** — `../icons/*.svg`

```js
import mapPin from 'feather-icons/dist/icons/map-pin.svg?raw';
import donut from '@waysidemapping/pinhead/dist/icons/donut.svg?raw';
import bitcoin from '../icons/bitcoin.svg?raw';
```

The imported strings are collected in the `ICONS` object, keyed by the kebab-case name
used everywhere else in the app. Quoted keys are needed when the name contains dashes:

```js
const ICONS = {
  activity, // shorthand works for single-word names
  'map-pin': mapPin, // quote dashed keys
  donut,
  'loading-ring': loadingRing,
};
```

Some registry keys are intentionally **not** normalized to kebab-case
(e.g. `climbing_wall`, `parking_p`, `winding_way_wide`) — match whatever string the
rule uses.

`FILLED_ICONS` lists names that render with `fill` instead of `stroke`
(`app/utils/icons.js:309`). `getIcon(name)` returns the SVG string (or `undefined`);
`isIconFilled(name)` drives the `.icon-filled` CSS class.

## How icons are selected from OSM tags (`app/utils/osm-icons.js`)

`POI_ICON_RULES` is an **ordered** array of `{ tags, icon }`. Each rule requires **all**
of its listed tags to match. The **first matching rule wins**, so more specific rules
must come before catch-alls.

```js
export const POI_ICON_RULES = [
  { tags: { cuisine: 'donut' }, icon: 'donut' },
  ...{ tags: { shop: true }, icon: 'shopping-bag' }, // catch-all, must be late
];
```

`getIconNameForTags(tags)` (`app/utils/osm-icons.js:214`) matching semantics:

- Returns `null` if `tags` is falsy or nothing matches.
- A rule tag only matches if its value is truthy.
- A tag value is split on `;` and trimmed, so `cuisine=donut;coffee_shop` matches both
  `donut` and `coffee_shop` rules.
- `expectedValue: true` matches any non-empty value.

`getIconSvgForTags(tags)` wraps the name lookup and returns the raw SVG. It is exported
but currently unused.

## Rendering

- **UI:** `<Icon @name="donut" @size={{16}} />` — `app/components/icon.gjs`. Renders
  only if `getIcon(@name)` returns an SVG. `@filled` overrides `isIconFilled`.
- **Map markers:** `searchResultStyle` in `app/components/map.gjs:123` calls
  `getIconNameForTags(tags)` (line 151), strips the `<svg>` wrapper, and embeds the
  paths in white inside the red pin at a `0.8` scale (lines 194-199). Results are cached
  in `cachedIconUrls` keyed by icon name / `'default'`.

## Adding a new icon

1. **Find an SVG.**
   - Pinhead: browse `node_modules/@waysidemapping/pinhead/dist/icons/` or search the
     gallery at https://pinhead.ink. Filenames use snake_case (`coffee_bean.svg`).
   - Feather: `node_modules/feather-icons/dist/icons/`.
   - Otherwise drop a custom file in `app/icons/`.
2. **Import it** in `app/utils/icons.js` in the correct group, keeping the group
   alphabetical, using `?raw`.
3. **Register it** in the `ICONS` map with a kebab-case key (quote it if it has dashes).
4. **Mark it filled** in `FILLED_ICONS` if it is a fill-style (not stroke-style) icon.
5. **Map OSM tags** in `POI_ICON_RULES` (`app/utils/osm-icons.js`), inserting the rule
   before any catch-all that would otherwise shadow it.

No test is needed just to register a new icon or tag rule. The generic integrity test
(`all icons used in POI_ICON_RULES exist in the icons utility`) already checks every
rule's icon. Only add a focused test in `tests/unit/utils/osm-icons-test.js` for
non-trivial matching behavior (e.g. ordering/shadowing, semicolon-separated values, or
a new catch-all).

## Gotchas

- **Order matters.** First match wins; put specific rules before catch-alls
  (`shop: true`, `office: true`, `craft: true`, `sport: true`, `historic: yes`).
- **The integrity test is your safety net.** `osm-icons-test.js` asserts every icon named
  in `POI_ICON_RULES` exists in `getIcon`. Forgetting the import/registry entry fails CI.
  This covers _all_ icons automatically, so you normally don't need to add a test when
  adding one.
- **Naming mismatch.** Pinhead filenames are snake_case; registry keys are usually
  kebab-case, with a few unnormalized exceptions. A typo yields `null` (no marker icon)
  rather than an error.
- **Two icon systems.** Don't touch `public/icons/` (PWA icons) when working on POI icons;
  `pnpm build:icons` regenerates those PNGs and is release-only.
- **Don't confuse with categories.** Tag→category matching for the sidebar/chips lives in
  `app/utils/poi-category-matcher.js` and `app/utils/poi-categories.js`, separate from
  tag→icon.

## Running the tests

```sh
pnpm test          # builds and runs the full QUnit suite via Testem
pnpm lint          # ESLint + Stylelint + Prettier + ember-template-lint
pnpm lint:fix      # auto-fix
```
