# Status & roadmap

## Works (0.1.0)
- Website rules: always blocked or daily limit; groups with shared limits; templates.
- Blocking engine: block page, early blocking on navigation, time counting for visible pages
  (incl. split view), idle / lock detection, daily reset with monotonic periods.
- Countdown in the last 5 minutes; optional warning notifications.
- Media with sound and picture-in-picture (Chrome) count toward limits, also in the background.
- Setup: password or authenticator app (QR), recovery code (copy / save), first setup ends unlocked.
- Unlock dialog with waiting times; unlocked mode (10 min); pause; tighten / loosen rules with
  "enter code and retry".
- Settings: change guardian code, reset time, countdown, warnings, export / import (Android format),
  about, license (GPL full text), open-source libraries with their license texts.
- Setup issues: private windows not allowed (required), website access (recommended).
- English, German, French; light and dark.

Checked: 136 unit tests (all core logic, incl. the ported Android tests), type check, both builds,
Mozilla's add-on linter (0 errors), automated walkthroughs of the popup and an end-to-end blocking
test in Chromium.

## Next
1. **Guardian notifications** – channel editor (Telegram, ntfy, webhook, Matrix), test message,
   automatic delivery with retries and per-channel cursor (core is ported: `core/alerts`). Host
   permissions for the services are requested per channel.
2. **Tamper detection** – lost permissions (website / private-window access), gaps, browser sessions
   without Lares, clock and time-zone changes, wired to the tamper log (core: `core/protection`).
   Uninstall: `runtime.setUninstallURL` can't notify without a server – evaluate.
3. **Import with authenticator code** – take over the phone's authenticator code from an export
   (recovery code entry), "restore from export" in the first setup.
4. **Privacy policy** text and screen (browser version of the Android one).
5. **Enforced installation guide** – step-by-step policies for Chrome / Firefox / Zen.
6. Store releases: addons.mozilla.org (signing), Chrome Web Store.

## Ideas / later
- Remember already shown warnings across background-script restarts (now they may be shown again).
- `declarativeNetRequest` rules for always-blocked sites (blocking without waking the background
  script).

## Known limits
See [Blocking](blocking.md#known-limits) and
[Unlock & security](unlock-and-security.md#known-weaknesses).
