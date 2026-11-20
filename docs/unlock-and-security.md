# Unlock & security

The rules are the Android app's (see its `docs/unlock-and-security.md`); this page lists them
briefly and describes the browser differences.

## Guardian code
Chosen during setup by the guardian:
- **Password** – at least 4 characters, stored as PBKDF2-HMAC-SHA256 hash (310 000 iterations,
  `pbkdf2-sha256$iter$salt$hash`, identical to Android).
- **Authenticator app (TOTP)** – RFC 6238, 30 s, 6 digits, ±1 step. Lares shows a QR code and the
  key; the secret is stored only after the guardian entered a matching code, encrypted with the
  browser's device key (see [Architecture](architecture.md#secrets)). Each code works once; codes
  older than the newest step seen are rejected (no replay after setting the clock back).

Secret fields are excluded from autofill and password managers (`autocomplete="off"` plus the
ignore attributes of 1Password, LastPass and Bitwarden).

## Recovery code
20 characters (Crockford Base32, 100 bits), shown once after setting up a code, with **Copy** and
**Save as file**. Stored only as a salted SHA-256 hash. Using it unlocks once, is recorded as a
tamper event, and forces setting up a new code. Setup only completes after the guardian confirms
having stored it.

## Wrong codes
The 3rd wrong code in a row starts a 1-minute waiting time, doubling with every further wrong code
up to 24 hours. A browser restart starts a running waiting time over in full.

## Unlocked mode and pause
- A correct code unlocks for **10 minutes**; every change is allowed. "Lock now" ends it early. The
  first setup ends in unlocked mode, so the first rules can be set up.
- A **pause** (5 min / 15 min / 1 h / custom, started only while unlocked) suspends all blocking and
  keeps running after locking.
- Both end when the **browser restarts** (Android: on reboot).

## Tighten vs. loosen
Adding rules, groups and members, lowering limits and switching things on never needs the code.
Removing or disabling, raising a limit, taking a member out of a group, deleting a group, changing
the reset time and changing the guardian code need it. In the UI a loosening change asks for the
code and is applied right after a correct one.

## Moving to / from the phone
Rules export / import use the Android file format (import only adds, so it needs no code). With an
authenticator code, the export can include the TOTP secret encrypted with the recovery code
(`TotpTransfer`, AES-256-GCM, compatible with Android). *Taking over* a phone's authenticator code
from a file isn't in the UI yet – see [roadmap](roadmap.md).

## Tamper protection in the browser
An extension can't stop the user from disabling or removing it, using a private window, another
profile or another browser. The browser edition therefore:
- **Loose by default:** blocking works as long as the extension runs; the main screen warns while
  Lares isn't allowed in private windows.
- **Enforced installation (opt-in, documented):** with admin rights on the computer, the extension
  can be force-installed through browser policies – then it can't be disabled or removed by the user:
  - Chrome / Brave / Edge: `ExtensionInstallForcelist` (and `IncognitoModeAvailability` to disable
    private windows).
  - Firefox / Zen: `policies.json` with `ExtensionSettings` → `installation_mode: "force_installed"`
    (and `DisablePrivateBrowsing`).
- **Detection afterwards (planned):** guardian notifications for lost permissions, gaps in which
  Lares didn't run, clock and time-zone changes, repeated wrong codes and use of the recovery code.
  The checks exist in `core/protection`, the delivery in `core/alerts`; the browser wiring is the
  next step.

### Known weaknesses
- The monotonic clock can be advanced by setting the system clock forward while the background
  script is suspended; this can shorten a wrong-code waiting time. Clock-change detection (planned)
  reports it to the guardian.
- The device key is software-only; a user with access to the browser profile and dev tools could use
  it, but would still need the guardian code to loosen anything through Lares.
