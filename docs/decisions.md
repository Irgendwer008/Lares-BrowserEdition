# Decisions

Browser-specific decisions and their reasons. Product decisions shared with the Android app (tighten
free / loosen with code, groups, templates, recovery code, 10-minute unlocked mode, waiting times …)
are in the Android repo's `docs/decisions.md` and apply here unchanged.

## Platform
| Decision | Reason |
|---|---|
| Manifest V3, Chrome + Firefox from one codebase (WXT) | MV3 is required by Chrome and supported by Firefox; WXT handles the differences (service worker vs. event page, manifest keys) |
| TypeScript + Svelte 5 | Typed like Kotlin; Svelte's declarative components are close to Compose and produce small bundles |
| Core logic ported to TypeScript (not Kotlin Multiplatform) | The Android core is pure Kotlin and ported cleanly; KMP would add a second build system for little gain |
| Data formats compatible with Android (hashes, TOTP package, backup JSON) | Rules and the authenticator code can move between phone and browser |
| Few runtime libraries: Svelte, the WXT i18n helper, `uqr` (QR code) | Small, reviewable extension; build tools don't ship |

## Blocking
| Decision | Reason |
|---|---|
| Website rules only; Android `APP` rules kept in the data but ignored | Extensions can't see apps; phone backups still import cleanly |
| Event-driven engine instead of a one-second loop | MV3 background scripts are suspended when idle; events, alarms and the page countdown wake it |
| Time counted only for visible pages in the focused window, not while idle (5 min) unless audible, not while locked | Browser equivalent of "foreground app while the screen is on" |
| Split view: every visible tab counts, in one step | Same as Android's split screen / picture-in-picture handling |
| Redirect to an extension block page; incognito tabs in Chrome are closed instead | Clear reason and next steps like Android's block screen; Chrome can't show extension pages in incognito |
| Check `onBeforeNavigate` in addition to syncs | Blocked sites never flash |
| Usage period start backdated when tracking starts late | Otherwise the next reset comes too late (bug in the Android app) |
| Website access only needed for countdown and split view | Blocking itself works with the `tabs` permission; fewer required permissions in Firefox |

## Guardian code & security
| Decision | Reason |
|---|---|
| "Reboot" = browser restart (session storage cleared) | No boot counter in browsers; a restart must never extend unlocked mode or a pause |
| Monotonic clock from `performance.now()` + wall-clock checkpoints, never backwards | Service workers lose `performance.now()` when suspended |
| Secrets encrypted with a non-extractable WebCrypto key in IndexedDB | Closest browser equivalent of the Android Keystore |
| Tamper protection loose by default; enforced install documented (browser policies) | An extension can't prevent its own removal; policies can, with admin rights |
| No email (SMTP) guardian channel | Extensions can't open raw sockets; Telegram, ntfy, webhook and Matrix remain |
| Firefox `data_collection_permissions: none` | Nothing is collected or sent to the developers |

## UI
| Decision | Reason |
|---|---|
| Everything in the toolbar popup (no options page) | One place, like Bitwarden; asked for by the project owner |
| Import opens the UI in a tab | The file picker closes popups (Firefox), losing the file |
| Android look: Material 3 colors, wordmark, icons and texts from the Android app | One recognizable product across phone and browser |
| No Material You / theme setting | Browsers have no wallpaper colors; light / dark follows the system |
| Letter icons, no favicons | Logos are trademarked; fetching favicons would tell each site about the user |
| `about:addons` link tries to open the page, otherwise copies the address | Firefox doesn't let extensions open `about:` pages |
