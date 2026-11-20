// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { AlertChannelRepository } from '@/core/alerts/alertChannelRepository';
import { channelDraft, emptyDraft, isDraftComplete } from '@/core/alerts/alertChannels';
import { CodeRequiredError, defaultAppState } from '@/core/data/appState';
import { UnlockGate } from '@/core/data/unlockGate';
import { TimedSession } from '@/core/policy/timedSession';
import { expectThrows, FakeCipher, FakeClock, FakeStateStore } from '../../testing/fakes';

describe('notification channels', () => {
  test('validation', () => {
    const token = '123456789:AAFabcdefghijklmnopqrstuvwxyz_-0';
    expect(isDraftComplete(channelDraft('TELEGRAM', { secret: token, address: '42' }))).toBe(true);
    expect(isDraftComplete(channelDraft('TELEGRAM', { secret: token, address: '-1001234567890' }))).toBe(true); // group chat
    expect(isDraftComplete(channelDraft('TELEGRAM', { secret: token }))).toBe(false);
    expect(isDraftComplete(channelDraft('TELEGRAM', { secret: 'not a token', address: '42' }))).toBe(false);
    expect(isDraftComplete(channelDraft('TELEGRAM', { secret: token, address: '@someone' }))).toBe(false);
    expect(isDraftComplete({ ...emptyDraft('NTFY', 'en'), address: 'lares-xyz' })).toBe(true);
    expect(isDraftComplete(channelDraft('NTFY', { server: 'http://ntfy.sh', address: 't' }))).toBe(false); // no plain HTTP
    expect(isDraftComplete(channelDraft('WEBHOOK', { server: 'https://example.org/hook' }))).toBe(true);
    expect(isDraftComplete(channelDraft('WEBHOOK', { server: 'https://@' }))).toBe(false);
    expect(isDraftComplete(channelDraft('WEBHOOK', { server: 'https://example.org/a b' }))).toBe(false);
    expect(isDraftComplete(channelDraft('MATRIX', { server: 'https://matrix.org', address: '!room:matrix.org', secret: 'tok' }))).toBe(true);
    expect(isDraftComplete(channelDraft('MATRIX', { server: 'https://matrix.org', address: '#alias:matrix.org', secret: 'tok' }))).toBe(false);
    expect(isDraftComplete(channelDraft('WEBHOOK', { server: 'https://example.org/hook', secret: 'a\u0000b' }))).toBe(false);
  });

  test('adding is free, changing needs the code, tokens are encrypted', async () => {
    const clock = new FakeClock();
    const state = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x' }, settings: { setupComplete: true } }));
    const repo = new AlertChannelRepository(state, new UnlockGate(state, clock), new FakeCipher());
    const secret = '123456789:AAFsecretsecretsecretsecret';
    const draft = channelDraft('TELEGRAM', { language: 'de', address: ' 42 ', secret });
    const id = await repo.add(draft);
    const stored = (await repo.get(id))!;
    expect(stored.address).toBe('42');
    expect(stored.secretEncrypted).not.toBe(secret);
    expect((await repo.draftOf(stored)).secret).toBe(secret);

    await expectThrows(() => repo.update(id, { ...draft, address: '43' }), CodeRequiredError);
    await expectThrows(() => repo.remove(id), CodeRequiredError);

    await state.update((s) => ({ ...s, unlock: { ...s.unlock, unlockedSession: TimedSession.start(60_000, clock) } }));
    await repo.update(id, { ...draft, address: '43' });
    expect((await repo.get(id))!.address).toBe('43');
    await repo.remove(id);
    expect((await state.current()).settings.alertChannels).toEqual([]);
  });
});
