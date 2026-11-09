<br>

<div align="center">
  <img src="public/icons/icon-rounded.svg" width="128" height="128" alt="Marco App Icon">
  <h1>Marco</h1>
</div>

<br>

Marco (as in [Marco Polo][1]) is an unhosted maps application that respects
your privacy and choices.

It allows users to connect their own remote storage to sync place bookmarks
across apps and devices. It also supports the decentralized sharing of place
photos (and soon reviews) via [Nostr][2].

[Ponder Source deployment](https://marco.pondersource.com) ·
[Upstream repository](https://gitea.kosmos.org/raucao/marco)

This README outlines the details of collaborating on this Ember application, or
just building and deploying it for yourself.

## Prerequisites

You will need the following things properly installed on your computer.

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/)
- [pnpm](https://pnpm.io/)
- [Google Chrome](https://google.com/chrome/)

## Installation

- `git clone <repository-url>` this repository
- `cd marco`
- `pnpm install`

## Running / Development

- `pnpm start`
- Visit your app at [http://localhost:4200](http://localhost:4200).
- Visit your tests at [http://localhost:4200/tests](http://localhost:4200/tests).

### Code Generators

Make use of the many generators for code, try `pnpm ember help generate` for more details

### Running Tests

- `pnpm test`

### Linting

- `pnpm lint`
- `pnpm lint:fix`

### Building

- `pnpm vite build --mode development` (development)
- `pnpm build` (production)

### App Icon

- `pnpm build:icons` generates PNGs of all sizes from `public/icons/icon.svg`

To run the script, you need `imagemagick` and `librsvg` installed:

- **Arch Linux:** `pacman -S imagemagick librsvg`
- **Ubuntu/Debian:** `apt install imagemagick librsvg2-bin`

### Deploying

GitHub Actions builds and deploys the Ponder Source fork from `master` to
GitHub Pages. For other static hosts, route unknown paths to `index.html` so
client-side map links open directly.

OpenStreetMap account sign-in needs an OAuth client registered for the
deployment. Set the GitHub Actions repository variable `MARCO_OSM_CLIENT_ID`
to that client's public ID and register
`https://marco.pondersource.com/oauth/osm/callback` as the redirect URI.
Map browsing, place search and remoteStorage work without this client.

## Further Reading / Useful Links

- [ember.js](https://emberjs.com/)
- [remoteStorage.js](https://remotestorage.io/rs.js/docs/)
- [@remotestorage/module-places](https://gitea.kosmos.org/raucao/remotestorage-module-places)
- [Vite](https://vite.dev)
- Development Browser Extensions
  - [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  - [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)

[1]: https://en.wikipedia.org/wiki/Marco_Polo
[2]: https://nostr.org
