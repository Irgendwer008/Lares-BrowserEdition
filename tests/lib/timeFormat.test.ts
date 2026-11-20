// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from 'vitest';
import { dayPeriods, formatMinuteOfDay, uses24h } from '@/lib/timeFormat';

test('24-hour locales', () => {
  for (const l of ['de', 'de-DE', 'fr', 'fr-FR', 'en-GB']) expect(uses24h(l), l).toBe(true);
  expect(formatMinuteOfDay(22 * 60 + 30, 'de')).toBe('22:30');
  expect(formatMinuteOfDay(0, 'fr')).toBe('00:00');
  expect(formatMinuteOfDay(8 * 60, 'de')).toBe('08:00');
});

test('12-hour locales', () => {
  for (const l of ['en', 'en-US']) expect(uses24h(l), l).toBe(false);
  expect(formatMinuteOfDay(22 * 60 + 30, 'en-US').replace(/\s/g, ' ')).toBe('10:30 PM');
  const p = dayPeriods('en-US');
  expect([p.am, p.pm, p.first]).toEqual(['AM', 'PM', false]);
  expect(dayPeriods('ko').first).toBe(true); // 오전 9시
});
