// SPDX-License-Identifier: GPL-3.0-or-later
import { defaultAppState, type AppState, type SecretCipher, type StateStore, type Unsubscribe } from '@/core/data/appState';
import type { GroupStore, RuleStore } from '@/core/data/ruleRepository';
import type { TamperEvent, TamperEventType, TamperLog } from '@/core/data/tamperLog';
import type { Rule, RuleGroup } from '@/core/policy/rule';
import type { Clock } from '@/core/time/clock';
import { base64Decode, base64Encode } from '@/core/unlock/bytes';

export class FakeClock implements Clock {
  constructor(
    public wall = 1_800_000_000_000,
    public elapsed = 10_000,
    public boot = 1,
  ) {}

  wallMillis(): number {
    return this.wall;
  }

  elapsedMillis(): number {
    return this.elapsed;
  }

  bootId(): number {
    return this.boot;
  }

  advance(millis: number): void {
    this.wall += millis;
    this.elapsed += millis;
  }
}

/** Minimal observable value (Kotlin `MutableStateFlow`). */
class Observable<T> {
  private readonly listeners = new Set<(value: T) => void>();

  constructor(public value: T) {}

  set(value: T): void {
    this.value = value;
    for (const l of this.listeners) l(value);
  }

  subscribe(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    listener(this.value);
    return () => this.listeners.delete(listener);
  }
}

export class FakeStateStore implements StateStore {
  private readonly flow: Observable<AppState>;

  constructor(initial: AppState = defaultAppState()) {
    this.flow = new Observable(initial);
  }

  async current(): Promise<AppState> {
    return this.flow.value;
  }

  async update(transform: (state: AppState) => AppState): Promise<AppState> {
    this.flow.set(transform(this.flow.value));
    return this.flow.value;
  }

  subscribe(listener: (state: AppState) => void): Unsubscribe {
    return this.flow.subscribe(listener);
  }
}

/** Not secure – just reversible, to test the code paths. */
export class FakeCipher implements SecretCipher {
  async encrypt(plain: Uint8Array): Promise<string> {
    return base64Encode(Uint8Array.from(plain).reverse());
  }

  async decrypt(encoded: string): Promise<Uint8Array> {
    const bytes = base64Decode(encoded);
    if (bytes === null) throw new Error('bad input');
    return bytes.reverse();
  }
}

export class FakeTamperLog implements TamperLog {
  private readonly flow = new Observable<readonly TamperEvent[]>([]);

  get recorded(): TamperEventType[] {
    return this.flow.value.map((e) => e.type);
  }

  get events(): readonly TamperEvent[] {
    return this.flow.value;
  }

  async record(type: TamperEventType, details: string | null = null): Promise<void> {
    const list = this.flow.value;
    this.flow.set([...list, { id: list.length + 1, type, timestampMillis: 0, details, delivered: false }]);
  }

  async undelivered(): Promise<TamperEvent[]> {
    return this.flow.value.filter((e) => !e.delivered);
  }

  async markDelivered(id: number): Promise<void> {
    this.flow.set(this.flow.value.map((e) => (e.id === id ? { ...e, delivered: true } : e)));
  }

  subscribe(listener: (events: readonly TamperEvent[]) => void): Unsubscribe {
    return this.flow.subscribe(listener);
  }
}

export class FakeRuleStore implements RuleStore {
  private readonly flow = new Observable<readonly Rule[]>([]);
  private nextId = 1;

  async all(): Promise<Rule[]> {
    return [...this.flow.value];
  }

  async get(id: number): Promise<Rule | null> {
    return this.flow.value.find((r) => r.id === id) ?? null;
  }

  async insert(rule: Rule): Promise<number> {
    const id = this.nextId++;
    this.flow.set([...this.flow.value, { ...rule, id }]);
    return id;
  }

  async update(rule: Rule): Promise<void> {
    this.flow.set(this.flow.value.map((r) => (r.id === rule.id ? rule : r)));
  }

  async delete(id: number): Promise<void> {
    this.flow.set(this.flow.value.filter((r) => r.id !== id));
  }

  subscribe(listener: (rules: readonly Rule[]) => void): Unsubscribe {
    return this.flow.subscribe(listener);
  }
}

/** Shares the rule store so [deleteWithMembers] can remove members like a real store does. */
export class FakeGroupStore implements GroupStore {
  private readonly flow = new Observable<readonly RuleGroup[]>([]);
  private nextId = 1;

  constructor(private readonly rules: FakeRuleStore) {}

  async all(): Promise<RuleGroup[]> {
    return [...this.flow.value];
  }

  async get(id: number): Promise<RuleGroup | null> {
    return this.flow.value.find((g) => g.id === id) ?? null;
  }

  async insert(group: RuleGroup): Promise<number> {
    const id = this.nextId++;
    this.flow.set([...this.flow.value, { ...group, id }]);
    return id;
  }

  async update(group: RuleGroup): Promise<void> {
    this.flow.set(this.flow.value.map((g) => (g.id === group.id ? group : g)));
  }

  async deleteWithMembers(id: number): Promise<void> {
    for (const r of await this.rules.all()) if (r.groupId === id) await this.rules.delete(r.id);
    this.flow.set(this.flow.value.filter((g) => g.id !== id));
  }

  subscribe(listener: (groups: readonly RuleGroup[]) => void): Unsubscribe {
    return this.flow.subscribe(listener);
  }
}

/** Expects [block] to throw an error of class [type]. */
export async function expectThrows(block: () => Promise<unknown>, type: abstract new (...args: never[]) => Error): Promise<void> {
  let error: unknown = null;
  try {
    await block();
  } catch (e) {
    error = e;
  }
  if (!(error instanceof type)) throw new Error(`expected ${type.name}, got ${String(error)}`);
}
