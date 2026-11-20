// SPDX-License-Identifier: GPL-3.0-or-later
import { parseChannelConfig, type AlertChannelConfig } from '../alerts/alertChannels';
import { ResetSchedule } from '../policy/resetSchedule';
import type { TimedSession } from '../policy/timedSession';

export type UnlockMethod = 'PASSWORD' | 'TOTP';

/**
 * Tamper protections, each individually toggleable (disabling = loosening).
 * Browser port: Android's UNINSTALL (device admin) and SETTINGS_GUARD (Accessibility) don't exist
 * in an extension – only the guardian alerts remain. Unknown values are dropped when loading.
 */
export type Protection = 'GUARDIAN_ALERTS';
export const PROTECTIONS: readonly Protection[] = ['GUARDIAN_ALERTS'];

/**
 * "No TOTP step used / seen yet". Android uses `Long.MIN_VALUE`; that isn't a safe JS integer, so
 * the smallest safe integer stands in (any real counter is far above it).
 */
export const NO_COUNTER = Number.MIN_SAFE_INTEGER;

/**
 * Browser port: Android's `blockingMode` (Accessibility / Usage access), the website-blocking
 * switch with its hint and the app theme (Material You) are gone – the extension only blocks
 * websites, always. Everything else keeps the Android names and defaults.
 */
export interface AppSettings {
  readonly setupComplete: boolean;
  readonly protections: readonly Protection[];
  readonly resetMinuteOfDay: number;
  readonly pendingResetMinuteOfDay: number | null;
  readonly pendingResetEffectiveFromMillis: number | null;
  /** Guardian notification channels (secrets encrypted, see AlertChannelConfig). */
  readonly alertChannels: readonly AlertChannelConfig[];
  /** Countdown in the last 5 minutes of a limit. */
  readonly limitTimer: boolean;
  /** Optional notifications before a limit ends. */
  readonly warnFiveMinutes: boolean;
  readonly warnOneMinute: boolean;
  /** Rules export includes the TOTP package (only when the method is TOTP and the package exists). */
  readonly exportIncludesTotp: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  setupComplete: false,
  protections: [],
  resetMinuteOfDay: 0,
  pendingResetMinuteOfDay: null,
  pendingResetEffectiveFromMillis: null,
  alertChannels: [],
  limitTimer: true,
  warnFiveMinutes: false,
  warnOneMinute: false,
  exportIncludesTotp: true,
};

export function resetScheduleOf(settings: AppSettings): ResetSchedule {
  const { pendingResetMinuteOfDay: m, pendingResetEffectiveFromMillis: from } = settings;
  return new ResetSchedule(settings.resetMinuteOfDay, m !== null && from !== null ? { resetTime: m, effectiveFrom: from } : null);
}

export function withResetSchedule(settings: AppSettings, schedule: ResetSchedule): AppSettings {
  return {
    ...settings,
    resetMinuteOfDay: schedule.resetTime,
    pendingResetMinuteOfDay: schedule.pending?.resetTime ?? null,
    pendingResetEffectiveFromMillis: schedule.pending?.effectiveFrom ?? null,
  };
}

/** Credentials and unlock state. Secrets are only stored as hashes or encrypted ([SecretCipher]). */
export interface UnlockState {
  readonly method: UnlockMethod | null;
  readonly passwordHash: string | null;
  /** TOTP secret, encrypted with a device key (see [SecretCipher]). */
  readonly totpSecretEncrypted: string | null;
  readonly totpLastCounter: number;
  /** Highest TOTP time step seen at any unlock attempt (no replay after setting the clock back). */
  readonly totpMaxSeenCounter: number;
  /** The TOTP secret encrypted with the recovery code (TotpTransfer), for the rules export. */
  readonly totpTransfer: string | null;
  readonly recoveryHash: string | null;
  /** Set after the recovery code was used: the guardian must set up a new code. */
  readonly reSetupRequired: boolean;
  readonly failedAttempts: number;
  readonly lockout: TimedSession | null;
  readonly pause: TimedSession | null;
  readonly unlockedSession: TimedSession | null;
}

export const DEFAULT_UNLOCK: UnlockState = {
  method: null,
  passwordHash: null,
  totpSecretEncrypted: null,
  totpLastCounter: NO_COUNTER,
  totpMaxSeenCounter: NO_COUNTER,
  totpTransfer: null,
  recoveryHash: null,
  reSetupRequired: false,
  failedAttempts: 0,
  lockout: null,
  pause: null,
  unlockedSession: null,
};

export function isSetUp(unlock: UnlockState): boolean {
  return unlock.method !== null;
}

/** The usage period currently counted (advanced monotonically, see ResetSchedule.advance). */
export interface TrackedPeriod {
  readonly startMillis: number;
  readonly endMillis: number;
  /** Monotonic time when this period began being counted, and in which boot (clock-forward check). */
  readonly startElapsedMillis: number | null;
  readonly startBootId: number | null;
}

/** Monotonic time since the period started, or null if unknown (another boot). */
export function elapsedSinceStart(p: TrackedPeriod, nowElapsedMillis: number, bootId: number): number | null {
  return p.startElapsedMillis !== null && p.startBootId === bootId ? nowElapsedMillis - p.startElapsedMillis : null;
}

export interface AppState {
  readonly settings: AppSettings;
  readonly unlock: UnlockState;
  readonly trackedPeriod: TrackedPeriod | null;
}

export function defaultAppState(changes: { settings?: Partial<AppSettings>; unlock?: Partial<UnlockState>; trackedPeriod?: TrackedPeriod | null } = {}): AppState {
  return {
    settings: { ...DEFAULT_SETTINGS, ...changes.settings },
    unlock: { ...DEFAULT_UNLOCK, ...changes.unlock },
    trackedPeriod: changes.trackedPeriod ?? null,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickKnown<T extends object>(defaults: T, raw: unknown): T {
  if (!isRecord(raw)) return { ...defaults };
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const key of Object.keys(defaults)) if (raw[key] !== undefined) out[key] = raw[key];
  return out as T;
}

/**
 * Reads a stored state: missing fields get their defaults (stored data must stay readable across
 * updates – only additive fields), unknown protections and channel types (e.g. Android's EMAIL)
 * are dropped. Values are otherwise trusted (the extension wrote them).
 */
export function restoreAppState(raw: unknown): AppState {
  const r = isRecord(raw) ? raw : {};
  const settings = pickKnown(DEFAULT_SETTINGS, r.settings);
  const protections = Array.isArray(settings.protections) ? settings.protections : [];
  const channels = Array.isArray(settings.alertChannels) ? settings.alertChannels : [];
  return {
    settings: {
      ...settings,
      protections: [...new Set(protections.filter((p): p is Protection => PROTECTIONS.includes(p)))],
      alertChannels: channels.map(parseChannelConfig).filter((c): c is AlertChannelConfig => c !== null),
    },
    unlock: pickKnown(DEFAULT_UNLOCK, r.unlock),
    trackedPeriod: isRecord(r.trackedPeriod) ? pickKnown({ startMillis: 0, endMillis: 0, startElapsedMillis: null, startBootId: null }, r.trackedPeriod) : null,
  };
}

export type Unsubscribe = () => void;

/** Persistent, atomically updated app state (storage in production, in-memory in tests). */
export interface StateStore {
  current(): Promise<AppState>;

  /** Applies [transform] atomically and returns the new state. */
  update(transform: (state: AppState) => AppState): Promise<AppState>;

  /** Called with the current state right away and after every change. */
  subscribe(listener: (state: AppState) => void): Unsubscribe;
}

/**
 * Encrypts small secrets with a key that never leaves the device (Android: Keystore; browser:
 * non-extractable WebCrypto key, implemented in the platform layer). Async because of WebCrypto.
 */
export interface SecretCipher {
  encrypt(plain: Uint8Array): Promise<string>;
  decrypt(encoded: string): Promise<Uint8Array>;
}

/** Thrown when a loosening change is attempted while the app isn't unlocked. */
export class CodeRequiredError extends Error {
  constructor() {
    super('This change loosens restrictions and needs the guardian code');
    this.name = 'CodeRequiredError';
  }
}
