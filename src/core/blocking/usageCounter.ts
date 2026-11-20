// SPDX-License-Identifier: GPL-3.0-or-later
import type { AllowDecision, MillisById } from '../policy/policyEngine';

/** Time used in one usage period (keyed by the period's start, see ResetSchedule). JSON-friendly. */
export interface UsageSnapshot {
  readonly periodStartMillis: number;
  readonly periodEndMillis: number;
  readonly ruleMillis: MillisById;
  readonly groupMillis: MillisById;
}

export function usageSnapshot(periodStartMillis: number, periodEndMillis: number, ruleMillis: MillisById = {}, groupMillis: MillisById = {}): UsageSnapshot {
  return { periodStartMillis, periodEndMillis, ruleMillis, groupMillis };
}

function plusEach(map: MillisById, ids: readonly number[], millis: number): MillisById {
  if (ids.length === 0) return map;
  const out: Record<number, number> = { ...map };
  for (const id of new Set(ids)) out[id] = (out[id] ?? 0) + millis;
  return out;
}

/**
 * Accumulates time for the rules / groups an allow decision counts. A group counts once per tick
 * even if several of its members match.
 */
export class UsageCounter {
  constructor(private current: UsageSnapshot) {}

  get snapshot(): UsageSnapshot {
    return this.current;
  }

  /** Adds [millis] to everything [decision] counts. @return true if anything changed. */
  add(decision: AllowDecision, millis: number): boolean {
    if (millis <= 0 || (decision.countedRuleIds.length === 0 && decision.countedGroupIds.length === 0)) return false;
    this.current = {
      ...this.current,
      ruleMillis: plusEach(this.current.ruleMillis, decision.countedRuleIds, millis),
      groupMillis: plusEach(this.current.groupMillis, decision.countedGroupIds, millis),
    };
    return true;
  }

  /**
   * A rule moves between counters (standalone ↔ group, group ↔ group): the destination never
   * has less time used than the source had, so moving can't start a fresh quota.
   * @return true if anything changed.
   */
  carryOver(ruleId: number, fromGroup: number | null, toGroup: number | null): boolean {
    const s = this.current;
    const used = (fromGroup === null ? s.ruleMillis[ruleId] : s.groupMillis[fromGroup]) ?? 0;
    if (used <= 0 || fromGroup === toGroup) return false;
    const target = (toGroup === null ? s.ruleMillis[ruleId] : s.groupMillis[toGroup]) ?? 0;
    if (target >= used) return false;
    this.current =
      toGroup === null ? { ...s, ruleMillis: { ...s.ruleMillis, [ruleId]: used } } : { ...s, groupMillis: { ...s.groupMillis, [toGroup]: used } };
    return true;
  }
}

export type WarningChange = { readonly kind: 'show'; readonly thresholdMillis: number } | { readonly kind: 'remove' };

const FIVE_MINUTES = 5 * 60_000;
const ONE_MINUTE = 60_000;

/**
 * Decides which optional "limit almost reached" warning each limit should show: the smallest
 * enabled threshold the remaining time is at or below. Only changes are reported, so the
 * notification follows the remaining time – also when it grows again (e.g. a higher limit):
 * back to the 5-minute warning, or gone above 5 minutes (and the warnings fire again later).
 */
export class LimitWarnings {
  static readonly FIVE_MINUTES = FIVE_MINUTES;
  static readonly ONE_MINUTE = ONE_MINUTE;
  /** The countdown is shown during the last 5 minutes. */
  static readonly TIMER_THRESHOLD = FIVE_MINUTES;

  private readonly shown = new Map<string, number>();

  /**
   * @param subject identifies what is counted (e.g. the counted rule / group ids).
   * @param thresholds enabled thresholds in millis (e.g. 5 min, 1 min); empty = warnings off.
   * @return what to do with the subject's notification, or null if nothing changed.
   */
  update(subject: string, remainingMillis: number, thresholds: Iterable<number>): WarningChange | null {
    let wanted: number | undefined;
    for (const t of thresholds) if (remainingMillis >= 1 && remainingMillis <= t && (wanted === undefined || t < wanted)) wanted = t;
    if (wanted === this.shown.get(subject)) return null;
    if (wanted === undefined) {
      this.shown.delete(subject);
      return { kind: 'remove' };
    }
    this.shown.set(subject, wanted);
    return { kind: 'show', thresholdMillis: wanted };
  }

  /** Subjects not in [current] lose their warning. @return those that had one (to remove it). */
  removeAllExcept(current: ReadonlySet<string>): Set<string> {
    const gone = new Set([...this.shown.keys()].filter((k) => !current.has(k)));
    for (const k of gone) this.shown.delete(k);
    return gone;
  }

  /** New period: forget everything. @return the subjects whose warning was shown (to remove it). */
  reset(): Set<string> {
    const all = new Set(this.shown.keys());
    this.shown.clear();
    return all;
  }

  static subjectOf(decision: AllowDecision): string {
    const sorted = (ids: readonly number[]) => [...ids].sort((a, b) => a - b).join(',');
    return 'r' + sorted(decision.countedRuleIds) + 'g' + sorted(decision.countedGroupIds);
  }
}
