# Localization

Languages: **English** (default), **German** and **French** – the same as the Android app. German
and French use the informal address (du / tu); German keeps the word "Guardian". Docs are English.
The language follows the browser's UI language.

## Files
`src/locales/en.yml`, `de.yml`, `fr.yml`, read by `@wxt-dev/i18n`. At build time they become the
browser's `_locales/*/messages.json`; in code they're typed – a missing or misspelled key is a
type error.

```ts
import { i18n } from '#i18n';
i18n.t('blockTitle', [site]);         // "$1 is blocked"
i18n.t('durationMinutes', 5);         // plural: { 1: "$1 minute", n: "$1 minutes" }
```

Most texts were generated from the Android app's `strings.xml` (all three languages) and reworded
for the browser: "phone" → browser / computer, no apps, Android settings replaced by browser
settings. From now on the `.yml` files are the source; add new keys to all three files.

## Rules (as on Android)
- No user-visible text in code – always a message key (also notifications, block page).
- No string concatenation – positional placeholders `$1`, `$2`, since word order differs. Where a
  link sits inside a sentence, the sentence is split into "before" / "after" keys.
- Plurals with the `1:` / `n:` form.
- Dates and times with `toLocaleTimeString` / `toLocaleString`, never by hand.
- Leave room for longer texts (German is ~30 % longer).
- Brand and service names (YouTube, Telegram …) aren't translated.

## Adding a language
Add `src/locales/<code>.yml` with every key of `en.yml`. The Android app's `values-<code>/strings.xml`
is a good starting point.
