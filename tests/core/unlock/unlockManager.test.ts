// SPDX-License-Identifier: GPL-3.0-or-later
import { beforeEach, describe, expect, test } from 'vitest';
import { CodeRequiredError, defaultAppState } from '@/core/data/appState';
import { Base32 } from '@/core/unlock/base32';
import { PasswordHasher } from '@/core/unlock/passwordHasher';
import { RecoveryCode } from '@/core/unlock/recoveryCode';
import { Totp } from '@/core/unlock/totp';
import { TotpTransfer } from '@/core/unlock/totpTransfer';
import { UnlockManager } from '@/core/unlock/unlockManager';
import { expectThrows, FakeCipher, FakeClock, FakeStateStore, FakeTamperLog } from '../../testing/fakes';

const UNLOCKED = UnlockManager.UNLOCKED_DURATION_MILLIS;
const success = (viaRecoveryCode = false) => ({ kind: 'success', viaRecoveryCode });

describe('UnlockManager', () => {
  let clock: FakeClock;
  let store: FakeStateStore;
  let tamper: FakeTamperLog;
  let manager: UnlockManager;

  beforeEach(() => {
    clock = new FakeClock();
    store = new FakeStateStore();
    tamper = new FakeTamperLog();
    manager = new UnlockManager(store, clock, new FakeCipher(), tamper, new PasswordHasher(1_000));
  });

  /** First setup including confirming the recovery code, then locked (ends the first unlocked mode). */
  async function setUp(password = 'hunter22'): Promise<string> {
    const recovery = await manager.setupPassword(password);
    await manager.completeSetup();
    await manager.lock();
    return recovery;
  }

  async function assertUnlocks(code: string, viaRecovery = false): Promise<void> {
    expect(await manager.unlock(code)).toEqual(success(viaRecovery));
    expect(await manager.isUnlocked()).toBe(true);
  }

  const current = () => store.current();

  test('not set up until configured', async () => {
    expect(await manager.unlock('anything')).toEqual({ kind: 'notSetUp' });
  });

  test('correct code unlocks for ten minutes', async () => {
    await setUp();
    expect(await manager.isUnlocked()).toBe(false);
    expect((await manager.unlock('hunter23')).kind).toBe('wrong');
    expect(await manager.isUnlocked()).toBe(false);

    await assertUnlocks('hunter22');
    clock.advance(UNLOCKED - 1);
    expect(await manager.isUnlocked()).toBe(true);
    clock.advance(1);
    expect(await manager.isUnlocked()).toBe(false);
  });

  test('interrupted first setup can be repeated', async () => {
    await manager.setupPassword('first1'); // app closed before the recovery code was confirmed
    expect((await current()).settings.setupComplete).toBe(false);
    expect(await manager.canChangeMethod()).toBe(true);
    await manager.setupPassword('second2');
    await manager.completeSetup();
    expect((await current()).settings.setupComplete).toBe(true);
    await manager.lock();
    expect(await manager.canChangeMethod()).toBe(false);
    expect((await manager.unlock('second2')).kind).toBe('success');
  });

  test('first setup ends in unlocked mode', async () => {
    await manager.setupPassword('hunter22');
    await manager.completeSetup();
    expect(await manager.isUnlocked()).toBe(true);
    clock.advance(UNLOCKED);
    expect(await manager.isUnlocked()).toBe(false);
    // Changing the code later doesn't start a new unlocked mode by itself …
    await assertUnlocks('hunter22');
    clock.advance(UNLOCKED - 1_000);
    await manager.setupPassword('changed1');
    await manager.completeSetup();
    clock.advance(1_000);
    expect(await manager.isUnlocked()).toBe(false);
    // … and finishing it after the unlocked mode ran out needs the code again.
    await manager.unlock('changed1');
    await manager.setupPassword('changed2');
    clock.advance(UNLOCKED);
    await expectThrows(() => manager.completeSetup(), CodeRequiredError);
  });

  test('lock ends unlocked mode immediately', async () => {
    await setUp();
    await assertUnlocks('hunter22');
    await manager.lock();
    expect(await manager.isUnlocked()).toBe(false);
  });

  test('changing the method needs unlocked mode', async () => {
    await setUp();
    expect(await manager.canChangeMethod()).toBe(false);
    await expectThrows(() => manager.setupPassword('other1'), CodeRequiredError);
    await assertUnlocks('hunter22');
    await manager.setupPassword('other1');
    expect((await manager.unlock('other1')).kind).toBe('success');
  });

  test('backoff after repeated failures', async () => {
    await setUp();
    expect(await manager.unlock('nope')).toEqual({ kind: 'wrong', attemptsLeft: 2, lockoutMillis: 0 });
    expect(await manager.unlock('nope')).toEqual({ kind: 'wrong', attemptsLeft: 1, lockoutMillis: 0 });
    // The 3rd wrong code starts the waiting time.
    expect(await manager.unlock('nope')).toEqual({ kind: 'wrong', attemptsLeft: 0, lockoutMillis: 60_000 });
    expect(tamper.recorded).toEqual(['REPEATED_WRONG_CODE']);
    expect(tamper.events[0]!.details).toBe('failures=3');

    // Even the correct code is refused while locked out.
    expect((await manager.unlock('hunter22')).kind).toBe('lockedOut');
    // A restart doesn't skip the waiting time – it starts over in full.
    clock.advance(50_000);
    clock.boot = 2;
    clock.elapsed = 0;
    expect(await manager.unlock('hunter22')).toEqual({ kind: 'lockedOut', remainingMillis: 60_000 });

    clock.advance(60_000);
    await assertUnlocks('hunter22');
    expect((await current()).unlock.failedAttempts).toBe(0);
  });

  test('unlocked mode and pause end on restart', async () => {
    await setUp();
    await assertUnlocks('hunter22');
    await manager.startPause(60 * 60_000);
    clock.boot = 2;
    clock.elapsed = 0;
    clock.wall -= 3_600_000; // setting the clock back after the restart doesn't help either
    expect(await manager.isUnlocked()).toBe(false);
    expect(await manager.isPauseActive()).toBe(false);
  });

  test('re-setup after recovery needs unlocked mode', async () => {
    const recovery = await setUp();
    await assertUnlocks(recovery, true);
    expect(await manager.canChangeMethod()).toBe(true);
    clock.advance(UNLOCKED); // guardian walked away
    expect(await manager.canChangeMethod()).toBe(false);
    await expectThrows(() => manager.setupPassword('owner1'), CodeRequiredError);
  });

  test('recovery code unlocks and forces re-setup', async () => {
    const recovery = await setUp();
    expect((await current()).unlock.recoveryHash!.startsWith('sha256$')).toBe(true); // fast hash
    await assertUnlocks(recovery.toLowerCase(), true);
    expect((await current()).unlock.reSetupRequired).toBe(true);
    expect(tamper.recorded).toEqual(['RECOVERY_CODE_USED']);
    expect(await manager.canChangeMethod()).toBe(true);

    const newRecovery = await manager.setupPassword('fresh-pass');
    // Stays in re-setup until the new recovery code has been shown and confirmed.
    expect((await current()).unlock.reSetupRequired).toBe(true);
    await manager.completeSetup();
    expect((await current()).unlock.reSetupRequired).toBe(false);
    // The old recovery code is no longer valid.
    expect((await manager.unlock(recovery)).kind).toBe('wrong');
    await assertUnlocks(newRecovery, true);
  });

  test('recovery hash made by the Android app (salted SHA-256) is accepted', async () => {
    const androidHash = 'sha256$AAECAwQFBgcICQoLDA0ODw$jawt3Z00lydBBdQKm/vaItgewbu9ON7sNV4+ejI88RU';
    store = new FakeStateStore(defaultAppState({ unlock: { method: 'PASSWORD', passwordHash: 'x', recoveryHash: androidHash }, settings: { setupComplete: true } }));
    manager = new UnlockManager(store, clock, new FakeCipher(), tamper, new PasswordHasher(1_000));
    expect((await manager.unlock('01234-56789-01234-56789')).kind).toBe('success');
  });

  test('TOTP setup needs confirmation and rejects replay', async () => {
    const setup = manager.beginTotpSetup('Phone');
    expect(setup.provisioningUri.startsWith('otpauth://totp/Lares:Phone?secret=' + setup.secretBase32)).toBe(true);
    const secret = Base32.decode(setup.secretBase32);
    const now = await Totp.code(secret, Totp.counterAt(clock.wall));

    expect(await manager.confirmTotpSetup(setup, now === '000000' ? '111111' : '000000')).toBeNull();
    expect((await current()).unlock.method).toBeNull();

    expect(await manager.confirmTotpSetup(setup, now)).not.toBeNull();
    expect((await current()).unlock.method).toBe('TOTP');

    // The code used for setup can't be reused.
    expect((await manager.unlock(now)).kind).toBe('wrong');
    clock.advance(30_000);
    const next = await Totp.code(secret, Totp.counterAt(clock.wall));
    await assertUnlocks(next);
    await manager.lock();
    expect((await manager.unlock(next)).kind).toBe('wrong'); // replay
  });

  test('pause only while unlocked and outlives locking', async () => {
    await setUp();
    await expectThrows(() => manager.startPause(60_000), CodeRequiredError);
    await assertUnlocks('hunter22');
    await manager.startPause(60 * 60_000);
    await manager.lock();
    expect(await manager.isPauseActive()).toBe(true); // the pause keeps running after locking
    await manager.endPause(); // ending early is always allowed
    expect(await manager.isPauseActive()).toBe(false);
  });

  test('expired lockout is forgotten so a restart does not restart it', async () => {
    await setUp();
    for (let i = 0; i < 3; i++) await manager.unlock('wrong-code');
    expect((await manager.unlock('hunter22')).kind).toBe('lockedOut');
    clock.advance(24 * 3_600_000); // ran out
    await manager.clearExpiredLockout(); // the blocking loop notices it in this session
    clock.boot++;
    clock.elapsed = 1_000;
    expect((await manager.unlock('hunter22')).kind).toBe('success');
  });

  test('TOTP code cannot be replayed by setting the clock back', async () => {
    const setup = manager.beginTotpSetup('Phone');
    const secret = Base32.decode(setup.secretBase32);
    await manager.confirmTotpSetup(setup, await Totp.code(secret, Totp.counterAt(clock.wall)));
    await manager.completeSetup();
    await manager.lock();
    // A code from now, saved but not used …
    const saved = await Totp.code(secret, Totp.counterAt(clock.wall) + 2);
    clock.advance(60 * 60_000);
    expect((await manager.unlock('000000')).kind).not.toBe('success'); // an attempt an hour later is seen
    // … then the clock is set back to when the code was valid.
    clock.wall -= 60 * 60_000 - 60_000;
    expect((await manager.unlock(saved)).kind).not.toBe('success');
  });

  test('TOTP moves to another device with the recovery code', async () => {
    const setup = manager.beginTotpSetup('Phone');
    const secret = Base32.decode(setup.secretBase32);
    const recovery = (await manager.confirmTotpSetup(setup, await Totp.code(secret, Totp.counterAt(clock.wall))))!;
    await manager.completeSetup();
    const sealed = (await current()).unlock.totpTransfer!;
    expect(await TotpTransfer.open(sealed, RecoveryCode.normalize(RecoveryCode.generate())!)).toBeNull(); // other code: nothing

    // New device, first setup.
    const newStore = new FakeStateStore();
    const other = new UnlockManager(newStore, clock, new FakeCipher(), new FakeTamperLog(), new PasswordHasher(1_000));
    expect(await other.restoreTotp(sealed, 'hunter22')).toBe('NotARecoveryCode');
    expect(await other.restoreTotp(sealed, RecoveryCode.generate())).toBe('WrongCode');
    expect(await other.restoreTotp(sealed, recovery.toLowerCase())).toBe('Restored');
    await other.completeSetup();
    await other.lock();
    // The same authenticator app works – and so does the same recovery code.
    clock.advance(60_000);
    expect((await other.unlock(await Totp.code(secret, Totp.counterAt(clock.wall)))).kind).toBe('success');
    await other.lock();
    expect(await other.unlock(recovery)).toEqual(success(true));
  });

  test('using the recovery code removes the transfer package', async () => {
    const setup = manager.beginTotpSetup('Phone');
    const secret = Base32.decode(setup.secretBase32);
    const recovery = (await manager.confirmTotpSetup(setup, await Totp.code(secret, Totp.counterAt(clock.wall))))!;
    await manager.completeSetup();
    await manager.lock();
    expect(await manager.unlock(recovery)).toEqual(success(true));
    expect((await current()).unlock.totpTransfer).toBeNull();
  });

  test('passwords have no transfer package', async () => {
    await setUp();
    expect((await current()).unlock.totpTransfer).toBeNull();
  });

  test('concurrent unlock attempts are serialized', async () => {
    await setUp();
    const results = await Promise.all([manager.unlock('a1'), manager.unlock('a2'), manager.unlock('a3')]);
    expect(results.map((r) => (r.kind === 'wrong' ? r.attemptsLeft : -1))).toEqual([2, 1, 0]);
  });
});
