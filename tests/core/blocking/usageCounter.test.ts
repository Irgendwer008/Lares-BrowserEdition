// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { LimitWarnings, UsageCounter, usageSnapshot } from '@/core/blocking/usageCounter';
import { allow } from '@/core/policy/policyEngine';

const { FIVE_MINUTES, ONE_MINUTE } = LimitWarnings;

describe('UsageCounter', () => {
  test('counts rules and groups once per tick', () => {
    const counter = new UsageCounter(usageSnapshot(0, 1000));
    expect(counter.add(allow([1], 60_000, [10]), 1_000)).toBe(true);
    counter.add(allow([1, 2], null, [10]), 500);
    expect(counter.snapshot.ruleMillis).toEqual({ 1: 1_500, 2: 500 });
    expect(counter.snapshot.groupMillis).toEqual({ 10: 1_500 });
    expect(counter.add(allow(), 1_000)).toBe(false); // nothing counted
  });

  test('moving a rule carries its used time', () => {
    // Rule 1 used 30 min alone; group 10 is fresh, group 11 used 40 min.
    const min = 60_000;
    const counter = new UsageCounter(usageSnapshot(0, 1000, { 1: 30 * min }, { 11: 40 * min }));
    expect(counter.carryOver(1, null, 10)).toBe(true); // into a fresh group: no new quota
    expect(counter.snapshot.groupMillis[10]).toBe(30 * min);
    expect(counter.carryOver(1, 10, 11)).toBe(false); // destination already has more
    expect(counter.carryOver(1, 11, null)).toBe(true); // out of the group: its time comes along
    expect(counter.snapshot.ruleMillis[1]).toBe(40 * min);
  });
});

describe('LimitWarnings', () => {
  const both = [FIVE_MINUTES, ONE_MINUTE];
  const show5 = { kind: 'show', thresholdMillis: FIVE_MINUTES };
  const show1 = { kind: 'show', thresholdMillis: ONE_MINUTE };
  const remove = { kind: 'remove' };

  test('warning follows the remaining time', () => {
    const w = new LimitWarnings();
    expect(w.update('a', 6 * 60_000, both)).toBeNull();
    expect(w.update('a', FIVE_MINUTES, both)).toEqual(show5);
    expect(w.update('a', 4 * 60_000, both)).toBeNull(); // already shown
    expect(w.update('a', 59_000, both)).toEqual(show1);
    // Limit raised: 30 s → 2 min left goes back to the 5-minute warning …
    expect(w.update('a', 2 * 60_000, both)).toEqual(show5);
    // … and above 5 minutes the warning disappears; it fires again when time runs low.
    expect(w.update('a', 10 * 60_000, both)).toEqual(remove);
    expect(w.update('a', 4 * 60_000, both)).toEqual(show5);
    expect(w.update('b', 30_000, both)).toEqual(show1); // other subject: straight to 1 min
    expect(w.update('c', 0, both)).toBeNull(); // already used up: nothing to show
    // Warnings switched off: a shown one is removed.
    expect(w.update('b', 30_000, [])).toEqual(remove);
    expect(w.reset()).toEqual(new Set(['a']));
    expect(w.update('a', FIVE_MINUTES, [FIVE_MINUTES])).toEqual(show5);
  });

  test('warnings of limits no longer evaluated are removed', () => {
    const w = new LimitWarnings();
    w.update('a', 30_000, both);
    w.update('b', 4 * 60_000, both);
    expect(w.removeAllExcept(new Set(['a']))).toEqual(new Set(['b']));
    expect(w.removeAllExcept(new Set(['a']))).toEqual(new Set());
    expect(w.update('b', 4 * 60_000, both)).toEqual(show5); // fires again
  });

  test('subject of a decision', () => {
    expect(LimitWarnings.subjectOf(allow([3, 1], null, [7]))).toBe('r1,3g7');
    expect(LimitWarnings.TIMER_THRESHOLD).toBe(FIVE_MINUTES);
  });
});
