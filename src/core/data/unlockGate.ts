// SPDX-License-Identifier: GPL-3.0-or-later
import { needsCode, type ChangeKind } from '../policy/changePolicy';
import { TimedSession } from '../policy/timedSession';
import type { Clock } from '../time/clock';
import { CodeRequiredError, isSetUp, type StateStore } from './appState';

/** Single place that decides whether a loosening change may be applied right now (= app unlocked). */
export class UnlockGate {
  constructor(
    private readonly store: StateStore,
    private readonly clock: Clock,
  ) {}

  async isOpen(): Promise<boolean> {
    const state = await this.store.current();
    // Before the first setup is complete, nothing is protected yet.
    if (!isSetUp(state.unlock) || !state.settings.setupComplete) return true;
    return TimedSession.isActive(state.unlock.unlockedSession, this.clock);
  }

  /** @throws CodeRequiredError if [kind] is loosening and the app isn't unlocked. */
  async check(kind: ChangeKind): Promise<void> {
    if (needsCode(kind) && !(await this.isOpen())) throw new CodeRequiredError();
  }
}
