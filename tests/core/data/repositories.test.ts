// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, test } from 'vitest';
import { CodeRequiredError, defaultAppState, resetScheduleOf } from '@/core/data/appState';
import { RuleRepository } from '@/core/data/ruleRepository';
import { SettingsRepository } from '@/core/data/settingsRepository';
import { UnlockGate } from '@/core/data/unlockGate';
import { TimedSession } from '@/core/policy/timedSession';
import { minuteOfDay, zonedInstant } from '@/core/time/zonedTime';
import { expectThrows, FakeClock, FakeGroupStore, FakeRuleStore, FakeStateStore } from '../../testing/fakes';

const zone = 'Europe/Berlin';
/** 2026-11-<day> <hour>:00 in Berlin. */
const nov = (day: number, hour: number) => zonedInstant(Math.floor(Date.UTC(2026, 10, day) / 86_400_000), minuteOfDay(hour), zone);

describe('repositories', () => {
  let clock: FakeClock;
  let store: FakeStateStore;
  let ruleStore: FakeRuleStore;
  let rules: RuleRepository;
  let settings: SettingsRepository;

  beforeEach(() => {
    clock = new FakeClock();
    store = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x' }, settings: { setupComplete: true } }));
    const gate = new UnlockGate(store, clock);
    ruleStore = new FakeRuleStore();
    rules = new RuleRepository(ruleStore, new FakeGroupStore(ruleStore), gate);
    settings = new SettingsRepository(store, gate, clock, () => zone);
  });

  const unlockApp = () => store.update((s) => ({ ...s, unlock: { ...s.unlock, unlockedSession: TimedSession.start(60_000, clock) } }));
  const lockApp = () => store.update((s) => ({ ...s, unlock: { ...s.unlock, unlockedSession: null } }));

  test('adding rules is free and normalized', async () => {
    const added = await rules.add('WEBSITE', 'https://www.Reddit.com/');
    expect(added.kind).toBe('added');
    expect((await ruleStore.get(added.kind === 'added' ? added.id : -1))!.target).toBe('reddit.com');
    expect((await rules.add('WEBSITE', 'reddit.com')).kind).toBe('duplicate');
    expect(await rules.add('WEBSITE', 'not a url')).toEqual({ kind: 'invalidTarget' });
    expect(await rules.add('APP', 'notapackage')).toEqual({ kind: 'invalidTarget' });
    expect(await rules.add('WEBSITE', 'reddit.org', -1)).toEqual({ kind: 'invalidTarget' });
    expect((await rules.add('APP', ' com.instagram.android ')).kind).toBe('added');
  });

  test('loosening rules needs unlocked mode', async () => {
    const r = await rules.add('WEBSITE', 'instagram.com', 30);
    const id = r.kind === 'added' ? r.id : -1;

    await rules.updateRule(id, 10, true); // tighter: fine
    await rules.updateRule(id, null, true); // always-on: fine
    await expectThrows(() => rules.updateRule(id, 60, true), CodeRequiredError);
    await expectThrows(() => rules.setEnabled(id, false), CodeRequiredError);
    await expectThrows(() => rules.remove(id), CodeRequiredError);
    expect((await ruleStore.all()).length).toBe(1);

    await unlockApp();
    await rules.updateRule(id, 60, true);
    await rules.remove(id);
    expect(await ruleStore.all()).toEqual([]);

    clock.advance(60_000); // edit session over
    await rules.add('WEBSITE', 'instagram.com');
  });

  test('nothing is protected before setup', async () => {
    const freshStore = new FakeRuleStore();
    const fresh = new RuleRepository(freshStore, new FakeGroupStore(freshStore), new UnlockGate(new FakeStateStore(), clock));
    const r = await fresh.add('WEBSITE', 'instagram.com');
    await fresh.remove(r.kind === 'added' ? r.id : -1);
    expect(await freshStore.all()).toEqual([]);
  });

  test('nothing is protected until the first setup is complete', async () => {
    // Code already stored, but the first setup isn't finished.
    const midSetup = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x' } }));
    const s = new SettingsRepository(midSetup, new UnlockGate(midSetup, clock), clock, () => zone);
    await s.setProtection('GUARDIAN_ALERTS', true);
    await s.setProtection('GUARDIAN_ALERTS', false);
    expect((await midSetup.current()).settings.protections).toEqual([]);
  });

  test('settings policy', async () => {
    await settings.setProtection('GUARDIAN_ALERTS', true);
    await expectThrows(() => settings.setProtection('GUARDIAN_ALERTS', false), CodeRequiredError);
    expect((await settings.current()).protections).toEqual(['GUARDIAN_ALERTS']);
    await expectThrows(() => settings.setResetTime(minuteOfDay(4)), CodeRequiredError);

    // Informational settings are never loosening.
    await settings.setLimitTimer(false);
    await settings.setWarnings(true, false);
    await settings.setExportIncludesTotp(false);
    const s = await settings.current();
    expect([s.limitTimer, s.warnFiveMinutes, s.warnOneMinute, s.exportIncludesTotp]).toEqual([false, true, false, false]);

    await unlockApp();
    await settings.setProtection('GUARDIAN_ALERTS', false);
    expect((await settings.current()).protections).toEqual([]);
  });

  test('reset time change is pending until the next reset', async () => {
    clock.wall = nov(11, 21);
    await unlockApp();
    await settings.setResetTime(minuteOfDay(4));
    const s = await settings.current();
    expect(s.resetMinuteOfDay).toBe(0);
    expect(s.pendingResetMinuteOfDay).toBe(4 * 60);
    expect(s.pendingResetEffectiveFromMillis).toBe(nov(12, 0));
    expect(resetScheduleOf(s).resetTime).toBe(0);
  });

  test('cancelling a pending reset change needs no code', async () => {
    clock.wall = nov(11, 21);
    await unlockApp();
    await settings.setResetTime(minuteOfDay(4));
    await lockApp();
    await expectThrows(() => settings.setResetTime(minuteOfDay(5)), CodeRequiredError); // another change: loosening
    await settings.setResetTime(0); // back to the time in effect: free
    expect((await settings.current()).pendingResetMinuteOfDay).toBeNull();
  });

  test('cancelling after the change applied needs the code', async () => {
    clock.wall = nov(11, 21);
    await unlockApp();
    await settings.setResetTime(minuteOfDay(4)); // applies from midnight
    await lockApp();
    clock.wall = nov(12, 1); // transition running
    await expectThrows(() => settings.setResetTime(0), CodeRequiredError);
  });

  test('subscribe delivers settings', async () => {
    const seen: boolean[] = [];
    const off = settings.subscribe((s) => seen.push(s.limitTimer));
    await settings.setLimitTimer(false);
    off();
    await settings.setLimitTimer(true);
    expect(seen).toEqual([true, false]);
  });
});
