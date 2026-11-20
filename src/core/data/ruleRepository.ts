// SPDX-License-Identifier: GPL-3.0-or-later
import { ChangePolicy } from '../policy/changePolicy';
import { copyGroup, copyRule, createGroup, createRule, ruleKey, type Rule, type RuleGroup, type RuleType } from '../policy/rule';
import { UrlMatcher, webAddressToString } from '../policy/urlMatcher';
import type { Unsubscribe } from './appState';
import { backupFile, type BackupFile, type ImportResult } from './backup';
import type { UnlockGate } from './unlockGate';

/** Persistence for rules (platform storage in production, in-memory in tests). */
export interface RuleStore {
  all(): Promise<Rule[]>;
  get(id: number): Promise<Rule | null>;
  /** Assigns a new id (the given one is ignored). @return the new id. */
  insert(rule: Rule): Promise<number>;
  update(rule: Rule): Promise<void>;
  delete(id: number): Promise<void>;
  subscribe(listener: (rules: readonly Rule[]) => void): Unsubscribe;
}

/** Persistence for rule groups. */
export interface GroupStore {
  all(): Promise<RuleGroup[]>;
  get(id: number): Promise<RuleGroup | null>;
  /** Assigns a new id. @return the new id. */
  insert(group: RuleGroup): Promise<number>;
  update(group: RuleGroup): Promise<void>;
  /** Deletes the group together with all its member rules. */
  deleteWithMembers(id: number): Promise<void>;
  subscribe(listener: (groups: readonly RuleGroup[]) => void): Unsubscribe;
}

export type AddRuleResult =
  | { readonly kind: 'added'; readonly id: number }
  /** The same target is already a rule here (among single rules, or in the same group). */
  | { readonly kind: 'duplicate'; readonly existing: Rule }
  | { readonly kind: 'invalidTarget' };

/**
 * Moves the time already used along with a rule that changes group (see UsageCounter.carryOver)
 * – otherwise moving it into a fresh group with a lower limit would be "tightening" and still
 * start a new quota.
 */
export type UsageTransfer = (ruleId: number, fromGroup: number | null, toGroup: number | null) => Promise<void>;

const NO_USAGE_TRANSFER: UsageTransfer = async () => {};

const PACKAGE_NAME = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/**
 * All rule and group changes go through here. Tightening is always allowed; loosening throws
 * CodeRequiredError unless the app is unlocked.
 */
export class RuleRepository {
  constructor(
    private readonly store: RuleStore,
    private readonly groupStore: GroupStore,
    private readonly gate: UnlockGate,
    private readonly usage: UsageTransfer = NO_USAGE_TRANSFER,
  ) {}

  static normalizeTarget(type: RuleType, target: string): string | null {
    if (type === 'APP') {
      const t = target.trim();
      return PACKAGE_NAME.test(t) ? t : null;
    }
    const a = UrlMatcher.normalizeRule(target);
    return a ? webAddressToString(a) : null;
  }

  rules(): Promise<Rule[]> {
    return this.store.all();
  }

  groups(): Promise<RuleGroup[]> {
    return this.groupStore.all();
  }

  // ---- Rules ---------------------------------------------------------------------------------

  /** @param groupId add the rule as a member of this group (its limit then applies). */
  async add(type: RuleType, target: string, limitMinutesPerDay: number | null = null, groupId: number | null = null): Promise<AddRuleResult> {
    if (limitMinutesPerDay !== null && limitMinutesPerDay < 0) return { kind: 'invalidTarget' };
    const normalized = RuleRepository.normalizeTarget(type, target);
    if (normalized === null) return { kind: 'invalidTarget' };
    let group: RuleGroup | null = null;
    if (groupId !== null) {
      group = await this.groupStore.get(groupId);
      if (group === null) return { kind: 'invalidTarget' };
    }
    const rule = createRule(0, type, normalized, {
      // Keep the group's limit as the rule's own limit, in case it's taken out of the group later.
      limitMinutesPerDay: group?.limitMinutesPerDay ?? limitMinutesPerDay,
      groupId,
    });
    // Duplicates only count within the same scope: a target may be a single rule *and* a group
    // member at the same time – then both limits apply (whichever is reached first blocks).
    const key = ruleKey(rule);
    const existing = (await this.store.all()).find((r) => ruleKey(r) === key && r.groupId === groupId);
    if (existing) return { kind: 'duplicate', existing };
    return { kind: 'added', id: await this.store.insert(rule) };
  }

  /**
   * Adds several rules at once (templates). Targets that already exist in the same scope
   * (single rules, or the same group) are skipped.
   * @return how many rules were added.
   */
  async addAll(targets: readonly (readonly [RuleType, string])[], limitMinutesPerDay: number | null, groupId: number | null = null): Promise<number> {
    let count = 0;
    for (const [type, target] of targets) {
      if ((await this.add(type, target, limitMinutesPerDay, groupId)).kind === 'added') count++;
    }
    return count;
  }

  /** Changes limit / enabled state / target / group of an existing rule. */
  async update(rule: Rule): Promise<void> {
    const old = await this.store.get(rule.id);
    if (old === null) throw new Error(`unknown rule ${rule.id}`);
    const normalized = RuleRepository.normalizeTarget(rule.type, rule.target);
    if (normalized === null) throw new Error('invalid target');
    const next = copyRule(rule, { target: normalized });
    if (next.groupId !== null && (await this.groupStore.get(next.groupId)) === null) throw new Error(`unknown group ${next.groupId}`);
    await this.gate.check(ChangePolicy.classifyInGroups(old, next, await this.groupMap()));
    await this.store.update(next);
    if (old.groupId !== next.groupId) await this.usage(next.id, old.groupId, next.groupId);
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    const old = await this.store.get(id);
    if (old !== null) await this.update({ ...old, enabled });
  }

  /** Limit and on/off in one atomic change (one policy check for both). */
  async updateRule(id: number, limitMinutesPerDay: number | null, enabled: boolean): Promise<void> {
    const old = await this.store.get(id);
    if (old !== null) await this.update(copyRule(old, { limitMinutesPerDay, enabled }));
  }

  /**
   * Moves a rule into a group, or out of it ([groupId] = null). If the destination already has a
   * rule for the same target, nothing happens (no duplicates, and removing this one could loosen).
   */
  async setGroup(id: number, groupId: number | null): Promise<void> {
    const old = await this.store.get(id);
    if (old === null) return;
    const key = ruleKey(old);
    if ((await this.store.all()).some((r) => r.id !== id && r.groupId === groupId && ruleKey(r) === key)) return;
    await this.update({ ...old, groupId });
  }

  async remove(id: number): Promise<void> {
    const old = await this.store.get(id);
    if (old === null) return;
    await this.gate.check(ChangePolicy.classifyInGroups(old, null, await this.groupMap()));
    await this.store.delete(id);
  }

  // ---- Groups --------------------------------------------------------------------------------

  /** Creating a group is free (it restricts nothing until members are added). */
  async createGroup(name: string, limitMinutesPerDay: number | null): Promise<number> {
    if (name.trim().length === 0) throw new Error('name must not be blank');
    return this.groupStore.insert(createGroup(0, name.trim(), { limitMinutesPerDay }));
  }

  /** Creates a group and adds [targets] as members. @return the group id. */
  async createGroupWith(name: string, limitMinutesPerDay: number | null, targets: readonly (readonly [RuleType, string])[]): Promise<number> {
    const id = await this.createGroup(name, limitMinutesPerDay);
    await this.addAll(targets, limitMinutesPerDay, id);
    return id;
  }

  async updateGroup(group: RuleGroup): Promise<void> {
    if (group.name.trim().length === 0) throw new Error('name must not be blank');
    const old = await this.groupStore.get(group.id);
    if (old === null) throw new Error(`unknown group ${group.id}`);
    await this.gate.check(ChangePolicy.classifyGroup(old, group, await this.hasActiveMembers(group.id)));
    await this.groupStore.update(copyGroup(group, { name: group.name.trim() }));
  }

  async setGroupEnabled(id: number, enabled: boolean): Promise<void> {
    const old = await this.groupStore.get(id);
    if (old !== null) await this.updateGroup({ ...old, enabled });
  }

  /** Deletes the group and its members (loosening if the group restricts anything). */
  async deleteGroup(id: number): Promise<void> {
    const old = await this.groupStore.get(id);
    if (old === null) return;
    await this.gate.check(ChangePolicy.classifyGroup(old, null, await this.hasActiveMembers(id)));
    await this.groupStore.deleteWithMembers(id);
  }

  // ---- Backup --------------------------------------------------------------------------------

  /** Rules and groups (incl. imported APP rules); the caller adds `guardianTotp` if wanted. */
  async exportBackup(): Promise<BackupFile> {
    const groups = await this.groupStore.all();
    const names = new Map(groups.map((g) => [g.id, g.name]));
    return backupFile({
      groups: groups.map((g) => ({ name: g.name, limitMinutesPerDay: g.limitMinutesPerDay, enabled: g.enabled })),
      rules: (await this.store.all()).map((r) => ({
        type: r.type,
        target: r.target,
        limitMinutesPerDay: r.limitMinutesPerDay,
        enabled: r.enabled,
        group: r.groupId !== null ? (names.get(r.groupId) ?? null) : null,
      })),
    });
  }

  /**
   * Imports by **adding only**: groups that don't exist yet (matched by name) are created, rules
   * that don't exist yet in their scope are added. Nothing existing is removed or loosened, so no
   * guardian code is needed. Existing groups keep their own limit.
   */
  async importBackup(backup: BackupFile): Promise<ImportResult> {
    const existing = new Map((await this.groupStore.all()).map((g) => [g.name.trim(), g.id]));
    let groupsAdded = 0;
    for (const g of backup.groups) {
      const name = g.name.trim();
      if (name.length === 0 || existing.has(name)) continue;
      const limit = g.limitMinutesPerDay === null ? null : Math.max(g.limitMinutesPerDay, 0);
      existing.set(name, await this.groupStore.insert(createGroup(0, name, { limitMinutesPerDay: limit, enabled: g.enabled })));
      groupsAdded++;
    }
    let added = 0;
    let skipped = 0;
    for (const r of backup.rules) {
      const groupId = r.group !== null ? (existing.get(r.group.trim()) ?? null) : null;
      const target = RuleRepository.normalizeTarget(r.type, r.target);
      const key = target !== null ? ruleKey({ type: r.type, target }) : null;
      const duplicate = key !== null && (await this.store.all()).some((x) => x.groupId === groupId && ruleKey(x) === key);
      if (target === null || duplicate || (r.limitMinutesPerDay ?? 0) < 0) {
        skipped++;
        continue;
      }
      // Inserting directly keeps a disabled rule disabled (adding a disabled rule restricts nothing).
      await this.store.insert(createRule(0, r.type, target, { limitMinutesPerDay: r.limitMinutesPerDay, enabled: r.enabled, groupId }));
      added++;
    }
    return { groupsAdded, rulesAdded: added, skipped };
  }

  private async groupMap(): Promise<Map<number, RuleGroup>> {
    return new Map((await this.groupStore.all()).map((g) => [g.id, g]));
  }

  private async hasActiveMembers(groupId: number): Promise<boolean> {
    return (await this.store.all()).some((r) => r.groupId === groupId && r.enabled);
  }
}
