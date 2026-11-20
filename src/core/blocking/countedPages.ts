// SPDX-License-Identifier: GPL-3.0-or-later
import type { Page } from './blockingController';

/** What the browser reports about a tab. */
export interface TabInfo {
  readonly tabId: number;
  readonly url: string | undefined;
  readonly windowId: number;
  readonly active: boolean;
  /** Plays sound right now (the browser's speaker indicator). */
  readonly audible: boolean;
  readonly muted: boolean;
}

/** What the page itself reported (page content script). */
export interface PageState {
  /** `document.visibilityState === 'visible'` – e.g. the other half of a split view. */
  readonly visible?: boolean;
  /** A video of the page is in picture-in-picture (only where the browser tells the page: Chrome). */
  readonly pictureInPicture?: boolean;
}

export type IdleState = 'active' | 'idle' | 'locked';

/**
 * The pages whose time counts right now (Android: the foreground app, apps visible in split
 * screen and picture-in-picture, while the screen is on):
 * - in front: the active tab of the focused window and other tabs visible in it (split view) –
 *   while the user is active;
 * - media: any tab playing sound (not muted) or showing picture-in-picture – also in the
 *   background, in other windows and while another program is in front. Muted autoplay previews
 *   in background tabs don't count.
 * Nothing counts while the screen is locked.
 */
export function countedPages(tabs: readonly TabInfo[], focusedWindowId: number | null, idle: IdleState, states: Readonly<Record<number, PageState>>): Page[] {
  if (idle === 'locked') return [];
  const pages: Page[] = [];
  for (const tab of tabs) {
    if (!tab.url) continue;
    const state = states[tab.tabId] ?? {};
    const media = (tab.audible && !tab.muted) || state.pictureInPicture === true;
    const inFront = tab.windowId === focusedWindowId && (tab.active || state.visible === true) && idle === 'active';
    if (inFront || media) pages.push({ tabId: tab.tabId, url: tab.url });
  }
  return pages;
}
