// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from 'vitest';
import { DEFAULT_SETTINGS } from '@/core/data/appState';
import { SETUP_ISSUE_REQUIRED, SetupRequirements } from '@/core/data/setupRequirements';

test('lists every missing browser permission at once', () => {
  expect(SetupRequirements.missing(DEFAULT_SETTINGS, { hostAccess: false, incognitoAccess: false })).toEqual(['HOST_ACCESS', 'INCOGNITO_ACCESS']);
  expect(SetupRequirements.missing(DEFAULT_SETTINGS, { hostAccess: true, incognitoAccess: false })).toEqual(['INCOGNITO_ACCESS']);
  expect(SetupRequirements.missing(DEFAULT_SETTINGS, { hostAccess: true, incognitoAccess: true })).toEqual([]);
  expect(SETUP_ISSUE_REQUIRED.HOST_ACCESS).toBe(false);
});
