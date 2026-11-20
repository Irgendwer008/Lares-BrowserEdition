// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppSettings, AppState } from '../data/appState';
import { isSetUp } from '../data/appState';
import type { GrantedPermissions } from '../data/setupRequirements';
import type { TamperEventType } from '../data/tamperLog';
import { TimedSession } from '../policy/timedSession';
import type { Clock } from '../time/clock';

/**
 * Tamper events are only recorded while Lares is set up and locked: whoever changes something
 * in unlocked mode has entered the guardian code. A pause doesn't count as unlocked.
 */
export function tamperReportable(state: AppState, clock: Clock): boolean {
  return state.settings.setupComplete && isSetUp(state.unlock) && !TimedSession.isActive(state.unlock.unlockedSession, clock);
}

/**
 * Browser permissions whose loss is reported. Browser port: Android watches Accessibility, usage
 * access, overlay and device admin; an extension instead depends on its host permission and on
 * being allowed in private windows. Both map to PERMISSION_REVOKED.
 */
export type WatchedPermission = 'HOST_ACCESS' | 'INCOGNITO_ACCESS';

export const WATCHED_PERMISSION_EVENT: Readonly<Record<WatchedPermission, TamperEventType>> = {
  HOST_ACCESS: 'PERMISSION_REVOKED',
  INCOGNITO_ACCESS: 'PERMISSION_REVOKED',
};

export const PermissionWatch = {
  /** What the current settings need (same rules as SetupRequirements: always both in the browser). */
  needed(_settings: AppSettings): Set<WatchedPermission> {
    return new Set<WatchedPermission>(['HOST_ACCESS', 'INCOGNITO_ACCESS']);
  },

  granted(granted: GrantedPermissions): Set<WatchedPermission> {
    const out = new Set<WatchedPermission>();
    if (granted.hostAccess) out.add('HOST_ACCESS');
    if (granted.incognitoAccess) out.add('INCOGNITO_ACCESS');
    return out;
  },

  /**
   * Permissions that were working ([previouslyWorking]) and are needed, but are gone now. Only
   * losses count – something never granted (e.g. right after setup) is a setup issue, not tampering.
   */
  lost(previouslyWorking: ReadonlySet<WatchedPermission>, needed: ReadonlySet<WatchedPermission>, granted: ReadonlySet<WatchedPermission>): Set<WatchedPermission> {
    return new Set([...previouslyWorking].filter((p) => needed.has(p) && !granted.has(p)));
  },
};

/**
 * Last sign of life of the running protection (see GapCheck).
 * `bootId` is the browser session (Android: boot counter). `inUse` replaces Android's
 * `screenOn`: the platform sets it while the user is active (e.g. idle state "active") and clears
 * it when the system goes idle / locked or the browser is about to close, where detectable.
 */
export interface Heartbeat {
  readonly wallMillis: number;
  readonly elapsedMillis: number;
  readonly bootId: number;
  readonly inUse: boolean;
  /** Locked at that time (a stop in unlocked mode isn't reported). */
  readonly reportable: boolean;
}

/** Shorter stops are ignored (restarts take a moment; MV3 workers are suspended regularly). */
const STOP_THRESHOLD_MILLIS = 10 * 60_000;

export const GapCheck = {
  STOP_THRESHOLD_MILLIS,

  /**
   * Minutes the protection was stopped while the browser was in use, or null. Only within one
   * browser session (a restart is normal) and only if the last heartbeat came while in use.
   */
  stoppedMinutes(last: Heartbeat | null, nowElapsedMillis: number, bootId: number): number | null {
    if (last === null || last.bootId !== bootId || !last.inUse || !last.reportable) return null;
    const gap = nowElapsedMillis - last.elapsedMillis;
    return gap > STOP_THRESHOLD_MILLIS ? Math.trunc(gap / 60_000) : null;
  },

  /**
   * Minutes from the last heartbeat of an earlier session to the start of this one, if it came
   * while in use. Note: unlike Android's clean shutdown, a browser doesn't reliably mark its last
   * heartbeat when it closes – the platform should only use this where it can tell (see Heartbeat).
   */
  stoppedBeforeRestart(last: Heartbeat | null, sessionStartWallMillis: number, bootId: number): number | null {
    if (last === null || last.bootId === bootId || !last.inUse || !last.reportable) return null;
    const gap = sessionStartWallMillis - last.wallMillis;
    return gap > STOP_THRESHOLD_MILLIS ? Math.trunc(gap / 60_000) : null;
  },

  /**
   * Browser sessions in which Lares didn't run at all (Android: "boots without Lares", e.g. safe
   * mode). Only meaningful if the platform's session counter also grows without the extension
   * (otherwise it always returns 0).
   */
  sessionsWithoutLares(lastBootId: number | null, bootId: number): number {
    return lastBootId === null || bootId <= lastBootId ? 0 : bootId - lastBootId - 1;
  },
};

/** Network time corrections are small; only real changes are reported. */
const CLOCK_THRESHOLD_MILLIS = 2 * 60_000;

export const ClockCheck = {
  THRESHOLD_MILLIS: CLOCK_THRESHOLD_MILLIS,

  /**
   * Minutes the wall clock jumped (positive = forward), or null. The offset wall − elapsed
   * stays constant unless the clock is set; offsets from another boot can't be compared.
   */
  jumpMinutes(previousOffset: number | null, previousBoot: number | null, offset: number, bootId: number): number | null {
    if (previousOffset === null || previousBoot !== bootId) return null;
    const delta = offset - previousOffset;
    return Math.abs(delta) > CLOCK_THRESHOLD_MILLIS ? Math.trunc(delta / 60_000) : null;
  },
};

export const ZoneCheck = {
  /** Details for TIMEZONE_CHANGED ("from=…;to=…", as on Android), or null if unchanged / unknown. */
  changed(previousZone: string | null, zone: string): string | null {
    return previousZone !== null && previousZone !== zone ? `from=${previousZone};to=${zone}` : null;
  },
};
