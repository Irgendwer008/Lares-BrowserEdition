// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { DEFAULT_SETTINGS, DEFAULT_UNLOCK, defaultAppState, elapsedSinceStart, NO_COUNTER, restoreAppState } from '@/core/data/appState';

describe('AppState', () => {
  test('restoring fills in defaults (additive fields)', () => {
    expect(restoreAppState(undefined)).toEqual(defaultAppState());
    const restored = restoreAppState({ settings: { setupComplete: true }, unlock: { method: 'TOTP' } });
    expect(restored.settings).toEqual({ ...DEFAULT_SETTINGS, setupComplete: true });
    expect(restored.unlock).toEqual({ ...DEFAULT_UNLOCK, method: 'TOTP' });
    expect(restored.unlock.totpLastCounter).toBe(NO_COUNTER);
    expect(restored.trackedPeriod).toBeNull();
  });

  test('restoring drops unknown protections and email channels', () => {
    const restored = restoreAppState({
      settings: {
        protections: ['UNINSTALL', 'GUARDIAN_ALERTS', 'SETTINGS_GUARD'],
        alertChannels: [
          { id: 'a', type: 'EMAIL', language: 'de', server: 'smtp.example.org', port: 465 },
          { id: 'b', type: 'NTFY', language: 'de', server: 'https://ntfy.sh', address: 't', deliveredUpTo: 5 },
        ],
      },
    });
    expect(restored.settings.protections).toEqual(['GUARDIAN_ALERTS']);
    expect(restored.settings.alertChannels).toEqual([
      { id: 'b', type: 'NTFY', language: 'de', server: 'https://ntfy.sh', address: 't', secretEncrypted: null, deliveredUpTo: 5 },
    ]);
  });

  test('tracked period knows the monotonic time since its start only in the same boot', () => {
    const p = { startMillis: 0, endMillis: 1, startElapsedMillis: 1_000, startBootId: 2 };
    expect(elapsedSinceStart(p, 5_000, 2)).toBe(4_000);
    expect(elapsedSinceStart(p, 5_000, 3)).toBeNull();
  });
});
