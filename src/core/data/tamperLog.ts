// SPDX-License-Identifier: GPL-3.0-or-later
import type { Unsubscribe } from './appState';

/**
 * See docs/unlock-and-security.md, "Tamper events". Browser port: Android's
 * DEVICE_ADMIN_DISABLED and ACCESSIBILITY_DISABLED don't exist; PERMISSION_REVOKED covers
 * "extension permission / incognito access lost".
 */
export type TamperEventType =
  | 'PERMISSION_REVOKED'
  | 'PROTECTION_GAP'
  | 'CLOCK_CHANGED'
  | 'TIMEZONE_CHANGED'
  | 'REPEATED_WRONG_CODE'
  | 'RECOVERY_CODE_USED';

export interface TamperEvent {
  readonly id: number;
  readonly type: TamperEventType;
  readonly timestampMillis: number;
  readonly details: string | null;
  readonly delivered: boolean;
}

/** Records tamper events; the alert dispatcher later delivers undelivered ones to the guardian. */
export interface TamperLog {
  record(type: TamperEventType, details?: string | null): Promise<void>;
  undelivered(): Promise<TamperEvent[]>;
  markDelivered(id: number): Promise<void>;
  subscribe(listener: (events: readonly TamperEvent[]) => void): Unsubscribe;
}
