# Development

## Requirements
- Node.js 20 or newer (the dev container ships one).
- A browser to load the extension into: Firefox or a Firefox-based browser (Zen, LibreWolf …), or a
  Chromium-based one (Chrome, Brave, Edge …).

```sh
npm install            # downloads the libraries into node_modules/ (not committed)
```

## Commands
| Command | What it does |
|---|---|
| `npm run dev` / `npm run dev:firefox` | Development build into `.output/chrome-mv3-dev` / `.output/firefox-mv3-dev`, rebuilt on every change |
| `npm run build` / `npm run build:firefox` | Production build into `.output/chrome-mv3` / `.output/firefox-mv3` |
| `npm run zip` / `npm run zip:firefox` | Store packages, e.g. `.output/lares-browser-0.1.0-firefox.zip` |
| `npm test` | Unit tests (Vitest), once; `npm run test:watch` re-runs on changes |
| `npm run check` | Type check of all `.ts` and `.svelte` files |
| `npx web-ext lint -s .output/firefox-mv3` | Mozilla's add-on linter (what addons.mozilla.org checks) |

Before handing over a change: `npm test`, `npm run check` and both builds must pass.

## Loading the extension
The build output is a folder with a `manifest.json`. It works the same whether it was built inside
the dev container or not – the project folder is shared with the host.

### Zen / Firefox
1. `npm run zip:firefox`
2. Open `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → pick
   `.output/lares-browser-<version>-firefox.zip`.
3. In `about:addons` → Lares → Permissions, allow access to all websites (needed for the countdown
   and for split view, see [Blocking](blocking.md)), and set "Run in Private Windows" to "Allow".

Temporary add-ons are removed when the browser closes; load the zip again. A permanent install needs
a signed add-on (addons.mozilla.org).

**Flatpak browsers** (Zen from Flathub): the file picker only grants access to the one file that was
picked, so loading `manifest.json` from a folder fails with "NS_ERROR_FILE_NOT_FOUND". Either load
the zip (a single file), or grant access to the project folder once:
`flatpak override --user --filesystem=/path/to/Lares-BrowserEdition app.zen_browser.zen`.

### Chrome / Brave / Edge
1. `npm run build` (or `npm run dev` for automatic rebuilds)
2. `chrome://extensions` (`brave://extensions`) → enable **Developer mode** → **Load unpacked** →
   pick `.output/chrome-mv3` (or `chrome-mv3-dev`).
3. After a rebuild, click the reload icon on the Lares card.
4. For private windows: Details → "Allow in Incognito".

Use a separate browser profile for testing, so blocks and test data stay out of everyday browsing.

### Dev server in the container
`npm run dev` would normally also start a browser; inside the dev container there is none. A local,
git-ignored `web-ext.config.ts` with `defineWebExtConfig({ disabled: true })` turns that off. Live
reload needs the dev server's port 3000 to be reachable from the browser – the container doesn't
publish it, so reload the extension by hand after a rebuild.

## Debugging
| What | Chrome | Firefox / Zen |
|---|---|---|
| Background script (blocking engine) | `chrome://extensions` → Lares → "service worker" | `about:debugging` → Lares → **Inspect** |
| Popup | right-click the toolbar icon → "Inspect popup" | `about:debugging` → Inspect, then disable popup auto-hide in the dev tools' "…" menu |
| Block page, popup opened in a tab | normal dev tools (F12) | normal dev tools (F12) |
| Page script (countdown, visibility) | dev tools of the web page, "Content scripts" context | dev tools of the web page |

Unexpected errors in the popup are shown in a red box at the bottom ("Something went wrong") with
the stack trace – copy that text when reporting a problem.

Stored data can be inspected in the background script's console:
`await browser.storage.local.get()` (rules, groups, settings, usage) and
`await browser.storage.session.get()` (clock, counting segment, visible tabs).

## Tests
- Unit tests live in `tests/`, mirroring `src/`. They cover the whole `src/core` layer – everything
  ported from the Android app (with its original test cases) plus the browser blocking controller.
  Fakes for storage, clock and stores are in `tests/testing/fakes.ts`.
- `src/core` must stay free of browser APIs so it can be tested this way; browser code
  (`src/platform`, `src/entrypoints`) is checked by hand in the browser.
- Compatibility with the Android app (password hashes, TOTP transfer packages, recovery hashes,
  backup JSON) was verified against the Kotlin implementation when the core was ported; keep the
  formats unchanged.

## Third-party code
Everything bundled into the extension must be listed in `src/lib/licenses.ts` (shown in Settings →
Open-source libraries) – a new runtime library or asset needs an entry with its license text.
Versions and texts are imported from `node_modules` at build time; packages without a license file
get one in `assets/licenses/`. Build tools don't ship and aren't listed.

## Conventions
- TypeScript strict, Svelte 5 with runes (`$state`, `$derived`, `$props`).
- `@/` imports point to `src/`; translations come from `#i18n`.
- Every source file starts with `// SPDX-License-Identifier: GPL-3.0-or-later` (HTML / Svelte: as
  a comment).
- No user-visible text in code – see [Localization](localization.md).
- Stored data must stay readable across updates: only add fields (with defaults), never rename or
  remove them.
