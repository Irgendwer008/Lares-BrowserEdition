// SPDX-License-Identifier: GPL-3.0-or-later
import { elapsedSinceStart, resetScheduleOf, type AppState, type StateStore, type TrackedPeriod } from '../data/appState';
import type { GroupStore, RuleStore } from '../data/ruleRepository';
import { PolicyEngine, type AllowDecision, type BlockReason, type PolicySnapshot } from '../policy/policyEngine';
import type { UsagePeriod } from '../policy/resetSchedule';
import type { RuleGroup } from '../policy/rule';
import { UrlMatcher } from '../policy/urlMatcher';
import { TimedSession } from '../policy/timedSession';
import type { Clock } from '../time/clock';
import { Mutex } from '../unlock/mutex';
import { LimitWarnings, UsageCounter, usageSnapshot, type UsageSnapshot } from './usageCounter';

/** A tab and the page it shows. */
export interface Page {
  readonly tabId: number;
  readonly url: string;
}

/** What the block page shows. */
export interface BlockInfo {
  readonly url: string;
  readonly reason: BlockReason;
  /** The rule's target or the group's name. */
  readonly subject: string | null;
  /** When the limit resets (LIMIT_REACHED only). */
  readonly resetAtMillis: number | null;
}

/**
 * The browser side of blocking (Android: the accessibility service / usage monitor "host").
 * Implemented with `browser.*` in the background script, faked in tests.
 */
export interface BlockingHost {
  /**
   * The pages the user sees right now while present (Android: the foreground app plus apps visible
   * in split screen / picture-in-picture, while the screen is on): the active tab of the focused
   * window, plus other tabs visible in it (split view, e.g. Zen). Empty when the browser isn't in
   * front or the user is away.
   */
  foreground(): Promise<Page[]>;
  /** All open tabs (to block pages that became blocked while in the background). */
  openPages(): Promise<Page[]>;
  /** Replaces the tab's page with the block page. */
  block(tabId: number, info: BlockInfo): Promise<void>;
  /** Shows the countdown in the tab (remaining millis), or hides it (null). */
  countdown(tabId: number, remainingMillis: number | null): Promise<void>;
  /**
   * Shows / removes ([remainingMillis] null) an optional "limit almost reached" notification.
   * [subject] identifies the counted limits, [label] names them (the site) for the text.
   */
  warning(subject: string, remainingMillis: number | null, label?: string): Promise<void>;
}

/** Usage of the current period (Android: Room, written at most every 15 s). */
export interface UsageStore {
  load(): Promise<UsageSnapshot | null>;
  save(snapshot: UsageSnapshot): Promise<void>;
}

/** The time currently being counted, persisted so a suspended background worker doesn't lose it. */
export interface CountingSegment {
  readonly tabIds: readonly number[];
  readonly startElapsedMillis: number;
  readonly bootId: number;
  /** The usage period the time belongs to (time from an earlier period is dropped). */
  readonly periodStartMillis: number;
  readonly countedRuleIds: readonly number[];
  readonly countedGroupIds: readonly number[];
}

export interface SegmentStore {
  get(): Promise<CountingSegment | null>;
  set(segment: CountingSegment | null): Promise<void>;
}

/** Result of one sync: when the next check is due at the latest (a limit runs out), or null. */
export interface SyncResult {
  readonly nextCheckInMillis: number | null;
}

/**
 * Longest stretch counted at once. The background script checks at least every
 * MAX_SEGMENT_MILLIS / 2 (alarm); a longer gap means the computer slept or the worker couldn't
 * run, and that time isn't counted.
 */
const MAX_SEGMENT_MILLIS = 2 * 60_000;

/**
 * Browser counterpart of the Android BlockingController: instead of a one-second loop it runs on
 * events (tab switched, page loaded, window focus, idle state, alarm, countdown ran out). Each
 * sync counts the time since the previous one for what was counted then, advances the usage
 * period, blocks every open page that is blocked now and starts counting the visible pages.
 * Active only when setup is complete; blocking stays active in unlocked mode.
 */
export class BlockingController {
  static readonly MAX_SEGMENT_MILLIS = MAX_SEGMENT_MILLIS;

  private readonly mutex = new Mutex();
  private readonly warnings = new LimitWarnings();
  /** Tabs currently showing the countdown (hidden again when they're no longer visible). */
  private countdownTabs = new Set<number>();

  constructor(
    private readonly clock: Clock,
    private readonly state: StateStore,
    private readonly rules: RuleStore,
    private readonly groups: GroupStore,
    private readonly usage: UsageStore,
    private readonly segments: SegmentStore,
    private readonly host: BlockingHost,
    private readonly zone: () => string,
  ) {}

  sync(): Promise<SyncResult> {
    return this.mutex.withLock(() => this.doSync());
  }

  /**
   * A tab starts loading [page]: blocks it right away if it's blocked, before the page shows up
   * (time is counted by the next [sync]).
   */
  checkNavigation(page: Page): Promise<void> {
    return this.mutex.withLock(async () => {
      const appState = await this.state.current();
      const period = appState.trackedPeriod;
      if (!appState.settings.setupComplete || period === null) return;
      const usage = await this.usageFor(period, await this.usage.load());
      const snapshot = await this.policySnapshot(appState, usage);
      const d = PolicyEngine.evaluate(page.url, snapshot);
      if (d.kind === 'block') await this.host.block(page.tabId, this.blockInfo(page.url, d.reason, d.ruleId, d.groupId, snapshot, period));
    });
  }

  private async doSync(): Promise<SyncResult> {
    const appState = await this.advancePeriod();
    const period = appState.trackedPeriod!;
    const stored = await this.usage.load();
    const counter = new UsageCounter(await this.usageFor(period, stored));
    const changed = await this.closeSegment(counter);
    if (changed || stored?.periodStartMillis !== period.startMillis) await this.usage.save(counter.snapshot);

    if (!appState.settings.setupComplete) {
      await this.segments.set(null);
      return { nextCheckInMillis: null };
    }

    const snapshot = await this.policySnapshot(appState, counter.snapshot);
    const blocked = await this.blockOpenPages(snapshot, period);

    // Everything visible counts (Android: split screen / PiP): blocked pages are blocked, allowed
    // ones count their time – in one add, so a group visible twice counts once.
    const visible: { page: Page; decision: AllowDecision }[] = [];
    for (const page of await this.host.foreground()) {
      const d = PolicyEngine.evaluate(page.url, snapshot);
      if (d.kind === 'block') {
        if (!blocked.has(page.tabId)) await this.host.block(page.tabId, this.blockInfo(page.url, d.reason, d.ruleId, d.groupId, snapshot, period));
      } else if (d.countedRuleIds.length > 0 || d.countedGroupIds.length > 0) {
        visible.push({ page, decision: d });
      }
    }

    await this.segments.set(
      visible.length > 0
        ? {
            tabIds: visible.map((v) => v.page.tabId),
            startElapsedMillis: this.clock.elapsedMillis(),
            bootId: this.clock.bootId(),
            periodStartMillis: period.startMillis,
            countedRuleIds: [...new Set(visible.flatMap((v) => v.decision.countedRuleIds))].sort((a, b) => a - b),
            countedGroupIds: [...new Set(visible.flatMap((v) => v.decision.countedGroupIds))].sort((a, b) => a - b),
          }
        : null,
    );

    const timers = new Map<number, number>();
    if (appState.settings.limitTimer) {
      for (const { page, decision } of visible) {
        const r = decision.remainingMillis;
        if (r !== null && r <= LimitWarnings.TIMER_THRESHOLD) timers.set(page.tabId, r);
      }
    }
    await this.setCountdowns(timers);
    await this.updateWarnings(visible, appState);

    // Counting time can also end the usage period – check again then at the latest.
    const remaining = visible.map((v) => v.decision.remainingMillis).filter((r): r is number => r !== null);
    if (remaining.length === 0) return { nextCheckInMillis: null };
    const untilPeriodEnd = period.endMillis - this.clock.wallMillis();
    return { nextCheckInMillis: Math.max(0, Math.min(...remaining, untilPeriodEnd)) };
  }

  /** Shows the countdown in [timers] (tab → remaining millis) and hides it everywhere else. */
  private async setCountdowns(timers: ReadonlyMap<number, number>): Promise<void> {
    for (const tabId of this.countdownTabs) if (!timers.has(tabId)) await this.host.countdown(tabId, null);
    for (const [tabId, remaining] of timers) await this.host.countdown(tabId, remaining);
    this.countdownTabs = new Set(timers.keys());
  }

  /** Advances the tracked usage period monotonically (see ResetSchedule.advance). */
  private async advancePeriod(): Promise<AppState> {
    const wall = this.clock.wallMillis();
    const elapsed = this.clock.elapsedMillis();
    const boot = this.clock.bootId();
    return this.state.update((s) => {
      const schedule = resetScheduleOf(s.settings);
      const tracked = s.trackedPeriod;
      const current: UsagePeriod | null = tracked === null ? null : { start: tracked.startMillis, end: tracked.endMillis };
      const since = tracked === null ? null : elapsedSinceStart(tracked, elapsed, boot);
      const next = schedule.advance(current, wall, this.zone(), since);
      if (tracked !== null && next.start === tracked.startMillis && next.end === tracked.endMillis) return s;
      // The monotonic start is backdated to the period's start: tracking can begin late (first
      // run, browser closed at the reset time), and the clock-forward check in `advance` compares
      // against the whole period length. (The Android app uses "now" here, which delays the next
      // reset by however late tracking began.)
      const lateBy = Math.max(0, wall - next.start);
      const period: TrackedPeriod = { startMillis: next.start, endMillis: next.end, startElapsedMillis: elapsed - lateBy, startBootId: boot };
      return { ...s, trackedPeriod: period };
    });
  }

  private async usageFor(period: TrackedPeriod, stored: UsageSnapshot | null): Promise<UsageSnapshot> {
    if (stored !== null && stored.periodStartMillis === period.startMillis) return stored;
    if (stored !== null) for (const subject of this.warnings.reset()) await this.host.warning(subject, null);
    return usageSnapshot(period.startMillis, period.endMillis);
  }

  /** Counts the time since the last sync for what was counted then. @return true if usage changed. */
  private async closeSegment(counter: UsageCounter): Promise<boolean> {
    const segment = await this.segments.get();
    if (segment === null || segment.bootId !== this.clock.bootId()) return false;
    if (segment.periodStartMillis !== counter.snapshot.periodStartMillis) return false;
    const millis = Math.min(this.clock.elapsedMillis() - segment.startElapsedMillis, MAX_SEGMENT_MILLIS);
    return counter.add({ kind: 'allow', countedRuleIds: segment.countedRuleIds, countedGroupIds: segment.countedGroupIds, remainingMillis: null }, millis);
  }

  private async policySnapshot(appState: AppState, usage: UsageSnapshot): Promise<PolicySnapshot> {
    const groups = new Map<number, RuleGroup>((await this.groups.all()).map((g) => [g.id, g]));
    return {
      rules: await this.rules.all(),
      groups,
      usedMillis: usage.ruleMillis,
      groupUsedMillis: usage.groupMillis,
      pauseActive: TimedSession.isActive(appState.unlock.pause, this.clock),
    };
  }

  /** @return the ids of the tabs that were blocked. */
  private async blockOpenPages(snapshot: PolicySnapshot, period: TrackedPeriod): Promise<Set<number>> {
    const blocked = new Set<number>();
    for (const page of await this.host.openPages()) {
      const d = PolicyEngine.evaluate(page.url, snapshot);
      if (d.kind !== 'block') continue;
      await this.host.block(page.tabId, this.blockInfo(page.url, d.reason, d.ruleId, d.groupId, snapshot, period));
      blocked.add(page.tabId);
    }
    return blocked;
  }

  private blockInfo(url: string, reason: BlockReason, ruleId: number | null, groupId: number | null, snapshot: PolicySnapshot, period: TrackedPeriod): BlockInfo {
    const group = groupId === null ? undefined : snapshot.groups?.get(groupId);
    const rule = ruleId === null ? undefined : snapshot.rules.find((r) => r.id === ruleId);
    return {
      url,
      reason,
      subject: group?.name ?? rule?.target ?? null,
      resetAtMillis: reason === 'LIMIT_REACHED' ? period.endMillis : null,
    };
  }

  /** One warning per limit running out (a group visible twice gets one). */
  private async updateWarnings(visible: readonly { page: Page; decision: AllowDecision }[], appState: AppState): Promise<void> {
    const thresholds: number[] = [];
    if (appState.settings.warnFiveMinutes) thresholds.push(LimitWarnings.FIVE_MINUTES);
    if (appState.settings.warnOneMinute) thresholds.push(LimitWarnings.ONE_MINUTE);
    const current = new Set<string>();
    for (const { page, decision } of visible) {
      if (decision.remainingMillis === null) continue;
      const subject = LimitWarnings.subjectOf(decision);
      if (current.has(subject)) continue;
      current.add(subject);
      const change = this.warnings.update(subject, decision.remainingMillis, thresholds);
      if (change?.kind === 'show') await this.host.warning(subject, decision.remainingMillis, UrlMatcher.parse(page.url)?.host);
      else if (change?.kind === 'remove') await this.host.warning(subject, null);
    }
    for (const subject of this.warnings.removeAllExcept(current)) await this.host.warning(subject, null);
  }
}
