<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Lares' license (GPL + full text) and the open-source libraries it ships (Android: license / libraries screens). -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { LARES_LICENSE_TEXT, LIBRARIES } from '@/lib/licenses';
  import Icon from '@/lib/ui/Icon.svelte';
  import TopBar from '@/lib/ui/TopBar.svelte';
  import { ui } from '../ui.svelte';

  let { view }: { view: 'license' | 'libraries' } = $props();
  let open = $state<string | null>(null);
  const toggle = (key: string) => (open = open === key ? null : key);
</script>

<TopBar title={view === 'license' ? i18n.t('licenseTitle') : i18n.t('librariesTitle')} onback={() => ui.go({ name: 'settings' })} />

<div class="content">
  {#if view === 'license'}
    <h2 class="title-m">{i18n.t('licenseSummary')}</h2>
    <p class="body-m pre">{i18n.t('licenseBody')}</p>
    <button class="toggle label-l" aria-expanded={open === 'gpl'} onclick={() => toggle('gpl')}>
      {i18n.t('licenseFullText')}<span class="chevron" class:up={open === 'gpl'}><Icon name="expandMore" size={20} /></span>
    </button>
    {#if open === 'gpl'}<pre class="text">{LARES_LICENSE_TEXT}</pre>{/if}
  {:else}
    <p class="body-m muted">{i18n.t('librariesCount', LIBRARIES.length)}</p>
    <div class="list">
      {#each LIBRARIES as lib (lib.name)}
        <div class="lib">
          <button class="lib-head" aria-expanded={open === lib.name} onclick={() => toggle(lib.name)}>
            <span class="lib-text">
              <span class="body-l">{lib.name}{#if lib.version}<span class="version muted body-s">{lib.version}</span>{/if}</span>
              <span class="body-s muted">{lib.author} · {lib.license}</span>
            </span>
            <span class="chevron" class:up={open === lib.name}><Icon name="expandMore" /></span>
          </button>
          {#if open === lib.name}
            <div class="lib-body">
              <div class="links body-m">
                {#if lib.website}<a href={lib.website} target="_blank" rel="noreferrer">{i18n.t('librariesWebsite')}</a>{/if}
                <a href={lib.source} target="_blank" rel="noreferrer">{i18n.t('librariesSource')}</a>
              </div>
              <pre class="text">{lib.text}</pre>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .content { display: flex; flex-direction: column; gap: 12px; padding: 8px 16px 24px; }
  .pre { white-space: pre-line; color: var(--on-surface-variant); }
  button { background: none; border: 0; cursor: pointer; color: inherit; text-align: left; font: inherit; }
  .toggle { display: flex; align-items: center; gap: 4px; color: var(--primary); padding: 8px 0; font-size: 14px; font-weight: 500; }
  .version { margin-left: 6px; }
  .chevron { display: grid; transition: transform .15s; color: var(--on-surface-variant); }
  .chevron.up { transform: rotate(180deg); }
  .text {
    white-space: pre-wrap; word-break: break-word; font-size: 11px; line-height: 1.45; margin: 0;
    font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; color: var(--on-surface-variant);
    background: var(--surface-container); padding: 12px; border-radius: var(--radius-s); max-height: 360px; overflow: auto;
  }
  .list { border: 1px solid var(--outline-variant); border-radius: var(--radius-m); overflow: hidden; }
  .lib + .lib { border-top: 1px solid var(--outline-variant); }
  .lib-head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 12px 12px 16px; }
  .lib-head:hover { background: color-mix(in srgb, var(--on-surface) 5%, transparent); }
  .lib-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .lib-body { display: flex; flex-direction: column; gap: 8px; padding: 0 12px 12px 16px; }
  .links { display: flex; gap: 16px; }
  .links a { color: var(--primary); font-weight: 500; }
</style>
