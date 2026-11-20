# User interface

The whole UI lives in the **toolbar popup** (like Bitwarden) – there is no options page. Where a
popup can't work (file import: the file picker would close it), the same UI opens in a tab
(`popup.html?tab=settings`). The popup is 380 px wide.

## Screens (`entrypoints/popup/`)
| Screen / dialog | Contents | Android |
|---|---|---|
| `SetupScreen` | Welcome → guardian code method → password or authenticator (QR) → recovery code → done. Modes: first setup, after the recovery code was used, change from the settings | `SetupScreen` |
| `HomeScreen` | Wordmark, settings button, status card (protection on / unlocked with time left / paused), setup issues (private windows, website access), groups (expandable, usage bar, switch, edit), single rules, "Add" button | `HomeScreen` |
| `AddRuleScreen` | Tabs: templates (as group or single rules, limit), website (+ limit), new group. "Add to group" mode from a group card | `AddRuleScreen` |
| `SettingsScreen` | Guardian code, reset time, countdown, warnings, export / import (+ include authenticator code), about, privacy | `SettingsScreen` |
| `UnlockDialog` | Code entry with attempts left / waiting time | `UnlockDialog` |
| `PauseDialog` | 5 min / 15 min / 1 h / custom | pause dialog |
| `RuleDialog` | Active switch, limit, add to group / take out of group, remove | rule dialog |
| `GroupDialog` | Name, limit, delete; after creating from the add screen continues with adding members | group dialog |

Navigation state, dialogs, snackbar and the "needs the code → unlock → retry" flow are in
`ui.svelte.ts`.

## Design system
- **Colors:** the Android app's Material 3 schemes (`ui/theme/Theme.kt`), light and dark following
  the system, as CSS variables in `lib/theme.css` (`--primary`, `--primary-container`,
  `--surface-variant` …). Material You (wallpaper colors) doesn't exist in browsers.
- **Components** (`lib/ui/`): `Button` (filled / tonal / outlined / text), `IconButton`, `Switch`,
  `TextField` (outlined), `Dialog`, `OptionCard`, `TopBar`, `UsageBar`, `LetterIcon`, `Wordmark`,
  `LaresMark`.
- **Icons:** the Material icons the Android app uses, extracted from its `res/drawable/ic_*.xml`
  (`lib/ui/icons.ts`).
- **Logo:** the serif "Lares" wordmark and "L" mark from the Android vector drawables.
- Matching details: usage pill = `surfaceVariant` track, `primaryContainer` fill (`errorContainer`
  when used up), 18 px high; "Add" = extended FAB in `primaryContainer`; status card in
  `surfaceContainerHighest`; letter icons in template brand colors.

## Errors
Unexpected errors are shown in a red box at the bottom of the popup instead of leaving it blank.
