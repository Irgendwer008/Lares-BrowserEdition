// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { allow, block, PolicyEngine, type PolicySnapshot } from '@/core/policy/policyEngine';
import { copyRule, createRule } from '@/core/policy/rule';

describe('PolicyEngine', () => {
  const instagram = createRule(1, 'WEBSITE', 'instagram.com');
  const youtubeLimited = createRule(2, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 30 });
  const reddit = createRule(3, 'WEBSITE', 'reddit.com');
  const shortsLimited = createRule(4, 'WEBSITE', 'youtube.com/shorts', { limitMinutesPerDay: 10 });
  const base: PolicySnapshot = { rules: [instagram, reddit, shortsLimited] };
  const eval_ = (url: string | null, s: PolicySnapshot = base) => PolicyEngine.evaluate(url, s);

  test('always-on website is blocked', () => {
    expect(eval_('https://www.instagram.com/p/1')).toEqual(block('ALWAYS_ON', 1));
    expect(eval_('https://old.reddit.com/r/all')).toEqual(block('ALWAYS_ON', 3));
  });

  test('unrelated site is allowed without counting', () => {
    expect(eval_('https://example.org/')).toEqual(allow());
    expect(eval_(null)).toEqual(allow());
    expect(eval_('chrome://extensions')).toEqual(allow());
  });

  test('limited site counts until the limit is reached', () => {
    const s = { rules: [youtubeLimited] };
    expect(eval_('youtube.com/watch?v=1', s)).toEqual(allow([2], 30 * 60_000));
    expect(eval_('youtube.com', { ...s, usedMillis: { 2: 29 * 60_000 } })).toEqual(allow([2], 60_000));
    expect(eval_('youtube.com', { ...s, usedMillis: { 2: 30 * 60_000 } })).toEqual(block('LIMIT_REACHED', 2));
  });

  test('pause allows everything', () => {
    expect(eval_('instagram.com', { ...base, pauseActive: true })).toEqual(allow());
  });

  test('disabled rules are ignored', () => {
    expect(eval_('instagram.com', { rules: [copyRule(instagram, { enabled: false })] })).toEqual(allow());
  });

  test('path rules', () => {
    expect(eval_('youtube.com/shorts/abc')).toEqual(allow([4], 10 * 60_000));
    expect(eval_('youtube.com/watch?v=1')).toEqual(allow());
  });

  test('app rules (imported from Android) are ignored', () => {
    const app = createRule(9, 'APP', 'com.instagram.android');
    expect(eval_('https://com.instagram.android/', { rules: [app] })).toEqual(allow());
  });

  test('always-on wins over limit', () => {
    const s = { rules: [youtubeLimited, copyRule(youtubeLimited, { id: 7, limitMinutesPerDay: null })] };
    expect(eval_('youtube.com', s)).toEqual(block('ALWAYS_ON', 7));
  });

  test('smallest remaining time is reported', () => {
    const s = { rules: [youtubeLimited, shortsLimited], usedMillis: { 4: 5 * 60_000 } };
    expect(eval_('youtube.com/shorts', s)).toEqual(allow([2, 4], 5 * 60_000));
  });
});
