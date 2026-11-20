// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { ChangePolicy, combineChanges, needsCode } from '@/core/policy/changePolicy';
import { copyRule, createRule } from '@/core/policy/rule';
import { minuteOfDay } from '@/core/time/zonedTime';

describe('ChangePolicy', () => {
  const site = createRule(1, 'WEBSITE', 'instagram.com');
  const limited = copyRule(site, { limitMinutesPerDay: 30 });

  test('adding and removing', () => {
    expect(ChangePolicy.classify(null, site)).toBe('TIGHTENING');
    expect(ChangePolicy.classify(null, copyRule(site, { enabled: false }))).toBe('NONE');
    expect(ChangePolicy.classify(site, null)).toBe('LOOSENING');
    expect(ChangePolicy.classify(copyRule(site, { enabled: false }), null)).toBe('NONE');
  });

  test('enabling and disabling', () => {
    expect(ChangePolicy.classify(site, copyRule(site, { enabled: false }))).toBe('LOOSENING');
    expect(ChangePolicy.classify(copyRule(site, { enabled: false }), site)).toBe('TIGHTENING');
  });

  test('limits', () => {
    expect(ChangePolicy.classify(limited, copyRule(limited, { limitMinutesPerDay: 10 }))).toBe('TIGHTENING');
    expect(ChangePolicy.classify(limited, copyRule(limited, { limitMinutesPerDay: 60 }))).toBe('LOOSENING');
    expect(ChangePolicy.classify(limited, site)).toBe('TIGHTENING');
    expect(ChangePolicy.classify(site, limited)).toBe('LOOSENING');
    expect(ChangePolicy.classify(copyRule(site, { limitMinutesPerDay: 0 }), site)).toBe('NONE');
  });

  test('retargeting is loosening', () => {
    const app = createRule(1, 'APP', 'com.instagram.android');
    expect(ChangePolicy.classify(app, copyRule(app, { target: 'com.zhiliaoapp.musically' }))).toBe('LOOSENING');
    expect(ChangePolicy.classify(site, copyRule(site, { target: 'tiktok.com' }))).toBe('LOOSENING');
    const web = createRule(2, 'WEBSITE', 'reddit.com');
    expect(ChangePolicy.classify(web, copyRule(web, { target: 'https://www.reddit.com/' }))).toBe('NONE');
  });

  test('toggles and reset time', () => {
    expect(ChangePolicy.classifyToggle(false, true)).toBe('TIGHTENING');
    expect(ChangePolicy.classifyToggle(true, false)).toBe('LOOSENING');
    expect(ChangePolicy.classifyResetTime(0, minuteOfDay(4))).toBe('LOOSENING');
    expect(ChangePolicy.classifyResetTime(minuteOfDay(4), 0)).toBe('LOOSENING');
    expect(ChangePolicy.classifyResetTime(minuteOfDay(12), minuteOfDay(12))).toBe('NONE');
  });

  test('broadening a website rule is not loosening', () => {
    const shorts = createRule(1, 'WEBSITE', 'youtube.com/shorts');
    expect(ChangePolicy.classify(shorts, copyRule(shorts, { target: 'youtube.com' }))).toBe('NONE');
    expect(ChangePolicy.classify(copyRule(shorts, { target: 'youtube.com' }), shorts)).toBe('LOOSENING'); // narrowing
    expect(ChangePolicy.classify(shorts, copyRule(shorts, { target: 'reddit.com' }))).toBe('LOOSENING'); // other site
    // Broader target, but a higher limit: still loosening.
    const lim = copyRule(shorts, { limitMinutesPerDay: 10 });
    expect(ChangePolicy.classify(lim, copyRule(lim, { target: 'youtube.com', limitMinutesPerDay: 20 }))).toBe('LOOSENING');
  });

  test('change kind helpers', () => {
    expect(needsCode('LOOSENING')).toBe(true);
    expect(needsCode('TIGHTENING')).toBe(false);
    expect(combineChanges('TIGHTENING', 'LOOSENING')).toBe('LOOSENING');
    expect(combineChanges('TIGHTENING', 'NONE')).toBe('TIGHTENING');
  });
});
