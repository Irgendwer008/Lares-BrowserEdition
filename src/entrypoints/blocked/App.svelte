<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Block page (Android: BlockActivity): reason, group, "Close" and "Go to Lares". -->
<script lang="ts">
  import { i18n } from '#i18n';
  import LaresMark from '@/lib/ui/LaresMark.svelte';
  import { UrlMatcher } from '@/core/policy/urlMatcher';

  const params = new URLSearchParams(location.search);
  const url = params.get('url') ?? '';
  const reason = params.get('reason');
  const subject = params.get('subject');
  const resetAt = Number(params.get('resetAt') ?? NaN);

  const site = UrlMatcher.parse(url)?.host ?? url;
  document.title = i18n.t('blockTitle', [site]);

  function resetText(): string {
    const at = new Date(resetAt);
    if (at.getHours() === 0 && at.getMinutes() === 0) return i18n.t('blockResetMidnight');
    return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  const reasonText = reason === 'LIMIT_REACHED' && Number.isFinite(resetAt) ? i18n.t('blockReasonLimit', [resetText()]) : i18n.t('blockReasonAlways');
  // A subject that isn't a website is a group name.
  const isGroup = subject !== null && UrlMatcher.normalizeRule(subject) === null;

  async function closeTab() {
    const tab = await browser.tabs.getCurrent();
    if (tab?.id !== undefined) await browser.tabs.remove(tab.id);
  }

  async function openLares() {
    try {
      await browser.action.openPopup();
    } catch {
      await browser.tabs.create({ url: browser.runtime.getURL('/popup.html?tab=home') });
    }
  }
</script>

<main>
  <LaresMark size={40} />
  <h1>{i18n.t('blockTitle', [site])}</h1>
  <p class="body-l">{reasonText}</p>
  {#if isGroup}<p class="body-m">{i18n.t('blockGroup', [subject!])}</p>{/if}
  <div class="actions">
    <button class="primary" onclick={closeTab}>{i18n.t('blockCloseTab')}</button>
    <button class="outlined" onclick={openLares}>{i18n.t('blockOpenLares')}</button>
  </div>
</main>

<style>
  main {
    min-height: 100vh; padding: 32px 24px; margin: 0 auto; max-width: 480px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; text-align: center;
  }
  h1 { font-size: 28px; line-height: 36px; font-weight: 400; margin-top: 16px; overflow-wrap: anywhere; }
  p { color: var(--on-surface-variant); }
  .actions { display: flex; flex-direction: column; gap: 16px; width: 100%; margin-top: 24px; }
  button { height: 48px; border-radius: 999px; font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid transparent; }
  .primary { background: var(--primary); color: var(--on-primary); }
  .outlined { background: transparent; color: var(--on-surface-variant); border-color: var(--outline-variant); }
</style>
