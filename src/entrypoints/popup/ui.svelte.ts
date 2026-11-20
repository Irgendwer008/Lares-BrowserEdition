// SPDX-License-Identifier: GPL-3.0-or-later
import { i18n } from '#i18n';
import { CodeRequiredError } from '@/core/data/appState';
import type { LaresModel } from '@/lib/app.svelte';

export type Screen =
  | { name: 'home' }
  | { name: 'add'; groupId: number | null }
  | { name: 'settings' }
  | { name: 'changeCode' }
  | { name: 'licenses'; view: 'license' | 'libraries' };

export type Dialog =
  | { name: 'unlock' }
  | { name: 'pause' }
  | { name: 'rule'; ruleId: number }
  /** `thenAdd`: after creating the group, continue with adding websites to it. */
  | { name: 'group'; groupId: number | null; thenAdd?: boolean };

/** Navigation and transient UI state of the popup. */
class Ui {
  screen = $state<Screen>({ name: 'home' });
  dialog = $state<Dialog | null>(null);
  snackbar = $state<string | null>(null);
  error = $state<string | null>(null);
  private snackTimer: ReturnType<typeof setTimeout> | undefined;
  /** A loosening change that waits for the guardian code; retried after unlocking. */
  private pending: (() => Promise<void>) | null = null;

  go(screen: Screen) {
    this.screen = screen;
    this.dialog = null;
    document.querySelector('main')?.scrollTo(0, 0);
  }

  open(dialog: Dialog) {
    this.dialog = dialog;
  }

  close() {
    this.dialog = null;
  }

  snack(text: string) {
    this.snackbar = text;
    clearTimeout(this.snackTimer);
    this.snackTimer = setTimeout(() => (this.snackbar = null), 4000);
  }

  /**
   * Runs a change; if it loosens a restriction while locked, asks for the guardian code and
   * retries it after a successful unlock (Android: "needs code" → unlock dialog).
   * @return true if the change was applied right away.
   */
  async guarded(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      return true;
    } catch (e) {
      if (!(e instanceof CodeRequiredError)) throw e;
      this.pending = action;
      this.snack(i18n.t('homeNeedsCode'));
      this.dialog = { name: 'unlock' };
      return false;
    }
  }

  /** Runs [action] now if unlocked, otherwise asks for the guardian code and runs it afterwards. */
  whenUnlocked(unlocked: boolean, action: () => void) {
    if (unlocked) {
      action();
      return;
    }
    this.pending = async () => action();
    this.dialog = { name: 'unlock' };
  }

  /** Called by the unlock dialog after a correct code. */
  async unlocked() {
    const action = this.pending;
    this.pending = null;
    this.dialog = null;
    if (action) await this.guarded(action);
  }

  cancelPending() {
    this.pending = null;
  }
}

export const ui = new Ui();

let model: LaresModel;
export function setModel(m: LaresModel) {
  model = m;
}
export function useModel(): LaresModel {
  return model;
}

/** "4:05" / "1:02:03" for remaining times. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
}

/** "15 minutes" / "2 hours" / "1 hour 30 minutes" (localized plurals). */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return i18n.t('durationMinutes', m);
  if (m === 0) return i18n.t('durationHours', h);
  return `${i18n.t('durationHours', h)} ${i18n.t('durationMinutes', m)}`;
}

/** Local time of day for a minute-of-day value. */
export function formatMinuteOfDay(minuteOfDay: number): string {
  const d = new Date(2000, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
