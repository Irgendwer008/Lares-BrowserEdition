// SPDX-License-Identifier: GPL-3.0-or-later

/** Serializes async sections (Kotlin `Mutex.withLock`). Not reentrant. */
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();

  withLock<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
