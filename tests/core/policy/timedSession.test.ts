// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { TimedSession } from '@/core/policy/timedSession';

describe('TimedSession', () => {
  const s = TimedSession.startAt(15 * 60_000, 5_000, 3);

  test('uses the monotonic clock within the same boot', () => {
    expect(TimedSession.isActiveAt(s, 5_000, 3)).toBe(true);
    expect(TimedSession.remainingMillisAt(s, 5_000 + 14 * 60_000, 3)).toBe(60_000);
    expect(TimedSession.isActiveAt(s, 5_000 + 15 * 60_000, 3)).toBe(false);
  });

  test('END sessions stop on reboot', () => {
    expect(TimedSession.isActiveAt(s, 10, 4)).toBe(false);
  });

  test('RESTART sessions start over after reboot', () => {
    const lockout = TimedSession.startAt(60_000, 5_000, 3, 'RESTART');
    expect(TimedSession.remainingMillisAt(lockout, 10, 4)).toBe(60_000);
  });

  test('restarted elapsed time with unchanged boot id is treated as reboot', () => {
    const s2 = TimedSession.startAt(10 * 60_000, 5 * 3_600_000, 3);
    expect(TimedSession.remainingMillisAt(s2, 60_000, 3)).toBe(0);
    const lockout = TimedSession.startAt(60_000, 5 * 3_600_000, 3, 'RESTART');
    expect(TimedSession.remainingMillisAt(lockout, 60_000, 3)).toBe(60_000);
  });

  test('validates', () => {
    expect(() => TimedSession.startAt(0, 0, 1)).toThrow();
  });
});
