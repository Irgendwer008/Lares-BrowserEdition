// SPDX-License-Identifier: GPL-3.0-or-later
import { hostToAscii } from './punycode';

/** A normalized host + path, e.g. host = `youtube.com`, path = `/shorts`. */
export interface WebAddress {
  readonly host: string;
  readonly path: string;
}

export function webAddress(host: string, path: string): WebAddress {
  return { host, path };
}

/** `youtube.com/shorts`, or just the host for an empty / root path. */
export function webAddressToString(a: WebAddress): string {
  return a.path === '' || a.path === '/' ? a.host : a.host + a.path;
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;
const PERCENT = /%([0-9A-Fa-f]{2})/g;
const SLASHES = /\/{2,}/g;
const WHITESPACE = /\s/;

/** Second-level suffixes where the registrable domain has three labels (e.g. bbc.co.uk). */
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp',
  'co.in', 'com.br', 'com.mx', 'com.tr', 'co.za', 'com.cn', 'com.ar', 'co.kr',
]);

/**
 * Matches URLs against website rules.
 *
 * - Host matching includes subdomains: rule `youtube.com` matches `m.youtube.com`.
 * - `www.` is ignored on both sides.
 * - Path rules match by segment prefix, case-insensitively (so `/Shorts` can't bypass
 *   `/shorts`): rule `youtube.com/shorts` matches `/shorts` and `/shorts/abc`,
 *   but not `/shortsfoo`.
 */
export const UrlMatcher = {
  /** Parses a URL (or what a user typed as rule target). Returns null for search terms / garbage. */
  parse(input: string): WebAddress | null {
    let s = input.trim();
    if (s.length === 0 || WHITESPACE.test(s)) return null;

    // Only a real scheme at the start counts – "://" inside the path / query / fragment
    // (e.g. `youtube.com/shorts?x=https://a`) must not turn the address into garbage.
    const m = SCHEME.exec(s);
    if (m) {
      const scheme = m[1]!.toLowerCase();
      if (scheme !== 'http' && scheme !== 'https') return null;
      s = s.substring(m[0].length);
    }

    const pathStart = s.search(/[/?#]/);
    let authority = pathStart >= 0 ? s.substring(0, pathStart) : s;
    let rest = pathStart >= 0 ? s.substring(pathStart) : '';

    authority = authority.substring(authority.lastIndexOf('@') + 1); // drop user info
    authority = stripPort(authority);
    const host = normalizeHost(authority);
    if (host === null) return null;

    rest = rest.split('#')[0]!.split('?')[0]!;
    return { host, path: normalizePath(rest) };
  },

  /** Normalizes a rule target as entered by the user (same rules as [parse]). */
  normalizeRule(target: string): WebAddress | null {
    return UrlMatcher.parse(target);
  },

  /**
   * Base domain for sorting / grouping: `m.youtube.com` → `youtube.com`, `news.bbc.co.uk` →
   * `bbc.co.uk`. A heuristic (no public-suffix list), only used for display order.
   */
  baseHost(host: string): string {
    const labels = host.split('.');
    if (labels.length <= 2) return host;
    const lastTwo = labels.slice(-2).join('.');
    return TWO_PART_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
  },

  matchesAddress(address: WebAddress, rule: WebAddress): boolean {
    const hostMatches = address.host === rule.host || address.host.endsWith('.' + rule.host);
    if (!hostMatches) return false;
    if (rule.path === '') return true;
    return address.path === rule.path || address.path.startsWith(rule.path + '/');
  },

  matches(url: string, ruleTarget: string): boolean {
    const address = UrlMatcher.parse(url);
    if (address === null) return false;
    const rule = UrlMatcher.normalizeRule(ruleTarget);
    if (rule === null) return false;
    return UrlMatcher.matchesAddress(address, rule);
  },
};

/**
 * Same path, same spelling: unreserved characters that were percent-encoded are decoded
 * (`/%73horts` → `/shorts`), repeated slashes collapsed (`//shorts` → `/shorts`), trailing
 * slash dropped, lower case. Encoded reserved characters (e.g. `%2F`) stay as they are.
 */
function normalizePath(raw: string): string {
  const decoded = raw.replace(PERCENT, (whole, hex: string) => {
    const c = String.fromCharCode(parseInt(hex, 16));
    return /^[A-Za-z0-9\-._~]$/.test(c) ? c : whole.toUpperCase();
  });
  return decoded.replace(SLASHES, '/').replace(/\/+$/, '').toLowerCase();
}

function stripPort(authority: string): string {
  if (authority.startsWith('[')) return authority; // IPv6 literal, keep as is
  const colon = authority.lastIndexOf(':');
  return colon >= 0 && /^[0-9]*$/.test(authority.substring(colon + 1)) ? authority.substring(0, colon) : authority;
}

function normalizeHost(raw: string): string | null {
  let host = raw.trim().replace(/\.+$/, '').toLowerCase();
  if (host.length === 0) return null;
  const ascii = hostToAscii(host);
  if (ascii === null) return null;
  host = ascii.toLowerCase();
  if (host.startsWith('www.')) host = host.substring(4);
  // Needs at least one dot (or be an IP / localhost) to be a plausible host.
  if (!host.includes('.') && host !== 'localhost' && !host.startsWith('[')) return null;
  return host;
}
