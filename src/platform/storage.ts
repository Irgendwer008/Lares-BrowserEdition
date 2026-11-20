// SPDX-License-Identifier: GPL-3.0-or-later
import type { CountingSegment, SegmentStore, UsageStore } from '@/core/blocking/blockingController';
import type { UsageSnapshot } from '@/core/blocking/usageCounter';
import { restoreAppState, type AppState, type StateStore, type Unsubscribe } from '@/core/data/appState';
import type { GroupStore, RuleStore } from '@/core/data/ruleRepository';
import type { TamperEvent, TamperEventType, TamperLog } from '@/core/data/tamperLog';
import type { Rule, RuleGroup } from '@/core/policy/rule';
import { Mutex } from '@/core/unlock/mutex';

type Area = 'local' | 'session';

/** Storage keys (stored data must stay readable across updates – only additive changes). */
export const KEYS = {
  appState: 'appState',
  rules: 'rules',
  groups: 'groups',
  tamperEvents: 'tamperEvents',
  usage: 'usage',
  segment: 'segment',
} as const;

const fallbackMutexes = new Map<string, Mutex>();

/**
 * Runs [action] exclusively for [name] across all extension contexts (background, popup, options)
 * via the Web Locks API; falls back to an in-process mutex where it's missing (tests).
 */
export function withLock<T>(name: string, action: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks) return locks.request(`lares:${name}`, action) as Promise<T>;
  let m = fallbackMutexes.get(name);
  if (!m) fallbackMutexes.set(name, (m = new Mutex()));
  return m.withLock(action);
}

async function read<T>(area: Area, key: string): Promise<T | undefined> {
  const items = await browser.storage[area].get(key);
  return items[key] as T | undefined;
}

async function write(area: Area, key: string, value: unknown): Promise<void> {
  await browser.storage[area].set({ [key]: value });
}

/** Calls [listener] with the new raw value whenever [key] changes in [area]. */
function watch(area: Area, key: string, listener: (value: unknown) => void): Unsubscribe {
  const onChanged = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName === area && key in changes) listener(changes[key]!.newValue);
  };
  browser.storage.onChanged.addListener(onChanged);
  return () => browser.storage.onChanged.removeListener(onChanged);
}

/** App state (settings, unlock state, tracked period) as one JSON value, like the Android DataStore. */
export class StorageStateStore implements StateStore {
  async current(): Promise<AppState> {
    return restoreAppState(await read('local', KEYS.appState));
  }

  update(transform: (state: AppState) => AppState): Promise<AppState> {
    return withLock(KEYS.appState, async () => {
      const before = await this.current();
      const after = transform(before);
      if (after !== before) await write('local', KEYS.appState, after);
      return after;
    });
  }

  subscribe(listener: (state: AppState) => void): Unsubscribe {
    void this.current().then(listener);
    return watch('local', KEYS.appState, (raw) => listener(restoreAppState(raw)));
  }
}

/** A list of items with numeric ids, stored under one key (rules, groups, tamper events). */
interface Table<T> {
  nextId: number;
  items: T[];
}

class TableStore<T extends { id: number }> {
  constructor(private readonly key: string) {}

  async items(): Promise<T[]> {
    return (await this.table()).items;
  }

  private async table(): Promise<Table<T>> {
    const t = await read<Table<T>>('local', this.key);
    return t && Array.isArray(t.items) ? t : { nextId: 1, items: [] };
  }

  /** Read-modify-write under a cross-context lock. */
  change<R>(transform: (table: Table<T>) => { table: Table<T>; result: R }): Promise<R> {
    return withLock(this.key, async () => {
      const { table, result } = transform(await this.table());
      await write('local', this.key, table);
      return result;
    });
  }

  insert(item: T): Promise<number> {
    return this.change((t) => {
      const id = t.nextId;
      return { table: { nextId: id + 1, items: [...t.items, { ...item, id }] }, result: id };
    });
  }

  update(item: T): Promise<void> {
    return this.change((t) => ({ table: { ...t, items: t.items.map((i) => (i.id === item.id ? item : i)) }, result: undefined }));
  }

  subscribe(listener: (items: readonly T[]) => void): Unsubscribe {
    void this.items().then(listener);
    return watch('local', this.key, (raw) => {
      const t = raw as Table<T> | undefined;
      listener(t && Array.isArray(t.items) ? t.items : []);
    });
  }
}

export class StorageRuleStore implements RuleStore {
  readonly table = new TableStore<Rule>(KEYS.rules);

  all(): Promise<Rule[]> {
    return this.table.items();
  }
  async get(id: number): Promise<Rule | null> {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }
  insert(rule: Rule): Promise<number> {
    return this.table.insert(rule);
  }
  update(rule: Rule): Promise<void> {
    return this.table.update(rule);
  }
  delete(id: number): Promise<void> {
    return this.table.change((t) => ({ table: { ...t, items: t.items.filter((r) => r.id !== id) }, result: undefined }));
  }
  subscribe(listener: (rules: readonly Rule[]) => void): Unsubscribe {
    return this.table.subscribe(listener);
  }
}

export class StorageGroupStore implements GroupStore {
  private readonly table = new TableStore<RuleGroup>(KEYS.groups);

  constructor(private readonly rules: StorageRuleStore) {}

  all(): Promise<RuleGroup[]> {
    return this.table.items();
  }
  async get(id: number): Promise<RuleGroup | null> {
    return (await this.all()).find((g) => g.id === id) ?? null;
  }
  insert(group: RuleGroup): Promise<number> {
    return this.table.insert(group);
  }
  update(group: RuleGroup): Promise<void> {
    return this.table.update(group);
  }
  async deleteWithMembers(id: number): Promise<void> {
    await this.rules.table.change((t) => ({ table: { ...t, items: t.items.filter((r) => r.groupId !== id) }, result: undefined }));
    await this.table.change((t) => ({ table: { ...t, items: t.items.filter((g) => g.id !== id) }, result: undefined }));
  }
  subscribe(listener: (groups: readonly RuleGroup[]) => void): Unsubscribe {
    return this.table.subscribe(listener);
  }
}

/** Keeps the newest events only; delivered ones are pruned first. */
const MAX_TAMPER_EVENTS = 500;

export class StorageTamperLog implements TamperLog {
  private readonly table = new TableStore<TamperEvent>(KEYS.tamperEvents);

  constructor(private readonly now: () => number = Date.now) {}

  async record(type: TamperEventType, details: string | null = null): Promise<void> {
    const event: TamperEvent = { id: 0, type, timestampMillis: this.now(), details, delivered: false };
    await this.table.change((t) => {
      let items = [...t.items, { ...event, id: t.nextId }];
      while (items.length > MAX_TAMPER_EVENTS) {
        const i = items.findIndex((e) => e.delivered);
        items = items.filter((_, j) => j !== (i >= 0 ? i : 0));
      }
      return { table: { nextId: t.nextId + 1, items }, result: undefined };
    });
  }
  async undelivered(): Promise<TamperEvent[]> {
    return (await this.table.items()).filter((e) => !e.delivered);
  }
  markDelivered(id: number): Promise<void> {
    return this.table.change((t) => ({ table: { ...t, items: t.items.map((e) => (e.id === id ? { ...e, delivered: true } : e)) }, result: undefined }));
  }
  subscribe(listener: (events: readonly TamperEvent[]) => void): Unsubscribe {
    return this.table.subscribe(listener);
  }
}

export class StorageUsageStore implements UsageStore {
  async load(): Promise<UsageSnapshot | null> {
    return (await read<UsageSnapshot>('local', KEYS.usage)) ?? null;
  }
  save(snapshot: UsageSnapshot): Promise<void> {
    return write('local', KEYS.usage, snapshot);
  }
  subscribe(listener: (usage: UsageSnapshot | null) => void): Unsubscribe {
    void this.load().then(listener);
    return watch('local', KEYS.usage, (raw) => listener((raw as UsageSnapshot | undefined) ?? null));
  }
}

/** The open counting segment lives in session storage: it survives worker suspension, not restarts. */
export class SessionSegmentStore implements SegmentStore {
  async get(): Promise<CountingSegment | null> {
    return (await read<CountingSegment>('session', KEYS.segment)) ?? null;
  }
  set(segment: CountingSegment | null): Promise<void> {
    return segment === null ? browser.storage.session.remove(KEYS.segment) : write('session', KEYS.segment, segment);
  }
}
