<p align="center"><img src="assets/icon.svg" alt="Lares" width="96"></p>

<p align="center"><b>Blocks distracting websites – loosening needs a guardian code.</b></p>

Lares for the browser is the browser-extension edition of the
[Lares Android app](https://github.com/Irgendwer008/Lares) for Chrome (and other Chromium browsers)
and Firefox. You choose websites to block, always or after a daily time limit. Adding restrictions
is always possible; removing or loosening them needs a code that only a trusted person – your
**guardian** – knows.

> **Status:** in development (0.1.0). See [docs/roadmap.md](docs/roadmap.md).

Documentation: [docs/](docs/README.md) – development, architecture, blocking, security, UI,
localization, decisions.

## Development
Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev            # Chrome with live reload
npm run dev:firefox    # Firefox with live reload
npm test               # unit tests (Vitest)
npm run check          # type check (svelte-check)
npm run build          # production build → .output/chrome-mv3
npm run build:firefox  # production build → .output/firefox-mv3
npm run zip            # store packages
```

Loading the build into Zen / Firefox / Chrome / Brave, debugging and tests:
[docs/development.md](docs/development.md).

## License
Lares is free software, licensed under the [GNU General Public License v3.0 or later](LICENSE).
