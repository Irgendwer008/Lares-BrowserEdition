// SPDX-License-Identifier: GPL-3.0-or-later
import type { BlockInfo, BlockingHost, Page } from '@/core/blocking/blockingController';
import { countedPages, type PageState } from '@/core/blocking/countedPages';
import { i18n } from '#i18n';
import { withLock } from './storage';

/**
 * Without input for this long the user counts as away (Android: screen off) – then only media
 * still counts (see countedPages). A locked screen stops all counting.
 */
export const IDLE_SECONDS = 5 * 60;

/** Message sent to the countdown content script. */
export interface CountdownMessage {
  readonly type: 'countdown';
  readonly remainingMillis: number | null;
}

/** Messages to the background script. */
export type BackgroundMessage = { readonly type: 'sync' } | ({ readonly type: 'pageState' } & PageState);

const PAGE_STATES_KEY = 'pageStates';

/**
 * What pages reported about themselves (visible – split view; picture-in-picture), kept in session
 * storage so a suspended worker remembers it.
 */
export const PageStates = {
  async get(): Promise<Record<number, PageState>> {
    const items = await browser.storage.session.get(PAGE_STATES_KEY);
    return (items[PAGE_STATES_KEY] as Record<number, PageState> | undefined) ?? {};
  },

  /** @param state null when the tab is gone. */
  set(tabId: number, state: PageState | null): Promise<void> {
    return withLock(PAGE_STATES_KEY, async () => {
      const states = await PageStates.get();
      const old = states[tabId];
      if (state === null ? old === undefined : old?.visible === state.visible && old?.pictureInPicture === state.pictureInPicture) return;
      if (state === null) delete states[tabId];
      else states[tabId] = { visible: state.visible, pictureInPicture: state.pictureInPicture };
      await browser.storage.session.set({ [PAGE_STATES_KEY]: states });
    });
  },
};

export function blockPageUrl(info: BlockInfo): string {
  const params = new URLSearchParams({ url: info.url, reason: info.reason });
  if (info.subject !== null) params.set('subject', info.subject);
  if (info.resetAtMillis !== null) params.set('resetAt', String(info.resetAtMillis));
  return browser.runtime.getURL(`/blocked.html?${params}`);
}

export function isBlockPage(url: string | undefined): boolean {
  return url !== undefined && url.startsWith(browser.runtime.getURL('/blocked.html'));
}

function toPage(tab: { id?: number; url?: string }): Page | null {
  return tab.id !== undefined && tab.id !== browser.tabs.TAB_ID_NONE && tab.url ? { tabId: tab.id, url: tab.url } : null;
}

export class BrowserHost implements BlockingHost {
  async foreground(): Promise<Page[]> {
    const [idle, focused, tabs, states] = await Promise.all([
      browser.idle.queryState(IDLE_SECONDS),
      browser.windows.getLastFocused().catch(() => null),
      browser.tabs.query({}),
      PageStates.get(),
    ]);
    const focusedWindowId = focused?.focused && focused.id !== undefined ? focused.id : null;
    const infos = tabs
      .filter((t) => t.id !== undefined && t.id !== browser.tabs.TAB_ID_NONE)
      .map((t) => ({ tabId: t.id!, url: t.url, windowId: t.windowId, active: t.active, audible: t.audible === true, muted: t.mutedInfo?.muted === true }));
    return countedPages(infos, focusedWindowId, idle, states);
  }

  async openPages(): Promise<Page[]> {
    return (await browser.tabs.query({})).map(toPage).filter((p): p is Page => p !== null);
  }

  async block(tabId: number, info: BlockInfo): Promise<void> {
    try {
      await browser.tabs.update(tabId, { url: blockPageUrl(info) });
    } catch {
      // Chrome can't show extension pages in incognito tabs ("spanning" mode): close the tab.
      await browser.tabs.remove(tabId).catch(() => {});
    }
  }

  async countdown(tabId: number, remainingMillis: number | null): Promise<void> {
    const message: CountdownMessage = { type: 'countdown', remainingMillis };
    // No content script on pages the extension can't access – then there's simply no countdown.
    await browser.tabs.sendMessage(tabId, message).catch(() => {});
  }

  async warning(subject: string, remainingMillis: number | null, label?: string): Promise<void> {
    const id = `limit-warning:${subject}`;
    if (remainingMillis === null) {
      await browser.notifications.clear(id);
      return;
    }
    const minutes = Math.max(1, Math.round(remainingMillis / 60_000));
    await browser.notifications.create(id, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icon/128.png'),
      title: i18n.t('limitWarningTitle', minutes),
      message: label ? i18n.t('limitWarningText', [label]) : i18n.t('limitWarningTextGeneric'),
    });
  }
}
