// SPDX-License-Identifier: GPL-3.0-or-later
import { i18n } from '#i18n';
import type { BackgroundMessage, CountdownMessage } from '@/platform/browserHost';

/**
 * Runs in every web page:
 * - Reports whether the page is visible, so tabs shown side by side (split view, e.g. in Zen) count
 *   like the active tab (Android: apps visible in split screen count too), and whether one of its
 *   videos is in picture-in-picture (Chrome tells pages; Firefox's own picture-in-picture doesn't),
 *   which counts like media playing in the background.
 * - Countdown pill in the last minutes of a daily limit (Android: TimerOverlay). The background
 * script sends the remaining time; the pill counts down by itself and asks the background script
 * to check again when it reaches zero, so the page is blocked right on time even while the
 * background worker is suspended. Not interactive (pointer-events: none), and it slides out of
 * the way when the cursor comes near, so the page underneath stays visible and usable.
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
            transition: transform .18s ease-out;
          }
          @media (prefers-reduced-motion: reduce) { div { transition: none; } }
        </style>
        <div role="timer" aria-live="off"></div>`;
      label = shadow.querySelector('div');
      document.documentElement.append(host);
      document.addEventListener('mousemove', onMouseMove, { passive: true });
      document.documentElement.addEventListener('mouseleave', resetDodge);
      return label!;
    }

    function hide() {
      clearInterval(timer);
      timer = undefined;
      host?.remove();
      host = label = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.documentElement.removeEventListener('mouseleave', resetDodge);
      cancelAnimationFrame(dodgeFrame);
    }

    // ---- Dodging the cursor ----
    /** Distance (px) of the pill from the top and right edge. */
    const PILL_INSET = 12;
    /** How close (px) the cursor may come before the pill moves. */
    const DODGE_MARGIN = 24;
    let dodgeFrame = 0;
    let cursor: { x: number; y: number } | null = null;

    function onMouseMove(e: MouseEvent) {
      cursor = { x: e.clientX, y: e.clientY };
      if (!dodgeFrame) dodgeFrame = requestAnimationFrame(dodge);
    }

    function resetDodge() {
      cursor = null;
      if (label) label.style.transform = '';
    }

    /**
     * Moves the pill just far enough that the cursor is DODGE_MARGIN away from it – left or down,
     * whichever is the smaller move – and back home when the cursor leaves. Measured against the
     * pill's home position (not where it is while sliding), so it doesn't jitter.
     */
    function dodge() {
      dodgeFrame = 0;
      if (!label || !cursor) return;
      // Home position from the layout (fixed at top / right PILL_INSET; offset sizes ignore transforms).
      const right = document.documentElement.clientWidth - PILL_INSET;
      const home = { left: right - label.offsetWidth, right, top: PILL_INSET, bottom: PILL_INSET + label.offsetHeight };
      const { x, y } = cursor;
      const near = x > home.left - DODGE_MARGIN && x < home.right + DODGE_MARGIN && y > home.top - DODGE_MARGIN && y < home.bottom + DODGE_MARGIN;
      if (!near) {
        label.style.transform = '';
        return;
      }
      const left = home.right - (x - DODGE_MARGIN); // move left so the right edge clears the cursor
      const down = y + DODGE_MARGIN - home.top; // move down so the top edge clears the cursor
      label.style.transform = left <= down ? `translateX(${-left}px)` : `translateY(${down}px)`;
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

    function reportState() {
      const message: BackgroundMessage = { type: 'pageState', visible: !document.hidden, pictureInPicture: document.pictureInPictureElement != null };
      void browser.runtime.sendMessage(message).catch(() => {});
    }
    // These events are fired on the video; capturing listeners on the document see them.
    document.addEventListener('enterpictureinpicture', reportState, true);
    document.addEventListener('leavepictureinpicture', reportState, true);

    // A hidden page isn't counted; the background script sends the countdown again when it's back.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      reportState();
    });
    reportState();
  },
});
