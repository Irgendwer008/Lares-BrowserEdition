// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { ResetSchedule } from '@/core/policy/resetSchedule';
import { minuteOfDay, zonedInstant } from '@/core/time/zonedTime';

const berlin = 'Europe/Berlin';
const DAY = 86_400_000;

/** `LocalDateTime.parse(s).atZone(zone).toInstant()` in epoch millis. */
function at(s: string, zone = berlin): number {
  const [date, time] = s.split('T') as [string, string];
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  return zonedInstant(Math.floor(Date.UTC(y, mo - 1, d) / DAY), h * 60 + mi, zone);
}

describe('ResetSchedule', () => {
  test('midnight default', () => {
    expect(new ResetSchedule().periodAt(at('2026-11-11T15:00'), berlin)).toEqual({ start: at('2026-11-11T00:00'), end: at('2026-11-12T00:00') });
    expect(at('2026-11-11T00:00')).toBe(Date.UTC(2026, 10, 10, 23));
  });

  test('custom reset before and after', () => {
    const s = new ResetSchedule(minuteOfDay(4));
    expect(s.periodAt(at('2026-11-11T02:00'), berlin)).toEqual({ start: at('2026-11-10T04:00'), end: at('2026-11-11T04:00') });
    expect(s.periodAt(at('2026-11-11T04:00'), berlin)).toEqual({ start: at('2026-11-11T04:00'), end: at('2026-11-12T04:00') });
  });

  test('DST change gives a 23 hour period', () => {
    const p = new ResetSchedule().periodAt(at('2026-03-29T12:00'), berlin);
    expect(p.end - p.start).toBe(23 * 3_600_000);
    const q = new ResetSchedule().periodAt(at('2026-10-25T12:00'), berlin);
    expect(q.end - q.start).toBe(25 * 3_600_000);
  });

  test('reset inside a DST gap / overlap resolves like java.time', () => {
    // 02:30 doesn't exist on 2026-03-29 in Berlin → 03:30 CEST; on 2026-10-25 it exists twice → the earlier one.
    expect(at('2026-03-29T02:30')).toBe(Date.UTC(2026, 2, 29, 1, 30));
    expect(at('2026-10-25T02:30')).toBe(Date.UTC(2026, 9, 25, 0, 30));
  });

  test('change takes effect after next reset and never shortens the current period', () => {
    const now = at('2026-11-11T21:00');
    const s = new ResetSchedule().requestChange(minuteOfDay(4), now, berlin);
    expect(s.pending).toEqual({ resetTime: minuteOfDay(4), effectiveFrom: at('2026-11-12T00:00') });
    expect(s.periodAt(now, berlin)).toEqual({ start: at('2026-11-11T00:00'), end: at('2026-11-12T00:00') });
    // Transition period: old reset at midnight until the new reset at 04:00 the next day.
    expect(s.periodAt(at('2026-11-12T01:00'), berlin)).toEqual({ start: at('2026-11-12T00:00'), end: at('2026-11-12T04:00') });
    // Afterwards the new schedule applies and settles.
    expect(s.periodAt(at('2026-11-12T10:00'), berlin)).toEqual({ start: at('2026-11-12T04:00'), end: at('2026-11-13T04:00') });
    expect(s.settle(at('2026-11-12T10:00'), berlin)).toEqual(new ResetSchedule(minuteOfDay(4)));
    expect(s.settle(at('2026-11-12T01:00'), berlin)).toBe(s);
  });

  test('change to an earlier time', () => {
    const s = new ResetSchedule(minuteOfDay(4)).requestChange(minuteOfDay(20), at('2026-11-11T10:00'), berlin);
    expect(s.pending!.effectiveFrom).toBe(at('2026-11-12T04:00'));
    expect(s.periodAt(at('2026-11-11T21:00'), berlin)).toEqual({ start: at('2026-11-11T04:00'), end: at('2026-11-12T04:00') });
    expect(s.periodAt(at('2026-11-12T05:00'), berlin)).toEqual({ start: at('2026-11-12T04:00'), end: at('2026-11-12T20:00') });
  });

  test('requesting the current time cancels pending', () => {
    const now = at('2026-11-11T10:00');
    const s = new ResetSchedule().requestChange(minuteOfDay(4), now, berlin);
    expect(s.requestChange(0, now, berlin)).toEqual(new ResetSchedule());
  });

  test('advance is monotonic', () => {
    const s = new ResetSchedule();
    const p = s.advance(null, at('2026-11-11T10:00'), berlin);
    // Clock set back a day: still the same period, no fresh quota.
    expect(s.advance(p, at('2026-11-10T10:00'), berlin)).toEqual(p);
    // Time-zone change that would make the period "end" earlier: still the same period.
    expect(s.advance(p, at('2026-11-11T23:00'), 'Asia/Tokyo')).toEqual(p);
    // Normal rollover.
    expect(s.advance(p, at('2026-11-12T00:00'), berlin)).toEqual({ start: at('2026-11-12T00:00'), end: at('2026-11-13T00:00') });
  });

  test('advance after a zone change does not overlap', () => {
    const s = new ResetSchedule();
    const p = s.advance(null, at('2026-11-11T10:00'), berlin);
    const next = s.advance(p, at('2026-11-12T00:00'), 'America/New_York');
    expect(next.start).toBe(p.end);
  });

  test('zone changes cannot chain short periods', () => {
    const s = new ResetSchedule();
    const p = s.advance(null, at('2026-11-11T10:00'), berlin);
    const next = s.advance(p, p.end, 'Asia/Tokyo');
    expect(next.start).toBe(p.end);
    expect(next.end - next.start).toBeGreaterThanOrEqual(ResetSchedule.MIN_FOLLOWING_PERIOD_MILLIS);
  });

  test('clock set forward does not end the period early', () => {
    const s = new ResetSchedule();
    const p = s.advance(null, at('2026-11-11T10:00'), berlin);
    const hour = 3_600_000;
    expect(s.advance(p, at('2026-11-13T10:00'), berlin, hour)).toEqual(p);
    const later = s.advance(p, at('2026-11-13T10:00'), berlin, 23 * hour);
    expect(later.start).toBeGreaterThan(p.start);
    expect(s.advance(p, at('2026-11-12T00:00'), berlin, null).start).toBe(p.end);
  });
});
