// SPDX-License-Identifier: GPL-3.0-or-later
import { CodeRequiredError, isSetUp, NO_COUNTER, type SecretCipher, type StateStore, type UnlockState } from '../data/appState';
import type { TamperLog } from '../data/tamperLog';
import { TimedSession } from '../policy/timedSession';
import type { Clock } from '../time/clock';
import { AttemptPolicy } from './attemptPolicy';
import { Base32 } from './base32';
import { base64Decode, base64Encode, constantTimeEquals, secureRandom, sha256, utf8, type Bytes, type RandomSource } from './bytes';
import { Mutex } from './mutex';
import { PasswordHasher } from './passwordHasher';
import { RecoveryCode } from './recoveryCode';
import { Totp } from './totp';
import { TotpTransfer } from './totpTransfer';

/** Result of [UnlockManager.restoreTotp]. */
export type RestoreResult = 'Restored' | 'NotARecoveryCode' | 'WrongCode';

export type VerifyResult =
  /** Correct code; the app is now unlocked for UNLOCKED_DURATION_MILLIS. */
  | { readonly kind: 'success'; readonly viaRecoveryCode: boolean }
  /** `attemptsLeft` before a wrong code starts a waiting time; `lockoutMillis` > 0 if one started. */
  | { readonly kind: 'wrong'; readonly attemptsLeft: number; readonly lockoutMillis: number }
  | { readonly kind: 'lockedOut'; readonly remainingMillis: number }
  | { readonly kind: 'notSetUp' };

/** Result of [UnlockManager.beginTotpSetup]; nothing is stored until the guardian confirms a code. */
export class TotpSetup {
  constructor(
    /** Only for UnlockManager.confirmTotpSetup – don't persist or display. */
    readonly secret: Bytes,
    readonly provisioningUri: string,
  ) {}

  get secretBase32(): string {
    return Base32.encode(this.secret);
  }
}

const MIN_PASSWORD_LENGTH = 4;
const UNLOCKED_DURATION_MILLIS = 10 * 60_000;
const MAX_PAUSE_MILLIS = 365 * 24 * 60 * 60_000;
const TOTP_WINDOW = 1;
const RECOVERY_PREFIX = 'sha256';

/**
 * Verifies the guardian code (password / TOTP / recovery code) with brute-force protection.
 * A correct code switches the app into **unlocked mode** for a limited time, in which every
 * change is allowed (including starting a pause). See docs/unlock-and-security.md.
 */
export class UnlockManager {
  static readonly MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;
  static readonly UNLOCKED_DURATION_MILLIS = UNLOCKED_DURATION_MILLIS;
  static readonly MAX_PAUSE_MILLIS = MAX_PAUSE_MILLIS;

  private readonly mutex = new Mutex();

  constructor(
    private readonly store: StateStore,
    private readonly clock: Clock,
    private readonly cipher: SecretCipher,
    private readonly tamperLog: TamperLog,
    private readonly hasher: PasswordHasher = new PasswordHasher(),
    private readonly random: RandomSource = secureRandom,
  ) {}

  // ---- Setup ---------------------------------------------------------------------------------

  /**
   * Allowed during first setup (until [completeSetup] – also if the app was closed in between)
   * or while unlocked (changing the method is loosening). After the recovery code was used, the
   * recovery itself opened unlocked mode; if that ran out, the code has to be entered again.
   */
  async canChangeMethod(): Promise<boolean> {
    const s = await this.store.current();
    return !isSetUp(s.unlock) || !s.settings.setupComplete || this.isUnlockedState(s.unlock);
  }

  /** Sets a static password. @return the new recovery code (show once). */
  async setupPassword(password: string): Promise<string> {
    if (password.length < MIN_PASSWORD_LENGTH) throw new RangeError('password too short');
    if (!(await this.canChangeMethod())) throw new CodeRequiredError();
    const passwordHash = await this.hasher.hash(password);
    return this.storeNewMethod(null, (u) => ({ ...u, method: 'PASSWORD', passwordHash, totpSecretEncrypted: null }));
  }

  beginTotpSetup(account: string): TotpSetup {
    const secret = this.random(Totp.SECRET_BYTES);
    return new TotpSetup(secret, Totp.provisioningUri(secret, account));
  }

  /**
   * Stores the TOTP secret once the guardian proves the authenticator app works.
   * @return the new recovery code, or null if [code] was wrong.
   */
  async confirmTotpSetup(setup: TotpSetup, code: string): Promise<string | null> {
    if (!(await this.canChangeMethod())) throw new CodeRequiredError();
    const counter = await Totp.verify(setup.secret, code, this.clock.wallMillis(), NO_COUNTER);
    if (counter === null) return null;
    const encrypted = await this.cipher.encrypt(setup.secret);
    return this.storeNewMethod(
      (recovery) => TotpTransfer.seal(setup.secret, recovery, this.random),
      (u) => ({ ...u, method: 'TOTP', totpSecretEncrypted: encrypted, totpLastCounter: counter, passwordHash: null }),
    );
  }

  /**
   * Takes over the authenticator code of another device from a rules export (TotpTransfer):
   * same TOTP secret and the same recovery code (the one entered). Like setting up a new code,
   * only during the first setup or while unlocked. The caller then calls [completeSetup].
   */
  async restoreTotp(sealed: string, recoveryInput: string): Promise<RestoreResult> {
    if (!(await this.canChangeMethod())) throw new CodeRequiredError();
    const canonical = RecoveryCode.normalize(recoveryInput);
    if (canonical === null) return 'NotARecoveryCode';
    const secret = await TotpTransfer.open(sealed, canonical);
    if (secret === null || secret.length !== Totp.SECRET_BYTES) return 'WrongCode';
    const encrypted = await this.cipher.encrypt(secret);
    const recoveryHash = await this.hashRecovery(canonical);
    await this.store.update((s) => ({
      ...s,
      unlock: {
        ...s.unlock,
        method: 'TOTP',
        totpSecretEncrypted: encrypted,
        passwordHash: null,
        totpLastCounter: NO_COUNTER,
        recoveryHash,
        totpTransfer: sealed, // can be exported again
        failedAttempts: 0,
        lockout: null,
      },
    }));
    return 'Restored';
  }

  /**
   * Stores the new method and recovery code. "Setup complete" / "re-setup required" are left
   * untouched until [completeSetup], so the screen showing the new recovery code stays open.
   */
  private async storeNewMethod(transfer: ((canonical: string) => Promise<string>) | null, apply: (u: UnlockState) => UnlockState): Promise<string> {
    const recovery = RecoveryCode.generate(this.random);
    const canonical = RecoveryCode.normalize(recovery)!;
    const recoveryHash = await this.hashRecovery(canonical);
    // TOTP: the package for moving it to another device, while the recovery code is known.
    const totpTransfer = transfer ? await transfer(canonical) : null;
    await this.store.update((s) => ({
      ...s,
      unlock: { ...apply(s.unlock), recoveryHash, totpTransfer, failedAttempts: 0, lockout: null },
    }));
    return recovery;
  }

  /**
   * Called once the guardian confirmed storing the recovery code (first setup, recovery, change).
   * The first setup ends in unlocked mode, so the first rules can be set up (and corrected)
   * without entering the code right away; recovery and change keep the running unlocked mode.
   */
  async completeSetup(): Promise<void> {
    if (!isSetUp((await this.store.current()).unlock)) throw new Error('no unlock method set up');
    if (!(await this.canChangeMethod())) throw new CodeRequiredError();
    await this.store.update((s) => {
      const first = !s.settings.setupComplete;
      return {
        ...s,
        unlock: {
          ...s.unlock,
          reSetupRequired: false,
          unlockedSession: first ? TimedSession.start(UNLOCKED_DURATION_MILLIS, this.clock) : s.unlock.unlockedSession,
        },
        settings: { ...s.settings, setupComplete: true },
      };
    });
  }

  // ---- Unlocking -----------------------------------------------------------------------------

  /** Checks the code; on success the app is unlocked for UNLOCKED_DURATION_MILLIS (ends on restart). */
  unlock(input: string): Promise<VerifyResult> {
    return this.mutex.withLock(() => this.unlockLocked(input));
  }

  private async unlockLocked(input: string): Promise<VerifyResult> {
    const clock = this.clock;
    const unlock = (await this.store.current()).unlock;
    if (!isSetUp(unlock)) return { kind: 'notSetUp' };
    let lockout = unlock.lockout;
    if (lockout !== null && TimedSession.isFromEarlierBoot(lockout, clock)) {
      // Restarted browser: the waiting time starts over (there's no trustworthy clock across restarts).
      const restarted = TimedSession.restarted(lockout, clock);
      lockout = restarted;
      await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, lockout: restarted } }));
    }
    // Highest TOTP time step seen so far (also while locked out): codes from before can't be
    // replayed later by setting the clock back.
    const counterNow = Totp.counterAt(clock.wallMillis());
    if (counterNow > unlock.totpMaxSeenCounter) {
      await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, totpMaxSeenCounter: counterNow } }));
    }
    const maxSeen = Math.max(counterNow, unlock.totpMaxSeenCounter);
    if (lockout !== null && TimedSession.isActive(lockout, clock)) {
      return { kind: 'lockedOut', remainingMillis: TimedSession.remainingMillis(lockout, clock) };
    }
    if (lockout !== null) {
      // Ran out in this boot: forget it, so a later restart doesn't restart it (failures stay).
      await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, lockout: null } }));
    }

    let matchedTotpCounter: number | null = null;
    let primaryOk = false;
    if (unlock.method === 'PASSWORD') {
      primaryOk = unlock.passwordHash !== null && (await this.hasher.verify(input, unlock.passwordHash));
    } else if (unlock.method === 'TOTP' && unlock.totpSecretEncrypted !== null) {
      let secret: Uint8Array | null = null;
      try {
        secret = await this.cipher.decrypt(unlock.totpSecretEncrypted);
      } catch {
        secret = null;
      }
      // Not older than the verification window around the highest step ever seen.
      const floor = Math.max(unlock.totpLastCounter, maxSeen - TOTP_WINDOW - 1);
      if (secret !== null) matchedTotpCounter = await Totp.verify(secret, input, clock.wallMillis(), floor, TOTP_WINDOW);
      primaryOk = matchedTotpCounter !== null;
    }
    let recoveryOk = false;
    if (!primaryOk) {
      const normalized = RecoveryCode.normalize(input);
      recoveryOk = normalized !== null && unlock.recoveryHash !== null && (await this.verifyRecovery(normalized, unlock.recoveryHash));
    }

    if (primaryOk || recoveryOk) {
      const session = TimedSession.start(UNLOCKED_DURATION_MILLIS, clock);
      await this.store.update((s) => ({
        ...s,
        unlock: {
          ...s.unlock,
          failedAttempts: 0,
          lockout: null,
          totpLastCounter: matchedTotpCounter ?? s.unlock.totpLastCounter,
          reSetupRequired: s.unlock.reSetupRequired || recoveryOk,
          // The recovery code is known now (it was typed): its package can't stay exportable.
          totpTransfer: recoveryOk ? null : s.unlock.totpTransfer,
          unlockedSession: session,
        },
      }));
      if (recoveryOk) await this.tamperLog.record('RECOVERY_CODE_USED');
      return { kind: 'success', viaRecoveryCode: recoveryOk };
    }

    const failures = unlock.failedAttempts + 1;
    const lockoutMillis = AttemptPolicy.lockoutMillisAfter(failures);
    await this.store.update((s) => ({
      ...s,
      unlock: {
        ...s.unlock,
        failedAttempts: failures,
        lockout: lockoutMillis > 0 ? TimedSession.start(lockoutMillis, clock, 'RESTART') : null,
      },
    }));
    if (AttemptPolicy.shouldReport(failures)) await this.tamperLog.record('REPEATED_WRONG_CODE', `failures=${failures}`);
    return { kind: 'wrong', attemptsLeft: AttemptPolicy.attemptsLeft(failures), lockoutMillis };
  }

  /**
   * Forgets a lockout that ran out in this boot, so a later restart doesn't restart it (the
   * failure count stays, so the doubling continues). Called regularly by the blocking loop.
   */
  clearExpiredLockout(): Promise<void> {
    return this.mutex.withLock(async () => {
      const lockout = (await this.store.current()).unlock.lockout;
      if (lockout === null) return;
      if (!TimedSession.isFromEarlierBoot(lockout, this.clock) && !TimedSession.isActive(lockout, this.clock)) {
        await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, lockout: null } }));
      }
    });
  }

  /** Back to restricted mode (no code needed – it's tightening). */
  async lock(): Promise<void> {
    await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, unlockedSession: null } }));
  }

  async isUnlocked(): Promise<boolean> {
    return this.isUnlockedState((await this.store.current()).unlock);
  }

  private isUnlockedState(unlock: UnlockState): boolean {
    return TimedSession.isActive(unlock.unlockedSession, this.clock);
  }

  // ---- Pause ---------------------------------------------------------------------------------

  /** Suspends all blocking for [durationMillis] (no maximum; ends on browser restart). Only while unlocked. */
  async startPause(durationMillis: number): Promise<void> {
    if (!(await this.isUnlocked())) throw new CodeRequiredError();
    // "No maximum" – but never so long that the end overflows.
    const session = TimedSession.start(Math.min(Math.max(durationMillis, 1), MAX_PAUSE_MILLIS), this.clock);
    await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, pause: session } }));
  }

  /** Ending early is tightening, so no code needed. */
  async endPause(): Promise<void> {
    await this.store.update((s) => ({ ...s, unlock: { ...s.unlock, pause: null } }));
  }

  async isPauseActive(): Promise<boolean> {
    return TimedSession.isActive((await this.store.current()).unlock.pause, this.clock);
  }

  // ---- Recovery code hashing -----------------------------------------------------------------

  /**
   * The recovery code has 100 random bits, so brute force is impossible even with a fast hash.
   * Salted SHA-256 keeps setup and unlock quick (no second slow PBKDF2 run).
   * Format `sha256$<salt b64>$<hash b64>` (no padding), same as Android.
   */
  private async hashRecovery(canonical: string): Promise<string> {
    const salt = this.random(16);
    return `${RECOVERY_PREFIX}$${base64Encode(salt, false)}$${base64Encode(await sha256(salt, utf8(canonical)), false)}`;
  }

  private async verifyRecovery(canonical: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 3 || parts[0] !== RECOVERY_PREFIX) return false;
    const salt = base64Decode(parts[1]!);
    const expected = base64Decode(parts[2]!);
    if (salt === null || expected === null) return false;
    return constantTimeEquals(await sha256(salt, utf8(canonical)), expected);
  }
}
