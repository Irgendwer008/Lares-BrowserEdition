// SPDX-License-Identifier: GPL-3.0-or-later

/** Abstraction over wall clock, monotonic clock and boot identity (testable). */
export interface Clock {
  /** Wall clock, `Date.now()`. Can be changed by the user. */
  wallMillis(): number;

  /**
   * Monotonic time within one boot. In the browser the platform builds this clock (MV3 service
   * workers get suspended, so `performance.now()` is not usable across wake-ups).
   */
  elapsedMillis(): number;

  /** Changes on every "reboot" – in the browser: on every browser restart (browser session). */
  bootId(): number;
}
