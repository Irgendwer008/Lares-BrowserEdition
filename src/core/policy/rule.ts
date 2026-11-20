// SPDX-License-Identifier: GPL-3.0-or-later
import { UrlMatcher, webAddressToString } from './urlMatcher';

/**
 * `APP` rules only exist so backups from the Android app import (and export) cleanly; the
 * extension neither shows nor enforces them (see CLAUDE.md, "Browser-specific decisions").
 */
export type RuleType = 'APP' | 'WEBSITE';
export const RULE_TYPES: readonly RuleType[] = ['APP', 'WEBSITE'];

/**
 * A blocked website (target = domain, optionally with a path prefix, e.g. `youtube.com/shorts`)
 * or – imported from Android, ignored here – app (target = package name).
 *
 * `limitMinutesPerDay`: `null` = always blocked, otherwise allowed minutes per usage day.
 *   Ignored while the rule belongs to a group (the group's limit applies).
 * `groupId`: group this rule belongs to, or null for a standalone rule.
 */
export interface Rule {
  readonly id: number;
  readonly type: RuleType;
  readonly target: string;
  readonly limitMinutesPerDay: number | null;
  readonly enabled: boolean;
  readonly groupId: number | null;
}

function checkLimit(limit: number | null): void {
  if (limit !== null && !(limit >= 0)) throw new RangeError('limit must be >= 0');
}

/** Creates a rule with the Kotlin defaults (always on, enabled, standalone). */
export function createRule(
  id: number,
  type: RuleType,
  target: string,
  opts: { limitMinutesPerDay?: number | null; enabled?: boolean; groupId?: number | null } = {},
): Rule {
  const rule: Rule = {
    id,
    type,
    target,
    limitMinutesPerDay: opts.limitMinutesPerDay ?? null,
    enabled: opts.enabled ?? true,
    groupId: opts.groupId ?? null,
  };
  checkLimit(rule.limitMinutesPerDay);
  return rule;
}

/** Copy with changes (validated like the Kotlin `copy`). */
export function copyRule(rule: Rule, changes: Partial<Rule>): Rule {
  const r = { ...rule, ...changes };
  checkLimit(r.limitMinutesPerDay);
  return r;
}

export function isAlwaysOn(rule: Rule): boolean {
  return rule.limitMinutesPerDay === null;
}

/** Identity of the blocked target independent of the database id (duplicate detection, import). */
export function ruleKey(rule: Pick<Rule, 'type' | 'target'>): string {
  const normalized =
    rule.type === 'APP'
      ? rule.target.trim()
      : (() => {
          const a = UrlMatcher.normalizeRule(rule.target);
          return a ? webAddressToString(a) : rule.target.trim().toLowerCase();
        })();
  return `${rule.type}:${normalized}`;
}

/**
 * Several websites sharing one limit: their time is summed up, and the group switch turns all
 * members on or off at once.
 *
 * `limitMinutesPerDay`: `null` = always blocked, otherwise combined minutes per usage day.
 */
export interface RuleGroup {
  readonly id: number;
  readonly name: string;
  readonly limitMinutesPerDay: number | null;
  readonly enabled: boolean;
}

export function createGroup(
  id: number,
  name: string,
  opts: { limitMinutesPerDay?: number | null; enabled?: boolean } = {},
): RuleGroup {
  const group: RuleGroup = { id, name, limitMinutesPerDay: opts.limitMinutesPerDay ?? null, enabled: opts.enabled ?? true };
  checkLimit(group.limitMinutesPerDay);
  return group;
}

export function copyGroup(group: RuleGroup, changes: Partial<RuleGroup>): RuleGroup {
  const g = { ...group, ...changes };
  checkLimit(g.limitMinutesPerDay);
  return g;
}

/**
 * The rule as it is actually enforced: inside a group, the group's switch and limit apply.
 * Returns null if the rule is not active at all.
 */
export function effectiveRule(rule: Rule, groups: ReadonlyMap<number, RuleGroup>): Rule | null {
  if (!rule.enabled) return null;
  const group = rule.groupId !== null ? groups.get(rule.groupId) : undefined;
  if (group === undefined) return rule;
  if (!group.enabled) return null;
  return { ...rule, limitMinutesPerDay: group.limitMinutesPerDay };
}
