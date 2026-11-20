# Lares for the browser – documentation

Lares for the browser is the browser-extension edition of the
[Lares Android app](https://github.com/Irgendwer008/Lares): it blocks distracting websites, always or
after a daily time limit. Tightening is always possible; loosening needs a code that only a trusted
person – the **guardian** – knows.

The Android app's [docs](https://github.com/Irgendwer008/Lares/tree/main/docs) remain the product
spec. These pages describe the browser edition and where it differs.

| Page | Contents |
|---|---|
| [Development](development.md) | Setup, commands, loading the extension in Zen / Firefox / Chrome / Brave, debugging, tests |
| [Architecture](architecture.md) | Project layout, layers, data model, storage, how the pieces talk |
| [Blocking](blocking.md) | How pages are detected, blocked and counted; split view; countdown; known limits |
| [Unlock & security](unlock-and-security.md) | Guardian code, recovery code, unlocked mode, pause, tamper protection |
| [User interface](ui.md) | Popup screens, design system, how it maps to the Android app |
| [Localization](localization.md) | Languages, message files, rules |
| [Decisions](decisions.md) | Browser-specific design decisions and their reasons |
| [Status & roadmap](roadmap.md) | What works, what's missing, known limits |

## Status
Version 0.1.0, in development. Blocking, daily limits, groups, templates, guardian code
(password / authenticator), recovery code, unlocked mode, pause, settings and rules export / import
work. Guardian notifications and tamper detection are not built yet – see [roadmap](roadmap.md).
