// SPDX-License-Identifier: GPL-3.0-or-later
import type { Clock } from '@/core/time/clock';
import { withLock } from './storage';

const SESSION_KEY = 'clock';
const LAST_BOOT_KEY = 'lastBootId';

/** Persisted in session storage: the monotonic time at a wall-clock instant, and the session id. */
interface ClockAnchor {
  readonly bootId: number;
  readonly elapsedMillis: number;
  readonly wallMillis: number;
}

/**
 * Clock for the extension (see CLAUDE.md, "Browser-specific decisions").
 *
 * - `bootId`: one id per browser session. Session storage is cleared when the browser closes;
 *   a new session takes the last id + 1 (stored in local storage).
 * - `elapsedMillis`: monotonic within a session. While this context runs it follows
 *   `performance.now()`; across worker suspensions it continues from the last checkpoint by the
 *   wall-clock time in between, but never backwards (setting the clock back can't extend
 *   anything). Setting the clock forward while the worker is suspended does advance it – that
 *   jump is reported by the protection monitor instead.
 */
export class BrowserClock implements Clock {
  private constructor(
    private readonly session: number,
    private readonly baseElapsed: number,
    private readonly basePerf: number,
  ) {}

  /** Safe to call from several contexts at once (one new session id per browser session). */
  static create(): Promise<BrowserClock> {
    return withLock(SESSION_KEY, () => BrowserClock.load());
  }

  private static async load(): Promise<BrowserClock> {
    const { [SESSION_KEY]: anchor } = (await browser.storage.session.get(SESSION_KEY)) as { [SESSION_KEY]?: ClockAnchor };
    const perf = performance.now();
    if (anchor) {
      const elapsed = anchor.elapsedMillis + Math.max(0, Date.now() - anchor.wallMillis);
      return new BrowserClock(anchor.bootId, elapsed, perf);
    }
    const { [LAST_BOOT_KEY]: last } = (await browser.storage.local.get(LAST_BOOT_KEY)) as { [LAST_BOOT_KEY]?: number };
    const bootId = (last ?? 0) + 1;
    await browser.storage.local.set({ [LAST_BOOT_KEY]: bootId });
    const clock = new BrowserClock(bootId, 0, perf);
    await clock.checkpoint();
    return clock;
  }

  wallMillis(): number {
    return Date.now();
  }

  elapsedMillis(): number {
    return this.baseElapsed + Math.max(0, performance.now() - this.basePerf);
  }

  bootId(): number {
    return this.session;
  }

  /** Saves the current reading so a restarted worker continues from here. Call regularly. */
  async checkpoint(): Promise<void> {
    const anchor: ClockAnchor = { bootId: this.session, elapsedMillis: this.elapsedMillis(), wallMillis: Date.now() };
    await browser.storage.session.set({ [SESSION_KEY]: anchor });
  }
}
