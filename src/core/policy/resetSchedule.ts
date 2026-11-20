// SPDX-License-Identifier: GPL-3.0-or-later
import { localEpochDay, zonedInstant, type MinuteOfDay } from '../time/zonedTime';

/** One usage period ("day") for daily limits: [start, end) in epoch millis. Usage is stored per period start. */
export interface UsagePeriod {
  readonly start: number;
  readonly end: number;
}

export function periodContains(p: UsagePeriod, instant: number): boolean {
  return instant >= p.start && instant < p.end;
}

/** A requested reset-time change; it takes effect at `effectiveFrom` (the next regular reset). */
export interface PendingReset {
  readonly resetTime: MinuteOfDay;
  readonly effectiveFrom: number;
}

/** Daylight saving time can make a day an hour shorter; small clock corrections. */
const CLOCK_TOLERANCE_MILLIS = 2 * 60 * 60_000;
/** Shortest regular day (DST) – a period after a zone change is never shorter. */
const MIN_FOLLOWING_PERIOD_MILLIS = 23 * 60 * 60_000;

function latestOccurrence(time: MinuteOfDay, now: number, zone: string): number {
  const day = localEpochDay(now, zone);
  const candidate = zonedInstant(day, time, zone);
  return candidate > now ? zonedInstant(day - 1, time, zone) : candidate;
}

function nextOccurrence(time: MinuteOfDay, now: number, zone: string): number {
  const day = localEpochDay(now, zone);
  const candidate = zonedInstant(day, time, zone);
  return candidate <= now ? zonedInstant(day + 1, time, zone) : candidate;
}

/**
 * Configurable daily reset time (default midnight). Changing it is loosening and only takes
 * effect after the next reset, so changing it never ends the current period early.
 * Instants are epoch millis, zones IANA ids, times minutes after midnight.
 */
export class ResetSchedule {
  static readonly CLOCK_TOLERANCE_MILLIS = CLOCK_TOLERANCE_MILLIS;
  static readonly MIN_FOLLOWING_PERIOD_MILLIS = MIN_FOLLOWING_PERIOD_MILLIS;

  constructor(
    readonly resetTime: MinuteOfDay = 0,
    readonly pending: PendingReset | null = null,
  ) {}

  /** Schedules a change of the reset time, effective at the next reset under the current schedule. */
  requestChange(newTime: MinuteOfDay, now: number, zone: string): ResetSchedule {
    const current = this.settle(now, zone);
    if (newTime === current.resetTime) return new ResetSchedule(current.resetTime, null);
    const next = current.periodAt(now, zone).end;
    return new ResetSchedule(current.resetTime, { resetTime: newTime, effectiveFrom: next });
  }

  /** Applies a pending change once its transition period is completely over. */
  settle(now: number, zone: string): ResetSchedule {
    const p = this.pending;
    if (p === null) return this;
    const transitionEnd = nextOccurrence(p.resetTime, p.effectiveFrom, zone);
    return now >= transitionEnd ? new ResetSchedule(p.resetTime) : this;
  }

  /** The period containing [now]. */
  periodAt(now: number, zone: string): UsagePeriod {
    const p = this.pending;
    if (p === null || now < p.effectiveFrom) {
      const start = latestOccurrence(this.resetTime, now, zone);
      const next = nextOccurrence(this.resetTime, now, zone);
      return { start, end: p !== null ? Math.min(next, p.effectiveFrom) : next };
    }
    // Transition: the period starting at the old reset lasts until the new reset time.
    const start = Math.max(latestOccurrence(p.resetTime, now, zone), p.effectiveFrom);
    return { start, end: nextOccurrence(p.resetTime, now, zone) };
  }

  /**
   * Advances the tracked period monotonically. A period only ends when its stored end is
   * reached, so setting the clock back never grants a fresh quota; setting it forward or
   * switching time zones doesn't either (both are also reported as tamper events):
   * - [elapsedSinceStartMillis] (monotonic time since the current period started, null if
   *   unknown – e.g. another boot): a period can't end before most of its length really passed.
   * - A period that follows directly (time-zone change near the end) lasts at least
   *   MIN_FOLLOWING_PERIOD_MILLIS, so repeated zone changes can't chain short periods.
   */
  advance(current: UsagePeriod | null, now: number, zone: string, elapsedSinceStartMillis: number | null = null): UsagePeriod {
    if (current !== null && now < current.end) return current;
    if (current !== null && elapsedSinceStartMillis !== null) {
      const length = current.end - current.start;
      if (elapsedSinceStartMillis < length - CLOCK_TOLERANCE_MILLIS) return current; // clock set forward
    }
    const next = this.periodAt(now, zone);
    if (current !== null && next.start < current.end) {
      // Never overlap the previous period (e.g. after a time-zone change).
      return { start: current.end, end: Math.max(next.end, current.end + MIN_FOLLOWING_PERIOD_MILLIS) };
    }
    return next;
  }
}
