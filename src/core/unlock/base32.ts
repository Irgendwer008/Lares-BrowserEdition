// SPDX-License-Identifier: GPL-3.0-or-later
import type { Bytes } from './bytes';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 Base32 without padding (the format authenticator apps expect for TOTP secrets). */
export const Base32 = {
  encode(data: Uint8Array): string {
    let out = '';
    let buffer = 0;
    let bits = 0;
    for (const b of data) {
      buffer = ((buffer << 8) | b) & 0xffff;
      bits += 8;
      while (bits >= 5) {
        out += ALPHABET[(buffer >> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
    return out;
  },

  /** @throws Error on an invalid character. */
  decode(text: string): Bytes {
    const clean = text.trim().replace(/=+$/, '').replaceAll(' ', '').toUpperCase();
    const out: number[] = [];
    let buffer = 0;
    let bits = 0;
    for (const c of clean) {
      const v = ALPHABET.indexOf(c);
      if (v < 0) throw new Error('invalid base32 character');
      buffer = ((buffer << 5) | v) & 0xffff;
      bits += 5;
      if (bits >= 8) {
        out.push((buffer >> (bits - 8)) & 0xff);
        bits -= 8;
      }
    }
    return new Uint8Array(out);
  },
};
