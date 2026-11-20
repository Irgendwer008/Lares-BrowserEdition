// SPDX-License-Identifier: GPL-3.0-or-later
import { Base32 } from './base32';
import { constantTimeEquals, utf8 } from './bytes';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;

/** Like `URLEncoder.encode(s, "UTF-8").replace("+", "%20")`. */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/[!'()~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** RFC 6238 TOTP: HMAC-SHA1, 30 s steps, 6 digits – the defaults every authenticator app supports. */
export const Totp = {
  PERIOD_SECONDS,
  DIGITS,
  SECRET_BYTES,

  counterAt(wallMillis: number): number {
    return Math.floor(Math.trunc(wallMillis / 1000) / PERIOD_SECONDS);
  },

  async code(secret: Uint8Array, counter: number, digits: number = DIGITS): Promise<string> {
    const subtle = globalThis.crypto.subtle;
    const key = await subtle.importKey('raw', new Uint8Array(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const message = new Uint8Array(8);
    new DataView(message.buffer).setBigInt64(0, BigInt(counter));
    const hash = new Uint8Array(await subtle.sign('HMAC', key, message));
    const offset = hash[hash.length - 1]! & 0x0f;
    const binary =
      ((hash[offset]! & 0x7f) << 24) | ((hash[offset + 1]! & 0xff) << 16) | ((hash[offset + 2]! & 0xff) << 8) | (hash[offset + 3]! & 0xff);
    return String(binary % 10 ** digits).padStart(digits, '0');
  },

  /**
   * Checks [input] against the current step ±[window] steps (clock drift). Codes at or before
   * [lastUsedCounter] are rejected, so an observed code can't be replayed.
   *
   * @return the matched counter, or null.
   */
  async verify(secret: Uint8Array, input: string, wallMillis: number, lastUsedCounter: number, window = 1): Promise<number | null> {
    const digits = input.replace(/\s/g, '');
    if (!/^[0-9]{6}$/.test(digits)) return null;
    const now = Totp.counterAt(wallMillis);
    for (let counter = now - window; counter <= now + window; counter++) {
      if (counter <= lastUsedCounter) continue;
      if (constantTimeEquals(utf8(await Totp.code(secret, counter)), utf8(digits))) return counter;
    }
    return null;
  },

  /** `otpauth://` URI for the QR code shown to the guardian. */
  provisioningUri(secret: Uint8Array, account: string, issuer = 'Lares'): string {
    const label = enc(issuer) + ':' + enc(account);
    return (
      'otpauth://totp/' + label +
      '?secret=' + Base32.encode(secret) +
      '&issuer=' + enc(issuer) +
      '&algorithm=SHA1&digits=' + DIGITS +
      '&period=' + PERIOD_SECONDS
    );
  },
};
