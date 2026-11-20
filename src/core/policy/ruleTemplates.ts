// SPDX-License-Identifier: GPL-3.0-or-later
import type { RuleType } from './rule';
import { UrlMatcher } from './urlMatcher';

/**
 * Ready-made website combinations. Names are brand names and therefore not translated. `color`
 * is the commonly known brand color (ARGB), used for the letter icon – no logos are shipped.
 *
 * Browser port: the Android templates also list app packages (and alternative clients); only the
 * website targets are kept. Every Android template has websites, so none was dropped.
 */
export interface RuleTemplate {
  readonly id: string;
  readonly name: string;
  readonly websites: readonly string[];
  readonly color: number;
}

/** Targets to add for a template (website rules only). */
export function templateTargets(t: RuleTemplate): [RuleType, string][] {
  return t.websites.map((w) => ['WEBSITE', w]);
}

const all: readonly RuleTemplate[] = [
  { id: 'youtube', name: 'YouTube', websites: ['youtube.com', 'youtu.be'], color: 0xffff0000 },
  { id: 'instagram', name: 'Instagram', websites: ['instagram.com'], color: 0xffe1306c },
  { id: 'tiktok', name: 'TikTok', websites: ['tiktok.com'], color: 0xff000000 },
  { id: 'snapchat', name: 'Snapchat', websites: ['snapchat.com'], color: 0xfffffc00 },
  { id: 'facebook', name: 'Facebook', websites: ['facebook.com', 'fb.com'], color: 0xff1877f2 },
  { id: 'x', name: 'X (Twitter)', websites: ['x.com', 'twitter.com'], color: 0xff000000 },
  { id: 'reddit', name: 'Reddit', websites: ['reddit.com', 'redd.it'], color: 0xffff4500 },
  { id: 'linkedin', name: 'LinkedIn', websites: ['linkedin.com'], color: 0xff0a66c2 },
  { id: 'threads', name: 'Threads', websites: ['threads.net', 'threads.com'], color: 0xff000000 },
  { id: 'pinterest', name: 'Pinterest', websites: ['pinterest.com', 'pinterest.de'], color: 0xffe60023 },
  { id: 'twitch', name: 'Twitch', websites: ['twitch.tv'], color: 0xff9146ff },
  { id: 'tumblr', name: 'Tumblr', websites: ['tumblr.com'], color: 0xff001935 },
  { id: 'bluesky', name: 'Bluesky', websites: ['bsky.app'], color: 0xff1185fe },
];

export const RuleTemplates = {
  all,

  /** Brand color (ARGB) of the template a website belongs to (null if none; always null for apps). */
  colorFor(type: RuleType, target: string): number | null {
    if (type !== 'WEBSITE') return null;
    const host = UrlMatcher.normalizeRule(target)?.host;
    if (host === undefined) return null;
    return all.find((t) => t.websites.some((w) => host === w || host.endsWith('.' + w)))?.color ?? null;
  },
};
