// SPDX-License-Identifier: GPL-3.0-or-later
import type { AppSettings } from './appState';

/**
 * Something that keeps blocking / protection from working, shown on the main screen.
 *
 * Browser port: Android's NO_BLOCKING_MODE, ACCESSIBILITY, USAGE_ACCESS, OVERLAY, DEVICE_ADMIN and
 * BATTERY_OPTIMIZATION have no browser equivalent. What an extension needs instead:
 * - HOST_ACCESS: access to all sites for the countdown (optional host permission in Firefox MV3,
 *   revocable by the user in both browsers).
 * - INCOGNITO_ACCESS: allowed in private windows – otherwise a private window bypasses every rule.
 */
export type SetupIssue = 'HOST_ACCESS' | 'INCOGNITO_ACCESS';

/** false = recommendation (Android: battery optimization). */
export const SETUP_ISSUE_REQUIRED: Readonly<Record<SetupIssue, boolean>> = {
  HOST_ACCESS: false, // only the countdown needs it – blocking works without
  INCOGNITO_ACCESS: true,
};

/** What the user has currently granted in the browser. */
export interface GrantedPermissions {
  readonly hostAccess: boolean;
  readonly incognitoAccess: boolean;
}

export const SetupRequirements = {
  /** Everything still missing, all at once (settings kept as parameter for parity / future needs). */
  missing(_settings: AppSettings, granted: GrantedPermissions): SetupIssue[] {
    const issues: SetupIssue[] = [];
    if (!granted.hostAccess) issues.push('HOST_ACCESS');
    if (!granted.incognitoAccess) issues.push('INCOGNITO_ACCESS');
    return issues;
  },
};
