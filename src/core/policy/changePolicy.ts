// SPDX-License-Identifier: GPL-3.0-or-later
import type { MinuteOfDay } from '../time/zonedTime';
import { effectiveRule, ruleKey, type Rule, type RuleGroup } from './rule';
import { UrlMatcher } from './urlMatcher';

/** Ordered by strictness of the requirement: NONE < TIGHTENING < LOOSENING. */
export type ChangeKind = 'NONE' | 'TIGHTENING' | 'LOOSENING';

const ORDER: Record<ChangeKind, number> = { NONE: 0, TIGHTENING: 1, LOOSENING: 2 };

export function needsCode(kind: ChangeKind): boolean {
  return kind === 'LOOSENING';
}

export function combineChanges(a: ChangeKind, b: ChangeKind): ChangeKind {
  return ORDER[b] > ORDER[a] ? b : a;
}

/** Strictness of an enabled rule: always-on is as strict as a 0 minute limit. */
function allowedMinutes(limit: number | null): number {
  return limit ?? 0;
}

/** [broader] blocks at least everything [narrower] blocks (website rules only). */
function covers(broader: Rule, narrower: Rule): boolean {
  if (broader.type !== 'WEBSITE' || narrower.type !== 'WEBSITE') return false;
  const b = UrlMatcher.normalizeRule(broader.target);
  const n = UrlMatcher.normalizeRule(narrower.target);
  if (b === null || n === null) return false;
  return UrlMatcher.matchesAddress(n, b);
}

function compareLimits(before: number | null, after: number | null): ChangeKind {
  const b = allowedMinutes(before);
  const a = allowedMinutes(after);
  return a < b ? 'TIGHTENING' : a > b ? 'LOOSENING' : 'NONE';
}

/**
 * Classifies changes as tightening (free) or loosening (needs the guardian code).
 * See docs/unlock-and-security.md, "Tighten vs. loosen policy".
 */
export const ChangePolicy = {
  /** @param old null = rule is being added. @param next null = rule is being removed. */
  classify(old: Rule | null, next: Rule | null): ChangeKind {
    const oldActive = old?.enabled ? old : null;
    const newActive = next?.enabled ? next : null;
    if (oldActive === null && newActive === null) return 'NONE';
    if (oldActive === null) return 'TIGHTENING';
    if (newActive === null) return 'LOOSENING';
    // Retargeting removes the old restriction – unless the new website rule still covers
    // everything the old one blocked (e.g. youtube.com/shorts → youtube.com).
    if (ruleKey(oldActive) !== ruleKey(newActive) && !covers(newActive, oldActive)) return 'LOOSENING';
    return compareLimits(oldActive.limitMinutesPerDay, newActive.limitMinutesPerDay);
  },

  /**
   * Like [classify], but compares the rules as enforced inside their groups (see effectiveRule).
   * Leaving an active group ends the time sharing, so it counts as loosening unless the
   * rule's new limit is strictly lower.
   */
  classifyInGroups(old: Rule | null, next: Rule | null, groups: ReadonlyMap<number, RuleGroup>): ChangeKind {
    const oldEffective = old ? effectiveRule(old, groups) : null;
    const base = ChangePolicy.classify(oldEffective, next ? effectiveRule(next, groups) : null);
    const leftActiveGroup =
      oldEffective !== null && old !== null && old.groupId !== null && groups.has(old.groupId) && old.groupId !== (next?.groupId ?? null);
    return leftActiveGroup && base !== 'TIGHTENING' ? 'LOOSENING' : base;
  },

  /**
   * Group switch / limit changes. Only matters if the group has active members.
   * @param old null = group is being created. @param next null = group is being deleted.
   */
  classifyGroup(old: RuleGroup | null, next: RuleGroup | null, hasActiveMembers: boolean): ChangeKind {
    if (!hasActiveMembers) return 'NONE';
    const before = old?.enabled ? old : null;
    const after = next?.enabled ? next : null;
    if (before === null && after === null) return 'NONE';
    if (before === null) return 'TIGHTENING';
    if (after === null) return 'LOOSENING';
    return compareLimits(before.limitMinutesPerDay, after.limitMinutesPerDay);
  },

  /** For protections: turning on is tightening, off is loosening. */
  classifyToggle(old: boolean, next: boolean): ChangeKind {
    if (old === next) return 'NONE';
    return next ? 'TIGHTENING' : 'LOOSENING';
  },

  /** Moving the daily reset in either direction can grant a fresh quota → always loosening. */
  classifyResetTime(old: MinuteOfDay, next: MinuteOfDay): ChangeKind {
    return old === next ? 'NONE' : 'LOOSENING';
  },
};
