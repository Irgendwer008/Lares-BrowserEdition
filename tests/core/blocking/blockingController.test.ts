// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, test } from 'vitest';
import {
  BlockingController,
  type BlockInfo,
  type BlockingHost,
  type CountingSegment,
  type Page,
  type SegmentStore,
  type UsageStore,
} from '@/core/blocking/blockingController';
import type { UsageSnapshot } from '@/core/blocking/usageCounter';
import { defaultAppState } from '@/core/data/appState';
import { createGroup, createRule } from '@/core/policy/rule';
import { TimedSession } from '@/core/policy/timedSession';
import { FakeClock, FakeGroupStore, FakeRuleStore, FakeStateStore } from '../../testing/fakes';

class FakeHost implements BlockingHost {
  fg: Page[] = [];
  others: Page[] = [];
  blocked: { tabId: number; info: BlockInfo }[] = [];
  countdowns = new Map<number, number | null>();
  warnings = new Map<string, number | null>();

  async foreground(): Promise<Page[]> {
    return [...this.fg];
  }
  async openPages(): Promise<Page[]> {
    return [...this.fg, ...this.others];
  }
  async block(tabId: number, info: BlockInfo): Promise<void> {
    this.blocked.push({ tabId, info });
  }
  async countdown(tabId: number, remainingMillis: number | null): Promise<void> {
    this.countdowns.set(tabId, remainingMillis);
  }
  async warning(subject: string, remainingMillis: number | null): Promise<void> {
    this.warnings.set(subject, remainingMillis);
  }
}

class MemoryUsage implements UsageStore {
  value: UsageSnapshot | null = null;
  async load() {
    return this.value;
  }
  async save(s: UsageSnapshot) {
    this.value = s;
  }
}

class MemorySegments implements SegmentStore {
  value: CountingSegment | null = null;
  async get() {
    return this.value;
  }
  async set(s: CountingSegment | null) {
    this.value = s;
  }
}

const MIN = 60_000;
// 2027-01-15 12:00 UTC – far from midnight, so periods don't end during the tests.
const NOON = Date.UTC(2027, 0, 15, 12, 0);

let clock: FakeClock;
let state: FakeStateStore;
let rules: FakeRuleStore;
let groups: FakeGroupStore;
let usage: MemoryUsage;
let segments: MemorySegments;
let host: FakeHost;
let controller: BlockingController;

beforeEach(() => {
  clock = new FakeClock(NOON);
  state = new FakeStateStore(defaultAppState({ settings: { setupComplete: true } }));
  rules = new FakeRuleStore();
  groups = new FakeGroupStore(rules);
  usage = new MemoryUsage();
  segments = new MemorySegments();
  host = new FakeHost();
  controller = new BlockingController(clock, state, rules, groups, usage, segments, host, () => 'UTC');
});

const page = (tabId: number, url: string): Page => ({ tabId, url });

describe('blocking', () => {
  test('always-blocked site in the foreground is blocked', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    host.fg = [page(1, 'https://www.reddit.com/r/all')];
    await controller.sync();
    expect(host.blocked).toEqual([{ tabId: 1, info: { url: 'https://www.reddit.com/r/all', reason: 'ALWAYS_ON', subject: 'reddit.com', resetAtMillis: null } }]);
    expect(segments.value).toBeNull();
  });

  test('blocked background tabs are blocked too, each once', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    host.fg = [page(1, 'https://reddit.com/')];
    host.others = [page(2, 'https://example.org/'), page(3, 'https://old.reddit.com/')];
    await controller.sync();
    expect(host.blocked.map((b) => b.tabId)).toEqual([1, 3]);
  });

  test('nothing is blocked before setup is complete', async () => {
    await state.update((s) => ({ ...s, settings: { ...s.settings, setupComplete: false } }));
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    host.fg = [page(1, 'https://reddit.com/')];
    await controller.sync();
    expect(host.blocked).toEqual([]);
  });

  test('a pause suspends blocking', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    await state.update((s) => ({ ...s, unlock: { ...s.unlock, pause: TimedSession.start(15 * MIN, clock) } }));
    host.fg = [page(1, 'https://reddit.com/')];
    await controller.sync();
    expect(host.blocked).toEqual([]);
  });

  test('disabled rules and other sites are allowed', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com', { enabled: false }));
    host.fg = [page(1, 'https://reddit.com/')];
    host.others = [page(2, 'https://example.org/')];
    await controller.sync();
    expect(host.blocked).toEqual([]);
  });
});

describe('daily limits', () => {
  test('time in the foreground counts until the limit, then the page is blocked', async () => {
    const id = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 2 }));
    host.fg = [page(1, 'https://www.youtube.com/watch?v=x')];
    expect((await controller.sync()).nextCheckInMillis).toBe(2 * MIN);

    clock.advance(MIN);
    expect((await controller.sync()).nextCheckInMillis).toBe(MIN);
    expect(usage.value!.ruleMillis[id]).toBe(MIN);

    clock.advance(MIN);
    await controller.sync();
    expect(host.blocked).toHaveLength(1);
    expect(host.blocked[0]!.info.reason).toBe('LIMIT_REACHED');
    expect(host.blocked[0]!.info.resetAtMillis).toBe(Date.UTC(2027, 0, 16));
  });

  test('time only counts while the page is in the foreground', async () => {
    const id = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 10 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(MIN);
    host.fg = [page(2, 'https://example.org/')];
    await controller.sync();
    clock.advance(5 * MIN);
    host.fg = []; // e.g. browser lost focus
    await controller.sync();
    expect(usage.value!.ruleMillis[id]).toBe(MIN);
  });

  test('long gaps (sleep, suspended worker) are capped', async () => {
    const id = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 60 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(30 * MIN);
    await controller.sync();
    expect(usage.value!.ruleMillis[id]).toBe(BlockingController.MAX_SEGMENT_MILLIS);
  });

  test('a browser restart drops the open segment', async () => {
    const id = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 60 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(MIN);
    clock.boot = 2;
    await controller.sync();
    expect(usage.value?.ruleMillis[id] ?? 0).toBe(0);
  });

  test('group members share one limit', async () => {
    const g = await groups.insert(createGroup(0, 'Video', { limitMinutesPerDay: 2 }));
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { groupId: g }));
    await rules.insert(createRule(0, 'WEBSITE', 'twitch.tv', { groupId: g }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(MIN);
    host.fg = [page(1, 'https://twitch.tv/')];
    await controller.sync();
    clock.advance(MIN);
    await controller.sync();
    expect(usage.value!.groupMillis[g]).toBe(2 * MIN);
    expect(host.blocked.at(-1)!.info).toMatchObject({ reason: 'LIMIT_REACHED', subject: 'Video' });
  });

  test('usage starts over in a new period', async () => {
    const id = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 60 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(MIN);
    await controller.sync();
    expect(usage.value!.ruleMillis[id]).toBe(MIN);

    clock.advance(12 * 60 * MIN); // past midnight
    await controller.sync();
    expect(usage.value!.periodStartMillis).toBe(Date.UTC(2027, 0, 16));
    expect(usage.value!.ruleMillis[id] ?? 0).toBe(0);
  });

  test('next check comes at the period end at the latest', async () => {
    clock.wall = Date.UTC(2027, 0, 15, 23, 58);
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 30 }));
    host.fg = [page(1, 'https://youtube.com/')];
    expect((await controller.sync()).nextCheckInMillis).toBe(2 * MIN);
  });
});

describe('countdown and warnings', () => {
  test('countdown appears in the last 5 minutes when switched on', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 6 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    expect(host.countdowns.get(1) ?? null).toBeNull();
    clock.advance(MIN);
    await controller.sync();
    expect(host.countdowns.get(1)).toBe(5 * MIN);
    host.fg = [page(2, 'https://example.org/')];
    await controller.sync();
    expect(host.countdowns.get(1)).toBeNull(); // hidden when leaving the tab
  });

  test('countdown stays hidden when switched off', async () => {
    await state.update((s) => ({ ...s, settings: { ...s.settings, limitTimer: false } }));
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 1 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    expect(host.countdowns.get(1) ?? null).toBeNull();
  });

  test('warning shows at 5 minutes and is removed when leaving the site', async () => {
    await state.update((s) => ({ ...s, settings: { ...s.settings, warnFiveMinutes: true } }));
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 5 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    expect([...host.warnings.values()]).toEqual([5 * MIN]);
    host.fg = [page(1, 'https://example.org/')];
    await controller.sync();
    expect([...host.warnings.values()]).toEqual([null]);
  });
});

describe('navigation check', () => {
  test('a blocked page is blocked as soon as it starts loading', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    await controller.sync(); // tracks the period
    await controller.checkNavigation(page(4, 'https://reddit.com/'));
    expect(host.blocked.map((b) => b.tabId)).toEqual([4]);
  });

  test('used-up limits block on navigation, others are let through', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 1 }));
    host.fg = [page(1, 'https://youtube.com/')];
    await controller.sync();
    clock.advance(MIN);
    host.fg = [page(1, 'https://example.org/')];
    await controller.sync();
    await controller.checkNavigation(page(2, 'https://example.org/'));
    await controller.checkNavigation(page(3, 'https://youtube.com/feed'));
    expect(host.blocked.map((b) => b.tabId)).toEqual([3]);
  });
});

describe('split view (several visible pages)', () => {
  test('visible pages of different rules all count', async () => {
    const yt = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 30 }));
    const tw = await rules.insert(createRule(0, 'WEBSITE', 'twitch.tv', { limitMinutesPerDay: 30 }));
    host.fg = [page(1, 'https://youtube.com/'), page(2, 'https://twitch.tv/')];
    await controller.sync();
    clock.advance(MIN);
    await controller.sync();
    expect(usage.value!.ruleMillis[yt]).toBe(MIN);
    expect(usage.value!.ruleMillis[tw]).toBe(MIN);
  });

  test('a group visible twice counts once', async () => {
    const g = await groups.insert(createGroup(0, 'Video', { limitMinutesPerDay: 30 }));
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { groupId: g }));
    await rules.insert(createRule(0, 'WEBSITE', 'twitch.tv', { groupId: g }));
    host.fg = [page(1, 'https://youtube.com/'), page(2, 'https://twitch.tv/')];
    await controller.sync();
    clock.advance(MIN);
    await controller.sync();
    expect(usage.value!.groupMillis[g]).toBe(MIN);
  });

  test('a blocked page beside an allowed one is blocked, the other keeps counting', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'reddit.com'));
    const yt = await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 30 }));
    host.fg = [page(1, 'https://youtube.com/'), page(2, 'https://reddit.com/')];
    await controller.sync();
    expect(host.blocked.map((b) => b.tabId)).toEqual([2]);
    clock.advance(MIN);
    await controller.sync();
    expect(usage.value!.ruleMillis[yt]).toBe(MIN);
  });

  test('each visible page shows its own countdown; next check at the earliest limit', async () => {
    await rules.insert(createRule(0, 'WEBSITE', 'youtube.com', { limitMinutesPerDay: 3 }));
    await rules.insert(createRule(0, 'WEBSITE', 'twitch.tv', { limitMinutesPerDay: 4 }));
    host.fg = [page(1, 'https://youtube.com/'), page(2, 'https://twitch.tv/')];
    expect((await controller.sync()).nextCheckInMillis).toBe(3 * MIN);
    expect(host.countdowns.get(1)).toBe(3 * MIN);
    expect(host.countdowns.get(2)).toBe(4 * MIN);
    host.fg = [page(2, 'https://twitch.tv/')];
    await controller.sync();
    expect(host.countdowns.get(1)).toBeNull();
  });
});
