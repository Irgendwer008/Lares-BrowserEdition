// SPDX-License-Identifier: GPL-3.0-or-later
/** RFC 3492 Punycode encoder (replaces java.net.IDN for host names; no DOM `URL` quirks). */

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;

function digit(d: number): string {
  return String.fromCharCode(d < 26 ? 97 + d : 22 + d);
}

function adapt(delta: number, numPoints: number, first: boolean): number {
  delta = first ? Math.floor(delta / DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  let k = 0;
  while (delta > ((BASE - T_MIN) * T_MAX) >> 1) {
    delta = Math.floor(delta / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * delta) / (delta + SKEW));
}

/** Encodes one label (without the `xn--` prefix). */
export function punycodeEncode(input: string): string {
  const cps = Array.from(input, (c) => c.codePointAt(0)!);
  let out = cps.filter((c) => c < 0x80).map((c) => String.fromCharCode(c)).join('');
  const basic = out.length;
  let handled = basic;
  if (basic > 0) out += '-';
  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;
  while (handled < cps.length) {
    let m = Number.MAX_SAFE_INTEGER;
    for (const c of cps) if (c >= n && c < m) m = c;
    delta += (m - n) * (handled + 1);
    n = m;
    for (const c of cps) {
      if (c < n) delta++;
      if (c === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
          if (q < t) break;
          out += digit(t + ((q - t) % (BASE - t)));
          q = Math.floor((q - t) / (BASE - t));
        }
        out += digit(q);
        bias = adapt(delta, handled + 1, handled === basic);
        delta = 0;
        handled++;
      }
    }
    delta++;
    n++;
  }
  return out;
}

/**
 * Host to ASCII like `IDN.toASCII(host, ALLOW_UNASSIGNED)`: IDN label separators become dots,
 * non-ASCII labels are NFKC-normalized, lower-cased and Punycode-encoded.
 * @return null if a label is empty or longer than 63 characters.
 */
export function hostToAscii(host: string): string | null {
  const labels = host.replace(/[。．｡]/g, '.').split('.');
  const out: string[] = [];
  for (const raw of labels) {
    // eslint-disable-next-line no-control-regex
    const label = /^[\x00-\x7F]*$/.test(raw) ? raw : 'xn--' + punycodeEncode(raw.normalize('NFKC').toLowerCase());
    if (label.length === 0 || label.length > 63) return null;
    out.push(label);
  }
  return out.join('.');
}
