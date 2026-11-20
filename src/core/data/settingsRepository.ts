// SPDX-License-Identifier: GPL-3.0-or-later
import { ChangePolicy } from '../policy/changePolicy';
import type { Clock } from '../time/clock';
import { systemZone, type MinuteOfDay } from '../time/zonedTime';
import { resetScheduleOf, withResetSchedule, type AppSettings, type Protection, type StateStore, type Unsubscribe } from './appState';
import type { UnlockGate } from './unlockGate';

/**
 * Settings changes with the tighten/loosen policy applied.
 * Browser port: no blocking mode, website-blocking switch, website hint or theme (see AppSettings).
 */
export class SettingsRepository {
  constructor(
    private readonly store: StateStore,
    private readonly gate: UnlockGate,
    private readonly clock: Clock,
    /** IANA time zone, e.g. "Europe/Berlin". */
    private readonly zone: () => string = systemZone,
  ) {}

  async current(): Promise<AppSettings> {
    return (await this.store.current()).settings;
  }

  subscribe(listener: (settings: AppSettings) => void): Unsubscribe {
    return this.store.subscribe((s) => listener(s.settings));
  }

  private async change(f: (s: AppSettings) => AppSettings): Promise<void> {
    await this.store.update((s) => ({ ...s, settings: f(s.settings) }));
  }

  /** Whether the rules export includes the encrypted authenticator code (not loosening either way). */
  async setExportIncludesTotp(enabled: boolean): Promise<void> {
    await this.change((s) => ({ ...s, exportIncludesTotp: enabled }));
  }

  async setProtection(protection: Protection, enabled: boolean): Promise<void> {
    const current = (await this.current()).protections;
    await this.gate.check(ChangePolicy.classifyToggle(current.includes(protection), enabled));
    await this.change((s) => {
      const set = s.protections.filter((p) => p !== protection);
      return { ...s, protections: enabled ? [...set, protection] : set };
    });
  }

  /** Countdown and warnings only inform – switching them is never loosening. */
  async setLimitTimer(enabled: boolean): Promise<void> {
    await this.change((s) => ({ ...s, limitTimer: enabled }));
  }

  async setWarnings(fiveMinutes: boolean, oneMinute: boolean): Promise<void> {
    await this.change((s) => ({ ...s, warnFiveMinutes: fiveMinutes, warnOneMinute: oneMinute }));
  }

  /**
   * Needs the code (either direction can grant a fresh quota); takes effect after the next reset.
   * @param time minutes after midnight (0‥1439).
   */
  async setResetTime(time: MinuteOfDay): Promise<void> {
    if (!Number.isInteger(time) || time < 0 || time >= 24 * 60) throw new RangeError(`invalid reset time ${time}`);
    const settings = await this.current();
    const now = this.clock.wallMillis();
    const schedule = resetScheduleOf(settings).settle(now, this.zone());
    // Back to the time that is still in effect = cancelling a pending change: nothing is
    // loosened (the pending change never applied), so no code is needed.
    const pending = schedule.pending;
    const cancelsPending = pending !== null && now < pending.effectiveFrom && time === schedule.resetTime;
    if (!cancelsPending) await this.gate.check(ChangePolicy.classifyResetTime(pending?.resetTime ?? schedule.resetTime, time));
    const updated = schedule.requestChange(time, now, this.zone());
    await this.change((s) => withResetSchedule(s, updated));
  }
}
