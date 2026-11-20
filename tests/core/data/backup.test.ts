// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { defaultAppState } from '@/core/data/appState';
import { BackupCodec, backupFile, backupGroup, backupRule } from '@/core/data/backup';
import { RuleRepository } from '@/core/data/ruleRepository';
import { UnlockGate } from '@/core/data/unlockGate';
import { FakeClock, FakeGroupStore, FakeRuleStore, FakeStateStore } from '../../testing/fakes';

describe('Backup', () => {
  const state = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x' }, settings: { setupComplete: true } }));
  const gate = new UnlockGate(state, new FakeClock());

  function newRepo(): [RuleRepository, FakeRuleStore] {
    const store = new FakeRuleStore();
    return [new RuleRepository(store, new FakeGroupStore(store), gate), store];
  }

  test('export / import round trip', async () => {
    const [source] = newRepo();
    const g = await source.createGroup('Social', 30);
    await source.add('WEBSITE', 'instagram.com', null, g);
    await source.add('WEBSITE', 'reddit.com', 15);
    await source.add('APP', 'com.instagram.android'); // phone rules survive a round trip
    const json = BackupCodec.encode(await source.exportBackup());
    expect(json.includes('passwordHash') || json.includes('secret')).toBe(false);

    const [target, targetStore] = newRepo();
    expect(await target.importBackup(BackupCodec.decode(json))).toEqual({ groupsAdded: 1, rulesAdded: 3, skipped: 0 });
    expect(new Set((await targetStore.all()).map((r) => r.target))).toEqual(new Set(['instagram.com', 'reddit.com', 'com.instagram.android']));
  });

  test('JSON matches the Android export (field names, defaults, nulls)', () => {
    const json = BackupCodec.encode(backupFile({ groups: [backupGroup('Social', { limitMinutesPerDay: 30 })], rules: [backupRule('WEBSITE', 'reddit.com', { group: 'Social' })] }));
    expect(JSON.parse(json)).toEqual({
      format: 'lares-rules',
      groups: [{ name: 'Social', limitMinutesPerDay: 30, enabled: true }],
      rules: [{ type: 'WEBSITE', target: 'reddit.com', limitMinutesPerDay: null, enabled: true, group: 'Social' }],
      guardianTotp: null,
    });
    expect(json.startsWith('{\n    "format": "lares-rules",')).toBe(true);
  });

  test('decodes an Android export with defaults omitted and unknown keys', () => {
    const android = `{"format":"lares-rules","rules":[{"type":"APP","target":"com.reddit.frontpage","extra":1},
      {"type":"WEBSITE","target":"reddit.com","limitMinutesPerDay":20,"enabled":false,"group":null}],"futureField":true}`;
    expect(BackupCodec.decode(android)).toEqual(
      backupFile({
        rules: [backupRule('APP', 'com.reddit.frontpage'), backupRule('WEBSITE', 'reddit.com', { limitMinutesPerDay: 20, enabled: false })],
      }),
    );
  });

  test('import only adds and never loosens', async () => {
    const [repo, store] = newRepo();
    const existingGroup = await repo.createGroup('Social', 10);
    await repo.add('WEBSITE', 'reddit.com'); // always blocked
    const backup = backupFile({
      groups: [backupGroup('Social', { limitMinutesPerDay: 999 })],
      rules: [
        backupRule('WEBSITE', 'reddit.com', { limitMinutesPerDay: 999 }), // already there → skipped
        backupRule('WEBSITE', 'instagram.com', { group: 'Social' }),
        backupRule('WEBSITE', 'not a url'),
      ],
    });
    expect(await repo.importBackup(backup)).toEqual({ groupsAdded: 0, rulesAdded: 1, skipped: 2 });
    expect((await store.all()).find((r) => r.target === 'reddit.com')!.limitMinutesPerDay).toBeNull(); // still always blocked
    expect((await store.all()).find((r) => r.target === 'instagram.com')!.groupId).toBe(existingGroup);
  });

  test('rejects foreign files', () => {
    expect(() => BackupCodec.decode('{"format":"something-else"}')).toThrow();
    expect(() => BackupCodec.decode('hello')).toThrow();
    expect(() => BackupCodec.decode('[]')).toThrow();
    expect(() => BackupCodec.decode('{"rules":[{"type":"PHONE","target":"x"}]}')).toThrow();
    expect(() => BackupCodec.decode('{"rules":[{"type":"WEBSITE"}]}')).toThrow();
    expect(() => BackupCodec.decode('{"rules":[{"type":"WEBSITE","target":"a.com","enabled":null}]}')).toThrow();
  });
});
