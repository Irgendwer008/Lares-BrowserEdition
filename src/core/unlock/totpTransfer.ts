// SPDX-License-Identifier: GPL-3.0-or-later
import { base64Decode, base64Encode, secureRandom, sha256, utf8, type Bytes, type RandomSource } from './bytes';

const PREFIX = 'lares-totp-v1';
const SALT_BYTES = 16;
const IV_BYTES = 12;
const TAG_BITS = 128;

async function key(salt: Bytes, recoveryCanonical: string, usage: KeyUsage): Promise<CryptoKey> {
  const raw = await sha256(salt, utf8(recoveryCanonical));
  return globalThis.crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

/**
 * Moves the TOTP secret to another device inside the rules export, so the guardian's
 * authenticator app keeps working there (also between the Android app and the browser). The
 * secret is encrypted with a key derived from the recovery code (100 random bits – not guessable,
 * only the guardian has it), so the exported file alone is useless. Created while the recovery
 * code is known (TOTP setup); the recovery code itself is never stored.
 *
 * Format: `lares-totp-v1$<salt>$<iv>$<ciphertext+tag>` (padded standard Base64), AES-256-GCM,
 * key = SHA-256(salt ‖ canonical recovery code), AAD = the prefix.
 */
export const TotpTransfer = {
  /** @param recoveryCanonical the recovery code in canonical form (RecoveryCode.normalize). */
  async seal(secret: Uint8Array, recoveryCanonical: string, random: RandomSource = secureRandom): Promise<string> {
    const salt = random(SALT_BYTES);
    const iv = random(IV_BYTES);
    const data = await globalThis.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: utf8(PREFIX), tagLength: TAG_BITS },
      await key(salt, recoveryCanonical, 'encrypt'),
      new Uint8Array(secret),
    );
    return [PREFIX, base64Encode(salt), base64Encode(iv), base64Encode(new Uint8Array(data))].join('$');
  },

  /** @return the secret, or null if the recovery code is wrong or the package is damaged. */
  async open(sealed: string, recoveryCanonical: string): Promise<Bytes | null> {
    try {
      const parts = sealed.split('$');
      if (parts.length !== 4 || parts[0] !== PREFIX) return null;
      const salt = base64Decode(parts[1]!);
      const iv = base64Decode(parts[2]!);
      const data = base64Decode(parts[3]!);
      if (salt === null || iv === null || data === null || iv.length === 0) return null;
      const plain = await globalThis.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: utf8(PREFIX), tagLength: TAG_BITS },
        await key(salt, recoveryCanonical, 'decrypt'),
        data,
      );
      return new Uint8Array(plain);
    } catch {
      return null;
    }
  },

  /** Looks like a package of this format (for a quick check before asking for the code). */
  isPackage(text: string | null | undefined): boolean {
    return text != null && text.startsWith(PREFIX + '$') && text.split('$').length - 1 === 3;
  },
};
