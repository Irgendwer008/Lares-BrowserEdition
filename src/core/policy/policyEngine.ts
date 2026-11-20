// SPDX-License-Identifier: GPL-3.0-or-later
import { effectiveRule, isAlwaysOn, type Rule, type RuleGroup } from './rule';
import { UrlMatcher } from './urlMatcher';

/** Time used per rule / group id in the current usage period (JSON-friendly). */
export type MillisById = Readonly<Record<number, number>>;

/** Everything the engine needs to know about the current state. Built by the platform layer. */
export interface PolicySnapshot {
  readonly rules: readonly Rule[];
  /** Time already used in the current usage period, per standalone rule id. */
  readonly usedMillis?: MillisById;
  readonly groups?: ReadonlyMap<number, RuleGroup>;
  /** Summed time of all members in the current usage period, per group id. */
  readonly groupUsedMillis?: MillisById;
  readonly pauseActive?: boolean;
}

/**
 * Android also has UNSUPPORTED_BROWSER (browsers whose URL bar can't be read) and
 * PROTECTED_SETTINGS (settings guard); neither exists in the browser.
 */
export type BlockReason = 'ALWAYS_ON' | 'LIMIT_REACHED';

/**
 * `countedRuleIds`: standalone rules with a daily limit whose time is consumed while the page
 *   stays in the foreground (sorted ascending).
 * `remainingMillis`: smallest remaining time among everything counted, or null.
 * `countedGroupIds`: groups whose shared time is consumed (each group counts once, even if
 *   several members match), sorted ascending.
 */
export interface AllowDecision {
  readonly kind: 'allow';
  readonly countedRuleIds: readonly number[];
  readonly remainingMillis: number | null;
  readonly countedGroupIds: readonly number[];
}

export interface BlockDecision {
  readonly kind: 'block';
  readonly reason: BlockReason;
  readonly ruleId: number | null;
  readonly groupId: number | null;
}

export type Decision = AllowDecision | BlockDecision;

export function allow(countedRuleIds: number[] = [], remainingMillis: number | null = null, countedGroupIds: number[] = []): AllowDecision {
  return {
    kind: 'allow',
    countedRuleIds: [...new Set(countedRuleIds)].sort((a, b) => a - b),
    remainingMillis,
    countedGroupIds: [...new Set(countedGroupIds)].sort((a, b) => a - b),
  };
}

export function block(reason: BlockReason, ruleId: number | null = null, groupId: number | null = null): BlockDecision {
  return { kind: 'block', reason, ruleId, groupId };
}

const NO_GROUPS: ReadonlyMap<number, RuleGroup> = new Map();

/**
 * Pure decision logic: (URL, state) → allow / block.
 *
 * Browser port: on Android the input is the foreground app plus, for supported browsers, the URL.
 * Here there is no foreground app – only the URL – so app rules (kept for backup compatibility),
 * exempt apps and the "unsupported browser" step are gone. Website rules always apply (no
 * separate "website blocking" switch: in the extension that is the whole point).
 */
export const PolicyEngine = {
  /** @param url the page's URL, or null if there is none (then nothing is blocked). */
  evaluate(url: string | null, snapshot: PolicySnapshot): Decision {
    if (snapshot.pauseActive) return allow();
    if (url === null) return allow();
    const address = UrlMatcher.parse(url);
    if (address === null) return allow();

    const groups = snapshot.groups ?? NO_GROUPS;
    const matching: Rule[] = [];
    for (const rule of snapshot.rules) {
      const active = effectiveRule(rule, groups);
      if (active === null || active.type !== 'WEBSITE') continue;
      const target = UrlMatcher.normalizeRule(active.target);
      if (target !== null && UrlMatcher.matchesAddress(address, target)) matching.push(active);
    }

    const alwaysOn = matching.find(isAlwaysOn);
    if (alwaysOn) return block('ALWAYS_ON', alwaysOn.id, groupOf(alwaysOn, groups));

    let minRemaining: number | null = null;
    const countedRules: number[] = [];
    const countedGroups: number[] = [];
    for (const rule of matching) {
      const groupId = groupOf(rule, groups);
      const used = groupId !== null ? (snapshot.groupUsedMillis?.[groupId] ?? 0) : (snapshot.usedMillis?.[rule.id] ?? 0);
      const remaining = PolicyEngine.remainingMillis(rule, used);
      if (remaining <= 0) return block('LIMIT_REACHED', rule.id, groupId);
      minRemaining = Math.min(minRemaining ?? remaining, remaining);
      if (groupId !== null) countedGroups.push(groupId);
      else countedRules.push(rule.id);
    }
    return allow(countedRules, minRemaining, countedGroups);
  },

  remainingMillis(rule: Rule, usedMillis: number): number {
    if (rule.limitMinutesPerDay === null) return 0;
    return rule.limitMinutesPerDay * 60_000 - usedMillis;
  },
};

/** The group whose limit applies to [rule] (null for standalone rules or unknown groups). */
function groupOf(rule: Rule, groups: ReadonlyMap<number, RuleGroup>): number | null {
  return rule.groupId !== null && groups.has(rule.groupId) ? rule.groupId : null;
}
