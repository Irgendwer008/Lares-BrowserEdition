// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Minimal replacement for the java.time parts the Android core uses (ZonedDateTime.of, local date
 * of an instant), built on `Intl.DateTimeFormat`. Time zones are IANA ids (e.g. "Europe/Berlin").
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A local time of day as minutes after midnight (0‥1439). Seconds are never used by Lares. */
export type MinuteOfDay = number;

export function minuteOfDay(hour: number, minute = 0): MinuteOfDay {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new RangeError(`invalid time ${hour}:${minute}`);
  }
  return hour * 60 + minute;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      era: 'short',
    });
    formatters.set(zone, f);
  }
  return f;
}

/** Offset of [zone] from UTC at [instant], in millis (e.g. +3_600_000 for CET). */
export function zoneOffsetMillis(zone: string, instant: number): number {
  const parts: Record<string, string> = {};
  for (const p of formatter(zone).formatToParts(new Date(instant))) parts[p.type] = p.value;
  let year = Number(parts.year);
  if (parts.era === 'BC' || parts.era === 'B') year = 1 - year;
  const asUtc = Date.UTC(year, Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const wholeSeconds = Math.floor(instant / 1000) * 1000;
  return asUtc - wholeSeconds;
}

/** Days since 1970-01-01 of the local date of [instant] in [zone]. */
export function localEpochDay(instant: number, zone: string): number {
  return Math.floor((instant + zoneOffsetMillis(zone, instant)) / DAY);
}

/**
 * Like java's `ZonedDateTime.of(date, time, zone).toInstant()`: in an overlap the earlier offset
 * wins; in a gap the local time is moved later by the length of the gap.
 */
export function zonedInstant(epochDay: number, time: MinuteOfDay, zone: string): number {
  const local = epochDay * DAY + time * MINUTE;
  const before = zoneOffsetMillis(zone, local - DAY);
  const after = zoneOffsetMillis(zone, local + DAY);
  if (zoneOffsetMillis(zone, local - before) === before) return local - before;
  if (zoneOffsetMillis(zone, local - after) === after) return local - after;
  return local - before; // gap
}

/** The system time zone (standard JS, also available in service workers). */
export function systemZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
