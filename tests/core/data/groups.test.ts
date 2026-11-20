// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { CodeRequiredError, defaultAppState } from '@/core/data/appState';
import { RuleRepository } from '@/core/data/ruleRepository';
import { UnlockGate } from '@/core/data/unlockGate';
import { ChangePolicy } from '@/core/policy/changePolicy';
import { allow, block, PolicyEngine, type PolicySnapshot } from '@/core/policy/policyEngine';
import { copyGroup, copyRule, createGroup, createRule } from '@/core/policy/rule';
import { RuleTemplates, templateTargets } from '@/core/policy/ruleTemplates';
import { TimedSession } from '@/core/policy/timedSession';
import { expectThrows, FakeClock, FakeGroupStore, FakeRuleStore, FakeStateStore } from '../../testing/fakes';

describe('Groups: engine', () => {
  const social = createGroup(10, 'Social', { limitMinutesPerDay: 30 });
  const yt = createRule(1, 'WEBSITE', 'youtube.com', { groupId: 10 });
  const ytShort = createRule(2, 'WEBSITE', 'youtu.be', { groupId: 10 });
  const snapshot: PolicySnapshot = { rules: [yt, ytShort], groups: new Map([[10, social]]) };

  test('members share the group limit', () => {
    expect(PolicyEngine.evaluate('https://youtube.com/', snapshot)).toEqual(allow([], 30 * 60_000, [10]));
    const used = { ...snapshot, groupUsedMillis: { 10: 30 * 60_000 } };
    expect(PolicyEngine.evaluate('https://youtube.com/', used)).toEqual(block('LIMIT_REACHED', 1, 10));
    // Time used on one member also blocks the other.
    expect(PolicyEngine.evaluate('https://youtu.be/abc', used)).toEqual(block('LIMIT_REACHED', 2, 10));
  });

  test('group limit overrides member limit', () => {
    const s = { rules: [copyRule(yt, { limitMinutesPerDay: 999 })], groups: new Map([[10, copyGroup(social, { limitMinutesPerDay: null })]]) };
    expect(PolicyEngine.evaluate('youtube.com', s)).toEqual(block('ALWAYS_ON', 1, 10));
  });

  test('group switch turns all members off', () => {
    const off = { ...snapshot, groups: new Map([[10, copyGroup(social, { enabled: false })]]), groupUsedMillis: { 10: 999 * 60_000 } };
    expect(PolicyEngine.evaluate('youtube.com', off)).toEqual(allow());
    expect(PolicyEngine.evaluate('youtu.be', off)).toEqual(allow());
  });
});

describe('Groups: policy', () => {
  const social = createGroup(10, 'Social', { limitMinutesPerDay: 30 });
  const yt = createRule(1, 'WEBSITE', 'youtube.com', { groupId: 10 });
  const groups = new Map([[10, social]]);

  test('membership changes', () => {
    const standalone = copyRule(yt, { groupId: null, limitMinutesPerDay: 60 });
    expect(ChangePolicy.classifyInGroups(standalone, copyRule(standalone, { groupId: 10 }), groups)).toBe('TIGHTENING'); // 60 → 30
    const always = copyRule(standalone, { limitMinutesPerDay: null });
    expect(ChangePolicy.classifyInGroups(always, copyRule(always, { groupId: 10 }), groups)).toBe('LOOSENING');
    // Taking a member out ends the time sharing → loosening even with the same limit …
    expect(ChangePolicy.classifyInGroups(yt, copyRule(yt, { groupId: null, limitMinutesPerDay: 30 }), groups)).toBe('LOOSENING');
    // … unless the new own limit is stricter.
    expect(ChangePolicy.classifyInGroups(yt, copyRule(yt, { groupId: null, limitMinutesPerDay: 10 }), groups)).toBe('TIGHTENING');
    // Members of a disabled group restrict nothing.
    expect(ChangePolicy.classifyInGroups(yt, null, new Map([[10, copyGroup(social, { enabled: false })]]))).toBe('NONE');
  });

  test('group changes', () => {
    expect(ChangePolicy.classifyGroup(social, copyGroup(social, { enabled: false }), true)).toBe('LOOSENING');
    expect(ChangePolicy.classifyGroup(copyGroup(social, { enabled: false }), social, true)).toBe('TIGHTENING');
    expect(ChangePolicy.classifyGroup(social, copyGroup(social, { limitMinutesPerDay: 60 }), true)).toBe('LOOSENING');
    expect(ChangePolicy.classifyGroup(social, copyGroup(social, { limitMinutesPerDay: null }), true)).toBe('TIGHTENING');
    expect(ChangePolicy.classifyGroup(social, null, true)).toBe('LOOSENING');
    expect(ChangePolicy.classifyGroup(social, null, false)).toBe('NONE');
  });
});

describe('Groups: repository', () => {
  function setup() {
    const clock = new FakeClock();
    const state = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x' }, settings: { setupComplete: true } }));
    const ruleStore = new FakeRuleStore();
    const groupStore = new FakeGroupStore(ruleStore);
    const moves: unknown[] = [];
    const repo = new RuleRepository(ruleStore, groupStore, new UnlockGate(state, clock), async (...args) => {
      moves.push(args);
    });
    return { clock, state, ruleStore, groupStore, repo, moves };
  }

  test('group lifecycle follows the policy', async () => {
    const { clock, state, ruleStore, groupStore, repo, moves } = setup();
    const id = await repo.createGroup('Social', 30); // free
    await repo.add('WEBSITE', 'instagram.com', null, id); // free
    const [member] = await ruleStore.all();
    expect(member!.groupId).toBe(id);
    expect(member!.limitMinutesPerDay).toBe(30); // remembers the group limit

    await repo.updateGroup({ ...(await groupStore.get(id))!, name: 'Social media', limitMinutesPerDay: 15 }); // rename + tighter: free
    await expectThrows(async () => repo.updateGroup({ ...(await groupStore.get(id))!, limitMinutesPerDay: 60 }), CodeRequiredError);
    await expectThrows(() => repo.setGroupEnabled(id, false), CodeRequiredError);
    await expectThrows(() => repo.setGroup(member!.id, null), CodeRequiredError);
    await expectThrows(() => repo.remove(member!.id), CodeRequiredError);
    await expectThrows(() => repo.deleteGroup(id), CodeRequiredError);

    await state.update((s) => ({ ...s, unlock: { ...s.unlock, unlockedSession: TimedSession.start(60_000, clock) } }));
    await repo.setGroup(member!.id, null);
    expect(moves).toEqual([[member!.id, id, null]]); // used time travels along
    await repo.setGroup(member!.id, id);
    await repo.setGroupEnabled(id, false);
    await repo.deleteGroup(id);
    expect(await ruleStore.all()).toEqual([]);
    expect(await groupStore.all()).toEqual([]);
  });

  test('single rule and group member coexist and both limits apply', async () => {
    const { ruleStore, groupStore, repo } = setup();
    await repo.add('WEBSITE', 'youtube.com', 60);
    const youtube = RuleTemplates.all.find((t) => t.id === 'youtube')!;
    const id = await repo.createGroupWith(youtube.name, 30, templateTargets(youtube));
    // The single rule stays, and the group gets its own member for the same site.
    expect((await ruleStore.all()).filter((r) => r.groupId === id).length).toBe(youtube.websites.length);
    expect((await ruleStore.all()).filter((r) => r.groupId === null).length).toBe(1);
    // Within the same scope it's still a duplicate.
    expect((await repo.add('WEBSITE', 'youtube.com', null, id)).kind).toBe('duplicate');
    expect((await repo.add('WEBSITE', 'https://www.youtube.com/', 10)).kind).toBe('duplicate');

    const rules = await ruleStore.all();
    const snapshot: PolicySnapshot = { rules, groups: new Map((await groupStore.all()).map((g) => [g.id, g])) };
    const single = rules.find((r) => r.groupId === null)!;
    // Both are counted …
    expect(PolicyEngine.evaluate('youtube.com', snapshot)).toEqual(allow([single.id], 30 * 60_000, [id]));
    // … and the group's 30 shared minutes block even though the single rule allows 60.
    const used = { ...snapshot, groupUsedMillis: { [id]: 30 * 60_000 }, usedMillis: { [single.id]: 30 * 60_000 } };
    const decision = PolicyEngine.evaluate('youtube.com', used);
    expect(decision.kind === 'block' && decision.reason).toBe('LIMIT_REACHED');
  });

  test('template as group', async () => {
    const { ruleStore, groupStore, repo } = setup();
    const tiktok = RuleTemplates.all.find((t) => t.id === 'tiktok')!;
    const id = await repo.createGroupWith(tiktok.name, 20, templateTargets(tiktok));
    expect((await groupStore.get(id))!.name).toBe('TikTok');
    expect((await ruleStore.all()).filter((r) => r.groupId === id).length).toBe(tiktok.websites.length);
  });
});
