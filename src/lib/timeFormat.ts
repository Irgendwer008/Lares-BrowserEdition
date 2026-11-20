// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Times of day in the browser's UI language (the language Lares' texts are shown in), so a German
 * browser shows "22:30" and an American one "10:30 PM" – independent of the operating system's
 * settings, which the native <input type="time"> would follow.
 */

/** The browser's UI language, e.g. "de" or "en-US". */
export function uiLocale(): string {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return navigator.language;
  }
}

/** Whether [locale] writes times with a 24-hour clock. */
export function uses24h(locale: string = uiLocale()): boolean {
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle;
  return cycle === 'h23' || cycle === 'h24';
}

/** 24-hour clocks with a leading zero ("08:00", "00:00"), 12-hour without ("8:00 AM"). */
const timeFormat = (locale: string) => new Intl.DateTimeFormat(locale, { hour: uses24h(locale) ? '2-digit' : 'numeric', minute: '2-digit' });

/** "22:30" / "10:30 PM" for an instant. */
export function formatTime(date: Date, locale: string = uiLocale()): string {
  return timeFormat(locale).format(date);
}

/** "22:30" / "10:30 PM" for minutes after midnight. */
export function formatMinuteOfDay(minuteOfDay: number, locale: string = uiLocale()): string {
  return formatTime(new Date(2000, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60), locale);
}

/** Localized "AM" / "PM" labels and whether they come before the hour in [locale]. */
export function dayPeriods(locale: string = uiLocale()): { am: string; pm: string; first: boolean } {
  const f = new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' });
  const label = (h: number) => f.formatToParts(new Date(2000, 0, 1, h)).find((p) => p.type === 'dayPeriod')?.value ?? (h < 12 ? 'AM' : 'PM');
  const parts = f.formatToParts(new Date(2000, 0, 1, 9));
  const first = parts.findIndex((p) => p.type === 'dayPeriod') < parts.findIndex((p) => p.type === 'hour');
  return { am: label(9), pm: label(21), first };
}
