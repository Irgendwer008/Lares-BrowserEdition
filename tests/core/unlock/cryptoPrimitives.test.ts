// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { AttemptPolicy } from '@/core/unlock/attemptPolicy';
import { Base32 } from '@/core/unlock/base32';
import { base64Decode, base64Encode, utf8, type RandomSource } from '@/core/unlock/bytes';
import { derive, PasswordHasher } from '@/core/unlock/passwordHasher';
import { RecoveryCode } from '@/core/unlock/recoveryCode';
import { Totp } from '@/core/unlock/totp';
import { TotpTransfer } from '@/core/unlock/totpTransfer';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
/** Deterministic "random": 0, 1, 2, … */
const counting: RandomSource = (n) => Uint8Array.from({ length: n }, (_, i) => i);

describe('TOTP', () => {
  // RFC 6238 appendix B, SHA-1 secret "12345678901234567890".
  const rfcSecret = utf8('12345678901234567890');

  test('matches the RFC 6238 test vectors (SHA-1)', async () => {
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, expected] of vectors) {
      expect(await Totp.code(rfcSecret, Totp.counterAt(seconds * 1000), 8)).toBe(expected);
    }
    expect(await Totp.code(rfcSecret, Totp.counterAt(59_000))).toBe('287082');
  });

  test('verify accepts drift and rejects replay', async () => {
    const now = 1_234_567_890_000;
    const counter = Totp.counterAt(now);
    const previous = await Totp.code(rfcSecret, counter - 1);
    expect(await Totp.verify(rfcSecret, previous, now, Number.MIN_SAFE_INTEGER)).toBe(counter - 1);
    expect(await Totp.verify(rfcSecret, previous, now, counter - 1)).toBeNull(); // replay
    expect(await Totp.verify(rfcSecret, await Totp.code(rfcSecret, counter - 2), now, Number.MIN_SAFE_INTEGER)).toBeNull(); // too old
    const current = await Totp.code(rfcSecret, counter);
    expect(await Totp.verify(rfcSecret, `${current.slice(0, 3)} ${current.slice(3)}`, now, Number.MIN_SAFE_INTEGER)).toBe(counter);
    expect(await Totp.verify(rfcSecret, 'abc123', now, Number.MIN_SAFE_INTEGER)).toBeNull();
  });

  test('provisioning URI', () => {
    expect(Totp.provisioningUri(rfcSecret, "Anna's phone")).toBe(
      'otpauth://totp/Lares:Anna%27s%20phone?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Lares&algorithm=SHA1&digits=6&period=30',
    );
    // Same encoding as java.net.URLEncoder (checked against the JDK).
    expect(Totp.provisioningUri(rfcSecret, "Anna's ~phone! (x)*é", 'X')).toContain('X:Anna%27s%20%7Ephone%21%20%28x%29*%C3%A9?');
  });
});

describe('Base32 / Base64', () => {
  test('Base32 round trip and RFC 4648 vectors', () => {
    expect(Base32.encode(utf8('foobar'))).toBe('MZXW6YTBOI');
    expect(Base32.encode(utf8('f'))).toBe('MY');
    expect(Base32.decode('mzxw6ytboi======')).toEqual(utf8('foobar'));
    const random = Uint8Array.from({ length: 37 }, (_, i) => (i * 31 + 7) & 0xff);
    expect(Base32.decode(Base32.encode(random))).toEqual(random);
    expect(() => Base32.decode('1!')).toThrow();
  });

  test('Base64 like java.util.Base64', () => {
    expect(base64Encode(utf8('foobar'))).toBe('Zm9vYmFy');
    expect(base64Encode(utf8('fooba'))).toBe('Zm9vYmE=');
    expect(base64Encode(utf8('foob'), false)).toBe('Zm9vYg');
    expect(base64Decode('Zm9vYg')).toEqual(utf8('foob'));
    expect(base64Decode('Zm9vYg==')).toEqual(utf8('foob'));
    expect(base64Decode('Zm9v Yg')).toBeNull();
    expect(base64Decode('Zm9vY')).toBeNull();
    expect(base64Decode('Zm9vYg=')).toBeNull();
  });
});

describe('PasswordHasher', () => {
  test('PBKDF2-HMAC-SHA256 known answers', async () => {
    expect(hex(await derive('password', utf8('salt'), 1))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(hex(await derive('password', utf8('salt'), 4096))).toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
  });

  test('verifies a hash made by the JDK (Android format, 310k iterations, UTF-8 password)', async () => {
    const fromAndroid = 'pbkdf2-sha256$310000$AAECAwQFBgcICQoLDA0ODw$EX7N01f2z1vcEjXik+nKHq3FutYX8Y0xqKF/cszcFo0';
    const hasher = new PasswordHasher();
    expect(await hasher.verify('correct horse ✓', fromAndroid)).toBe(true);
    expect(await hasher.verify('correct horse', fromAndroid)).toBe(false);
    expect(await new PasswordHasher(310_000, counting).hash('correct horse ✓')).toBe(fromAndroid);
  });

  test('hashing', async () => {
    const hasher = new PasswordHasher(1_000);
    const hash = await hasher.hash('correct horse');
    expect(hash.startsWith('pbkdf2-sha256$1000$')).toBe(true);
    expect(await hasher.verify('correct horse', hash)).toBe(true);
    expect(await hasher.verify('correct horsE', hash)).toBe(false);
    expect(await hasher.hash('correct horse')).not.toBe(hash); // salted
    expect(await hasher.verify('x', 'garbage')).toBe(false);
    expect(await hasher.verify('x', 'pbkdf2-sha256$0$AA$AA')).toBe(false);
    expect(PasswordHasher.DEFAULT_ITERATIONS).toBe(310_000);
  });
});

describe('RecoveryCode', () => {
  test('format and normalization', () => {
    const code = RecoveryCode.generate();
    expect(code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const canonical = RecoveryCode.normalize(code)!;
    expect(canonical.length).toBe(20);
    expect(RecoveryCode.normalize(code.toLowerCase().replaceAll('-', ' '))).toBe(canonical);
    expect(RecoveryCode.normalize('oIlL0-abcde-01234-56789')).toBe('01110ABCDE0123456789');
    expect(RecoveryCode.normalize('too-short')).toBeNull();
    expect(RecoveryCode.normalize('UUUUU-UUUUU-UUUUU-UUUUU')).toBeNull(); // U is not in the alphabet
  });
});

describe('TotpTransfer', () => {
  const secret = Uint8Array.from({ length: 20 }, (_, i) => 100 + i);
  const fromAndroid = 'lares-totp-v1$AAECAwQFBgcICQoLDA0ODw==$AAECAwQFBgcICQoL$BEyTxvhn33lXigmPmd+hsqYSlETvdWlrvU6fcSly/0sZm4HW';

  test('byte-compatible with the JDK implementation', async () => {
    expect(await TotpTransfer.seal(secret, 'ABCDEFGHJKMNPQRSTVWX', counting)).toBe(fromAndroid);
    expect(await TotpTransfer.open(fromAndroid, 'ABCDEFGHJKMNPQRSTVWX')).toEqual(secret);
  });

  test('wrong code or damaged package gives null', async () => {
    expect(await TotpTransfer.open(fromAndroid, 'ABCDEFGHJKMNPQRSTVWY')).toBeNull();
    expect(await TotpTransfer.open(fromAndroid.slice(0, -4), 'ABCDEFGHJKMNPQRSTVWX')).toBeNull();
    expect(await TotpTransfer.open('garbage', 'ABCDEFGHJKMNPQRSTVWX')).toBeNull();
    expect(TotpTransfer.isPackage(fromAndroid)).toBe(true);
    expect(TotpTransfer.isPackage('lares-totp-v1$a$b')).toBe(false);
    expect(TotpTransfer.isPackage(null)).toBe(false);
  });
});

test('AttemptPolicy', () => {
  // The 3rd wrong code in a row starts the first waiting time, then it doubles.
  expect([1, 2, 3, 4, 5].map(AttemptPolicy.lockoutMillisAfter)).toEqual([0, 0, 60_000, 120_000, 240_000]);
  expect(AttemptPolicy.lockoutMillisAfter(100)).toBe(AttemptPolicy.MAX_LOCKOUT_MILLIS);
  expect([1, 2, 3, 4].map(AttemptPolicy.attemptsLeft)).toEqual([2, 1, 0, 0]);
  expect(Array.from({ length: 15 }, (_, i) => i + 1).filter(AttemptPolicy.shouldReport)).toEqual([3, 8, 13]);
});
