// SPDX-License-Identifier: GPL-3.0-or-later
import { i18n } from '#i18n';
import type { BackgroundMessage, CountdownMessage } from '@/platform/browserHost';

/**
 * Runs in every web page:
 * - Reports whether the page is visible, so tabs shown side by side (split view, e.g. in Zen) count
 *   like the active tab (Android: apps visible in split screen count too).
 * - Countdown pill in the last minutes of a daily limit (Android: TimerOverlay). The background
 * script sends the remaining time; the pill counts down by itself and asks the background script
 * to check again when it reaches zero, so the page is blocked right on time even while the
 * background worker is suspended. Not interactive (pointer-events: none).
 */
export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    let host: HTMLElement | null = null;
    let label: HTMLElement | null = null;
    let endAt = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    function format(ms: number): string {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    }

    function ensurePill(): HTMLElement {
      if (host && label) return label;
      host = document.createElement('lares-countdown');
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `
        <style>
          :host { all: initial; }
          div {
            position: fixed; top: 12px; right: 12px; z-index: 2147483647; pointer-events: none;
            font: 600 14px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
            padding: 8px 14px; border-radius: 999px; color: #FFFFFF; background: #9A5326;
            box-shadow: 0 2px 8px rgba(0, 0, 0, .25); font-variant-numeric: tabular-nums;
          }
        </style>
        <div role="timer" aria-live="off"></div>`;
      label = shadow.querySelector('div');
      document.documentElement.append(host);
      return label!;
    }

    function hide() {
      clearInterval(timer);
      timer = undefined;
      host?.remove();
      host = label = null;
    }

    function render() {
      const left = endAt - Date.now();
      ensurePill().textContent = i18n.t('countdownLabel', [format(left)]);
      if (left <= 0) {
        hide();
        void browser.runtime.sendMessage({ type: 'sync' } satisfies BackgroundMessage).catch(() => {});
      }
    }

    browser.runtime.onMessage.addListener((message: CountdownMessage) => {
      if (message?.type !== 'countdown') return;
      if (message.remainingMillis === null) {
        hide();
        return;
      }
      endAt = Date.now() + message.remainingMillis;
      render();
      timer ??= setInterval(render, 1000);
    });

    function reportVisibility() {
      const message: BackgroundMessage = { type: 'visibility', visible: !document.hidden };
      void browser.runtime.sendMessage(message).catch(() => {});
    }

    // A hidden page isn't counted; the background script sends the countdown again when it's back.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      reportVisibility();
    });
    reportVisibility();
  },
});
