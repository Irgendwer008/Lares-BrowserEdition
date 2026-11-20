// SPDX-License-Identifier: GPL-3.0-or-later
import { BlockingController } from '@/core/blocking/blockingController';
import { systemZone } from '@/core/time/zonedTime';
import { BrowserClock } from '@/platform/browserClock';
import { BrowserHost, IDLE_SECONDS, isBlockPage, PageStates, type BackgroundMessage } from '@/platform/browserHost';
import { KEYS, SessionSegmentStore, StorageGroupStore, StorageRuleStore, StorageStateStore, StorageUsageStore } from '@/platform/storage';

/** Regular check: counts time, saves the clock, catches anything an event missed. */
const TICK_ALARM = 'tick';
/** One-off check when a limit runs out (or the usage period ends). */
const LIMIT_ALARM = 'limit';
/** Chrome runs alarms at most every 30 s; Firefox accepts the same value. */
const TICK_MINUTES = 0.5;

export default defineBackground(() => {
  // Listeners must be registered synchronously so events wake the worker; the controller is
  // created lazily on the first event.
  let controller: Promise<{ controller: BlockingController; clock: BrowserClock }> | null = null;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;

  function setup() {
    controller ??= (async () => {
      const clock = await BrowserClock.create();
      const rules = new StorageRuleStore();
      const c = new BlockingController(
        clock,
        new StorageStateStore(),
        rules,
        new StorageGroupStore(rules),
        new StorageUsageStore(),
        new SessionSegmentStore(),
        new BrowserHost(),
        systemZone,
      );
      return { controller: c, clock };
    })();
    return controller;
  }

  async function sync() {
    const { controller, clock } = await setup();
    const { nextCheckInMillis } = await controller.sync();
    await clock.checkpoint();
    clearTimeout(limitTimer);
    if (nextCheckInMillis === null) {
      await browser.alarms.clear(LIMIT_ALARM);
      return;
    }
    // The timer is exact while the worker runs; the alarm wakes it up if it was suspended
    // (and the countdown content script also asks for a check when it reaches zero).
    const delay = nextCheckInMillis + 250;
    limitTimer = setTimeout(() => void sync(), delay);
    await browser.alarms.create(LIMIT_ALARM, { when: Date.now() + delay });
  }

  function syncSoon() {
    sync().catch((e) => console.error('Lares: sync failed', e));
  }

  async function ensureTick() {
    if (!(await browser.alarms.get(TICK_ALARM))) await browser.alarms.create(TICK_ALARM, { periodInMinutes: TICK_MINUTES });
  }

  browser.idle.setDetectionInterval(IDLE_SECONDS);

  browser.runtime.onInstalled.addListener(() => void ensureTick().then(syncSoon));
  browser.runtime.onStartup.addListener(() => void ensureTick().then(syncSoon));
  browser.alarms.onAlarm.addListener(() => syncSoon());

  browser.tabs.onActivated.addListener(() => syncSoon());
  browser.tabs.onUpdated.addListener((_tabId, change) => {
    if (change.url !== undefined || change.audible !== undefined || change.mutedInfo !== undefined) syncSoon();
  });
  browser.tabs.onRemoved.addListener((tabId) => void PageStates.set(tabId, null).then(syncSoon));
  browser.windows.onFocusChanged.addListener(() => syncSoon());
  browser.idle.onStateChanged.addListener(() => syncSoon());

  // Block before the page shows up (top-level navigations only).
  browser.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId !== 0 || isBlockPage(details.url)) return;
    void setup().then(({ controller }) => controller.checkNavigation({ tabId: details.tabId, url: details.url }));
  });

  // Rules, settings or the unlock state changed (e.g. in the options page): apply right away.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (KEYS.rules in changes || KEYS.groups in changes || KEYS.appState in changes)) syncSoon();
  });

  browser.runtime.onMessage.addListener((message: BackgroundMessage, sender) => {
    if (message?.type === 'sync') syncSoon();
    else if (message?.type === 'pageState' && sender.tab?.id !== undefined) {
      void PageStates.set(sender.tab.id, { visible: message.visible, pictureInPicture: message.pictureInPicture }).then(syncSoon);
    }
  });

  void ensureTick();
  syncSoon();
});
