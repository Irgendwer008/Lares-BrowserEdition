# Architecture

Browser extension, Manifest V3, for Chrome and Firefox from one codebase. Built with
[WXT](https://wxt.dev) (build tool), TypeScript and Svelte 5. License GPL-3.0-or-later.

## Layers
```
src/
├── core/         pure TypeScript – the Lares logic, ported from the Android app's core/ packages
├── platform/     browser implementations of the core interfaces (storage, clock, cipher, tabs)
├── lib/          shared UI code: services + reactive model, theme, Material 3 components
├── locales/      translations (en, de, fr)
└── entrypoints/  what the browser runs: background, popup, block page, page script
```

- **core** has no `browser.*`, DOM or WXT imports – only standard JavaScript and WebCrypto. It is
  unit-tested with in-memory fakes. Same package names as on Android: `policy`, `unlock`, `data`,
  `blocking`, `protection`, `alerts`, `time`.
- **platform** connects core to the browser (Android: `platform` + `blocking` packages).
- **entrypoints** are compiled by WXT into separate files and listed in the generated
  `manifest.json`.

## Entrypoints
| File | Runs as | Android counterpart |
|---|---|---|
| `entrypoints/background.ts` | background service worker (Chrome) / event page (Firefox) | accessibility service + `BlockingController` |
| `entrypoints/popup/` | toolbar popup – the whole UI; also opened in a tab (`popup.html?tab=…`) | `MainActivity` / Compose screens |
| `entrypoints/blocked/` | extension page that replaces a blocked website | `BlockActivity` |
| `entrypoints/page.content.ts` | content script in every web page | `TimerOverlay` + window list |

The background script is suspended by the browser when idle and woken by events (tab switched, page
loaded, alarm, message). Everything it needs across wake-ups lives in storage.

## Core modules
| Module | Contents |
|---|---|
| `policy/` | `Rule`, `RuleGroup`, `UrlMatcher` (URL parsing and matching), `PolicyEngine` (URL → allow / block), `ChangePolicy` (tighten vs. loosen), `ResetSchedule` (daily periods), `TimedSession` (unlocked mode, pause, waiting time), `RuleTemplates` |
| `unlock/` | `UnlockManager` (setup, unlock, pause), `PasswordHasher` (PBKDF2), `Totp`, `RecoveryCode`, `TotpTransfer`, `AttemptPolicy`, `Base32` |
| `data/` | `AppState` (settings + unlock state + tracked period), `RuleRepository`, `SettingsRepository`, `UnlockGate`, `Backup`, `SetupRequirements`, `TamperLog` |
| `blocking/` | `UsageCounter`, `LimitWarnings`, `BlockingController` (browser-only, event-driven engine) |
| `protection/` | Pure tamper checks (permission lost, gaps, clock / zone changes) – not wired up yet |
| `alerts/` | Guardian notification channel configs and repository – not wired up yet |
| `time/` | `Clock` interface, time-zone helpers (`Intl` instead of `java.time`) |

## Data model
Same as Android (see its architecture doc), with browser changes:
- `Rule(id, type = APP | WEBSITE, target, limitMinutesPerDay | null, enabled, groupId | null)` –
  `APP` rules only exist so phone backups import cleanly; they are ignored.
- `RuleGroup(id, name, limitMinutesPerDay | null, enabled)`.
- `AppState = { settings, unlock, trackedPeriod }` – one JSON value. Android-only settings (blocking
  mode, website-blocking switch, theme, device admin, settings guard) don't exist.
- `UsageSnapshot(periodStartMillis, periodEndMillis, ruleMillis, groupMillis)` – time used in the
  current period.

## Storage
| Area | Key | Contents |
|---|---|---|
| `storage.local` | `appState` | settings, unlock state (hashes, encrypted TOTP secret), tracked period |
| | `rules`, `groups` | `{ nextId, items }` tables |
| | `usage` | usage of the current period |
| | `tamperEvents` | tamper log (not used yet) |
| | `lastBootId` | last browser-session id |
| `storage.session` (cleared on browser restart) | `clock` | monotonic-clock checkpoint + session id |
| | `segment` | the time currently being counted |
| | `visibleTabs` | tabs whose page reported being visible (split view) |
| IndexedDB `lares-keys` | `secrets-v1` | the non-extractable AES key for secrets |

Writes that read-modify-write go through `withLock` (Web Locks API), so the background script,
popup and tabs never overwrite each other's changes. UI and background react to changes through
`storage.onChanged`.

## Clock and "boot"
Android uses `elapsedRealtime` (monotonic) and the boot counter. The browser has neither across
service-worker suspensions, so `BrowserClock` builds them:
- **bootId** = browser session: a new id whenever session storage is empty (browser restarted).
  Unlocked mode and pauses end, wrong-code waiting times restart – like a phone reboot.
- **elapsedMillis** follows `performance.now()` while the context runs and continues from the last
  checkpoint by the wall-clock time in between, never backwards. Setting the clock back can't extend
  anything; setting it forward while the worker sleeps does advance it (a known limit, see
  [Unlock & security](unlock-and-security.md)).

## Secrets
`WebCryptoCipher` (Android: Keystore) encrypts the TOTP secret (and later channel tokens) with
AES-256-GCM. The key is generated as non-extractable and stored in IndexedDB: pages can use it but
never read it. Weaker than hardware-backed storage, but the stored ciphertext alone is useless.

## Popup data flow
`createServices()` (`lib/app.svelte.ts`) builds the repositories on top of the storage classes;
`LaresModel` subscribes to storage and exposes reactive `state`, `rules`, `groups`, `usage` and a
one-second `now` tick. Screens call repositories; loosening calls go through `ui.guarded()`, which
catches `CodeRequiredError`, asks for the guardian code and retries.
