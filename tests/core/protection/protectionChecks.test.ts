// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, defaultAppState } from '@/core/data/appState';
import { TimedSession } from '@/core/policy/timedSession';
import { ClockCheck, GapCheck, PermissionWatch, tamperReportable, ZoneCheck, type Heartbeat } from '@/core/protection/protectionChecks';
import { FakeClock } from '../../testing/fakes';

const min = 60_000;

describe('protection checks', () => {
  test('needed and granted permissions', () => {
    expect(PermissionWatch.needed(DEFAULT_SETTINGS)).toEqual(new Set(['HOST_ACCESS', 'INCOGNITO_ACCESS']));
    expect(PermissionWatch.granted({ hostAccess: true, incognitoAccess: false })).toEqual(new Set(['HOST_ACCESS']));
  });

  test('only losses of working permissions count', () => {
    const needed = PermissionWatch.needed(DEFAULT_SETTINGS);
    // Never granted (e.g. right after setup): not tampering.
    expect(PermissionWatch.lost(new Set(), needed, new Set())).toEqual(new Set());
    expect(PermissionWatch.lost(new Set(['HOST_ACCESS', 'INCOGNITO_ACCESS']), needed, new Set(['HOST_ACCESS']))).toEqual(new Set(['INCOGNITO_ACCESS']));
    // No longer needed: not reported.
    expect(PermissionWatch.lost(new Set(['HOST_ACCESS']), new Set(), new Set())).toEqual(new Set());
  });

  const beat = (elapsed: number, o: Partial<Heartbeat> = {}): Heartbeat => ({ wallMillis: 0, elapsedMillis: elapsed, bootId: 7, inUse: true, reportable: true, ...o });

  test('stop while in use is a gap', () => {
    expect(GapCheck.stoppedMinutes(beat(0), 30 * min, 7)).toBe(30);
    expect(GapCheck.stoppedMinutes(beat(0), 5 * min, 7)).toBeNull(); // short restart
    expect(GapCheck.stoppedMinutes(beat(0, { bootId: 6 }), 30 * min, 7)).toBeNull(); // browser restarted
    expect(GapCheck.stoppedMinutes(beat(0, { inUse: false }), 30 * min, 7)).toBeNull(); // idle
    expect(GapCheck.stoppedMinutes(beat(0, { reportable: false }), 30 * min, 7)).toBeNull(); // unlocked
    expect(GapCheck.stoppedMinutes(null, 30 * min, 7)).toBeNull();
  });

  test('stopped while in use, then restarted', () => {
    const last = beat(0, { bootId: 6 });
    expect(GapCheck.stoppedBeforeRestart(last, 90 * min, 7)).toBe(90);
    expect(GapCheck.stoppedBeforeRestart(last, 5 * min, 7)).toBeNull(); // quick restart
    expect(GapCheck.stoppedBeforeRestart({ ...last, inUse: false }, 90 * min, 7)).toBeNull(); // clean close
    expect(GapCheck.stoppedBeforeRestart(last, 90 * min, 6)).toBeNull(); // same session: other check
  });

  test('browser sessions without Lares', () => {
    expect(GapCheck.sessionsWithoutLares(null, 5)).toBe(0);
    expect(GapCheck.sessionsWithoutLares(5, 5)).toBe(0);
    expect(GapCheck.sessionsWithoutLares(5, 6)).toBe(0);
    expect(GapCheck.sessionsWithoutLares(5, 8)).toBe(2);
  });

  test('clock jumps', () => {
    expect(ClockCheck.jumpMinutes(1_000, 3, 1_000 + 125 * min, 3)).toBe(125);
    expect(ClockCheck.jumpMinutes(1_000, 3, 1_000 - 60 * min, 3)).toBe(-60);
    expect(ClockCheck.jumpMinutes(1_000, 3, 1_000 + 30_000, 3)).toBeNull(); // network correction
    expect(ClockCheck.jumpMinutes(1_000, 2, 1_000 + 125 * min, 3)).toBeNull(); // other session
    expect(ClockCheck.jumpMinutes(null, null, 5, 3)).toBeNull();
  });

  test('time-zone change', () => {
    expect(ZoneCheck.changed('Europe/Berlin', 'Asia/Tokyo')).toBe('from=Europe/Berlin;to=Asia/Tokyo');
    expect(ZoneCheck.changed('Europe/Berlin', 'Europe/Berlin')).toBeNull();
    expect(ZoneCheck.changed(null, 'Europe/Berlin')).toBeNull();
  });

  test('only reportable while set up and locked', () => {
    const clock = new FakeClock();
    const locked = defaultAppState({ unlock: { method: 'PASSWORD' }, settings: { setupComplete: true } });
    expect(tamperReportable(locked, clock)).toBe(true);
    expect(tamperReportable(defaultAppState(), clock)).toBe(false);
    const unlocked = { ...locked, unlock: { ...locked.unlock, unlockedSession: TimedSession.start(60_000, clock) } };
    expect(tamperReportable(unlocked, clock)).toBe(false);
    const paused = { ...locked, unlock: { ...locked.unlock, pause: TimedSession.start(60_000, clock) } };
    expect(tamperReportable(paused, clock)).toBe(true);
  });
});
