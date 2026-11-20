// SPDX-License-Identifier: GPL-3.0-or-later
/** Byte helpers shared by the crypto code (standard JS + WebCrypto only). */

export type Bytes = Uint8Array<ArrayBuffer>;

/** Fills a new array of [length] random bytes. Injectable for tests (Kotlin: `SecureRandom`). */
export type RandomSource = (length: number) => Bytes;

export const secureRandom: RandomSource = (length) => globalThis.crypto.getRandomValues(new Uint8Array(length));

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function concatBytes(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Like `MessageDigest.isEqual`: compares without an early exit. */
export function constantTimeEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RFC 4648 Base64 (standard alphabet), like `java.util.Base64.getEncoder()` (`.withoutPadding()`). */
export function base64Encode(data: Uint8Array, padding = true): string {
  let out = '';
  for (let i = 0; i < data.length; i += 3) {
    const b0 = data[i]!;
    const b1 = data[i + 1];
    const b2 = data[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? (padding ? '=' : '') : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? (padding ? '=' : '') : B64[b2 & 63];
  }
  return out;
}

/**
 * Strict decoder like `java.util.Base64.getDecoder()`: padding optional but correct if present,
 * no whitespace or foreign characters. @return null if invalid.
 */
export function base64Decode(text: string): Bytes | null {
  let s = text;
  const pad = s.length - s.replace(/=+$/, '').length;
  if (pad > 2 || (pad > 0 && s.length % 4 !== 0)) return null;
  s = s.substring(0, s.length - pad);
  if (s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 6) / 8));
  let buffer = 0;
  let bits = 0;
  let o = 0;
  for (const c of s) {
    const v = B64.indexOf(c);
    if (v < 0) return null;
    buffer = ((buffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

export async function sha256(...parts: Uint8Array[]): Promise<Bytes> {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', concatBytes(...parts)));
}
