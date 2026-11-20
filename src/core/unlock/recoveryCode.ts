// SPDX-License-Identifier: GPL-3.0-or-later
import { secureRandom, type RandomSource } from './bytes';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 20;
const GROUP = 5;

/**
 * Recovery code: 20 characters of Crockford Base32 (100 bits), shown once as
 * `XXXXX-XXXXX-XXXXX-XXXXX`. Input is normalized, so case, separators and the look-alikes
 * O/0 and I/L/1 don't matter.
 */
export const RecoveryCode = {
  LENGTH,

  generate(random: RandomSource = secureRandom): string {
    // 32 symbols divide 256 evenly, so `byte & 31` is unbiased.
    const chars = Array.from(random(LENGTH), (b) => ALPHABET[b & 31]!);
    const groups: string[] = [];
    for (let i = 0; i < LENGTH; i += GROUP) groups.push(chars.slice(i, i + GROUP).join(''));
    return groups.join('-');
  },

  /** Returns the canonical form (no separators), or null if it can't be a recovery code. */
  normalize(input: string): string | null {
    const s = Array.from(input.toUpperCase())
      .filter((c) => c !== '-' && !/\s/.test(c))
      .map((c) => (c === 'O' ? '0' : c === 'I' || c === 'L' ? '1' : c))
      .join('');
    return s.length === LENGTH && Array.from(s).every((c) => ALPHABET.includes(c)) ? s : null;
  },
};
