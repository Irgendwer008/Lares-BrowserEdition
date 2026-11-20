// SPDX-License-Identifier: GPL-3.0-or-later
import { base64Decode, base64Encode, constantTimeEquals, secureRandom, utf8, type Bytes, type RandomSource } from './bytes';

const PREFIX = 'pbkdf2-sha256';
const SALT_BYTES = 16;
const HASH_BITS = 256;

/**
 * Salted PBKDF2-HMAC-SHA256 hashes in the self-describing format
 * `pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>` (standard Base64 without padding, password
 * as UTF-8), so the cost can be raised later without breaking existing hashes. Hashes are
 * interchangeable with the Android app.
 */
export class PasswordHasher {
  /** Balance between CPU time (~0.3 s on a phone) and offline attack cost; stored per hash. */
  static readonly DEFAULT_ITERATIONS = 310_000;

  constructor(
    private readonly iterations: number = PasswordHasher.DEFAULT_ITERATIONS,
    private readonly random: RandomSource = secureRandom,
  ) {}

  async hash(secret: string): Promise<string> {
    const salt = this.random(SALT_BYTES);
    const hash = await derive(secret, salt, this.iterations);
    return [PREFIX, String(this.iterations), base64Encode(salt, false), base64Encode(hash, false)].join('$');
  }

  async verify(secret: string, encoded: string): Promise<boolean> {
    const parts = encoded.split('$');
    if (parts.length !== 4 || parts[0] !== PREFIX) return false;
    const iter = parseJavaInt(parts[1]!);
    if (iter === null || iter <= 0) return false;
    const salt = base64Decode(parts[2]!);
    const expected = base64Decode(parts[3]!);
    if (salt === null || expected === null) return false;
    return constantTimeEquals(await derive(secret, salt, iter), expected);
  }
}

/** Like Kotlin `toIntOrNull()`. */
function parseJavaInt(s: string): number | null {
  if (!/^[+-]?[0-9]+$/.test(s)) return null;
  const n = Number(s);
  return n >= -2147483648 && n <= 2147483647 ? n : null;
}

/** PBKDF2-HMAC-SHA256, 256-bit output. Exported for the known-answer test. */
export async function derive(secret: string, salt: Bytes, iterations: number): Promise<Bytes> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', utf8(secret), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, HASH_BITS));
}
