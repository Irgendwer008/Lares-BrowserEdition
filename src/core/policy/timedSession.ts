// SPDX-License-Identifier: GPL-3.0-or-later
import type { Clock } from '../time/clock';

/**
 * What happens to a [TimedSession] when the browser restarts ("reboot", see CLAUDE.md).
 * END: the session ends (unlocked mode, pause – ending them is tightening).
 * RESTART: the session starts over with its full duration (wrong-code waiting time).
 */
export type AfterReboot = 'END' | 'RESTART';

/**
 * A time-boxed state (unlocked mode, pause, wrong-code waiting time), measured with the monotonic
 * clock, so changing the system clock or time zone never shortens or extends it.
 *
 * The monotonic clock restarts at every boot and there is no trustworthy clock across a reboot
 * (the wall clock can be set freely), so a reboot never extends a session: see [AfterReboot].
 *
 * `bootId` identifies the boot in which `elapsedEndMillis` is valid.
 * JSON field names match the Android app's kotlinx serialization.
 */
export interface TimedSession {
  readonly elapsedEndMillis: number;
  readonly bootId: number;
  readonly durationMillis: number;
  readonly afterReboot: AfterReboot;
}

function remaining(s: TimedSession, nowElapsedMillis: number, currentBootId: number): number {
  const restart = s.afterReboot === 'RESTART';
  // More left than the whole duration: elapsed time restarted although the boot id didn't
  // change (boot counter missing) – treat it like a reboot.
  if (currentBootId === s.bootId && s.elapsedEndMillis - nowElapsedMillis > s.durationMillis) return restart ? s.durationMillis : 0;
  if (currentBootId === s.bootId) return s.elapsedEndMillis - nowElapsedMillis;
  return restart ? s.durationMillis : 0;
}

export const TimedSession = {
  create(elapsedEndMillis: number, bootId: number, durationMillis: number, afterReboot: AfterReboot = 'END'): TimedSession {
    if (!(elapsedEndMillis >= 0 && durationMillis > 0)) throw new RangeError('invalid session');
    return { elapsedEndMillis, bootId, durationMillis, afterReboot };
  },

  start(durationMillis: number, clock: Clock, afterReboot: AfterReboot = 'END'): TimedSession {
    return TimedSession.startAt(durationMillis, clock.elapsedMillis(), clock.bootId(), afterReboot);
  },

  startAt(durationMillis: number, nowElapsedMillis: number, bootId: number, afterReboot: AfterReboot = 'END'): TimedSession {
    if (!(durationMillis > 0)) throw new RangeError('duration must be positive');
    return TimedSession.create(nowElapsedMillis + durationMillis, bootId, durationMillis, afterReboot);
  },

  remainingMillisAt(s: TimedSession, nowElapsedMillis: number, currentBootId: number): number {
    return remaining(s, nowElapsedMillis, currentBootId);
  },

  isActiveAt(s: TimedSession, nowElapsedMillis: number, currentBootId: number): boolean {
    return remaining(s, nowElapsedMillis, currentBootId) > 0;
  },

  remainingMillis(s: TimedSession, clock: Clock): number {
    return remaining(s, clock.elapsedMillis(), clock.bootId());
  },

  isActive(s: TimedSession | null | undefined, clock: Clock): boolean {
    return s != null && remaining(s, clock.elapsedMillis(), clock.bootId()) > 0;
  },

  /** True if the session belongs to an earlier boot (a RESTART session must then be restarted). */
  isFromEarlierBoot(s: TimedSession, clock: Clock): boolean {
    return s.bootId !== clock.bootId();
  },

  /** The same session started over in the current boot. */
  restarted(s: TimedSession, clock: Clock): TimedSession {
    return TimedSession.start(s.durationMillis, clock, s.afterReboot);
  },
};
