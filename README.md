# marco

This README outlines the details of collaborating on this Ember application.
A short introduction of this app could easily go here.

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

- `git push 5apps master` (needs collaborator permission on 5apps)
- Or deploy `release/` to any static file host (ideally routing all 404s to
  `index.html` for launching with client-side routes to work)

## Further Reading / Useful Links

- [ember.js](https://emberjs.com/)
- [Vite](https://vite.dev)
- Development Browser Extensions
  - [ember inspector for chrome](https://chrome.google.com/webstore/detail/ember-inspector/bmdblncegkenkacieihfhpjfppoconhi)
  - [ember inspector for firefox](https://addons.mozilla.org/en-US/firefox/addon/ember-inspector/)
