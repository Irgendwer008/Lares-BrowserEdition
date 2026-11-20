// SPDX-License-Identifier: GPL-3.0-or-later
import type { UsageSnapshot } from '@/core/blocking/usageCounter';
import { AlertChannelRepository } from '@/core/alerts/alertChannelRepository';
import { CodeRequiredError, defaultAppState, type AppState } from '@/core/data/appState';
import { RuleRepository } from '@/core/data/ruleRepository';
import { SettingsRepository } from '@/core/data/settingsRepository';
import { UnlockGate } from '@/core/data/unlockGate';
import type { Rule, RuleGroup } from '@/core/policy/rule';
import { TimedSession } from '@/core/policy/timedSession';
import { systemZone } from '@/core/time/zonedTime';
import { UnlockManager } from '@/core/unlock/unlockManager';
import { BrowserClock } from '@/platform/browserClock';
import { StorageGroupStore, StorageRuleStore, StorageStateStore, StorageTamperLog, StorageUsageStore } from '@/platform/storage';
import { WebCryptoCipher } from '@/platform/webCryptoCipher';

/** Everything the UI talks to (created once per page). */
export interface Services {
  clock: BrowserClock;
  state: StorageStateStore;
  rules: RuleRepository;
  settings: SettingsRepository;
  unlock: UnlockManager;
  channels: AlertChannelRepository;
  usage: StorageUsageStore;
}

export async function createServices(): Promise<Services> {
  const clock = await BrowserClock.create();
  const state = new StorageStateStore();
  const ruleStore = new StorageRuleStore();
  const gate = new UnlockGate(state, clock);
  const cipher = new WebCryptoCipher();
  return {
    clock,
    state,
    rules: new RuleRepository(ruleStore, new StorageGroupStore(ruleStore), gate),
    settings: new SettingsRepository(state, gate, clock, systemZone),
    unlock: new UnlockManager(state, clock, cipher, new StorageTamperLog()),
    channels: new AlertChannelRepository(state, gate, cipher),
    usage: new StorageUsageStore(),
  };
}

/** Reactive view of the stored data for the Svelte UI (updates when storage changes). */
export class LaresModel {
  state = $state<AppState>(defaultAppState());
  rules = $state<readonly Rule[]>([]);
  groups = $state<readonly RuleGroup[]>([]);
  usage = $state<UsageSnapshot | null>(null);
  /** Ticks every second, so remaining times re-render. */
  now = $state(Date.now());
  loaded = $state(false);

  constructor(readonly services: Services) {
    const ruleStore = new StorageRuleStore();
    services.state.subscribe((s) => {
      this.state = s;
      this.loaded = true;
    });
    ruleStore.subscribe((r) => (this.rules = r));
    new StorageGroupStore(ruleStore).subscribe((g) => (this.groups = g));
    services.usage.subscribe((u) => (this.usage = u));
    setInterval(() => (this.now = Date.now()), 1000);
  }

  private remaining(session: TimedSession | null): number {
    void this.now; // re-evaluate every second
    return session === null ? 0 : Math.max(0, TimedSession.remainingMillis(session, this.services.clock));
  }

  get unlockedMillis(): number {
    return this.remaining(this.state.unlock.unlockedSession);
  }

  get pauseMillis(): number {
    return this.remaining(this.state.unlock.pause);
  }

  get isUnlocked(): boolean {
    return this.unlockedMillis > 0;
  }

  /** The current usage (only if it belongs to the current period). */
  usedMillis(kind: 'rule' | 'group', id: number): number {
    const u = this.usage;
    const p = this.state.trackedPeriod;
    if (u === null || p === null || u.periodStartMillis !== p.startMillis) return 0;
    return (kind === 'rule' ? u.ruleMillis[id] : u.groupMillis[id]) ?? 0;
  }
}

export { CodeRequiredError };
