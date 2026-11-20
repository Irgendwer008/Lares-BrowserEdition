// SPDX-License-Identifier: GPL-3.0-or-later
import type { BlockInfo, BlockingHost, Page } from '@/core/blocking/blockingController';
import { i18n } from '#i18n';
import { withLock } from './storage';

/**
 * Without input for this long the user counts as away (Android: screen off) – unless the tab plays
 * sound (videos, streams). A locked screen always stops counting.
 */
export const IDLE_SECONDS = 5 * 60;

/** Message sent to the countdown content script. */
export interface CountdownMessage {
  readonly type: 'countdown';
  readonly remainingMillis: number | null;
}

/** Messages to the background script. */
export type BackgroundMessage = { readonly type: 'sync' } | { readonly type: 'visibility'; readonly visible: boolean };

const VISIBLE_TABS_KEY = 'visibleTabs';

/**
 * Tabs whose page reported being visible (page content script), kept in session storage so a
 * suspended worker remembers them. Only matters for tabs that aren't the active one: split view.
 */
export const VisibleTabs = {
  async get(): Promise<Record<number, true>> {
    const items = await browser.storage.session.get(VISIBLE_TABS_KEY);
    return (items[VISIBLE_TABS_KEY] as Record<number, true> | undefined) ?? {};
  },

  set(tabId: number, visible: boolean): Promise<void> {
    return withLock(VISIBLE_TABS_KEY, async () => {
      const tabs = await VisibleTabs.get();
      if (visible === (tabs[tabId] === true)) return;
      if (visible) tabs[tabId] = true;
      else delete tabs[tabId];
      await browser.storage.session.set({ [VISIBLE_TABS_KEY]: tabs });
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
    const idle = await browser.idle.queryState(IDLE_SECONDS);
    if (idle === 'locked') return [];
    let win;
    try {
      win = await browser.windows.getLastFocused();
    } catch {
      return []; // no window
    }
    if (!win.focused || win.id === undefined) return [];
    const visible = await VisibleTabs.get();
    return (await browser.tabs.query({ windowId: win.id }))
      .filter((tab) => (tab.active || (tab.id !== undefined && visible[tab.id])) && !(idle === 'idle' && !tab.audible))
      .map(toPage)
      .filter((p): p is Page => p !== null);
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
