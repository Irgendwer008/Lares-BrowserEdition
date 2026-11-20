<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Material 3 basic dialog over a scrim; Escape / scrim click closes it. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  let { title, icon, onclose, children, actions }: { title: string; icon?: IconName; onclose: () => void; children: Snippet; actions?: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label={title}>
    {#if icon}<div class="icon"><Icon name={icon} /></div>{/if}
    <h2 class="headline" class:centered={icon}>{title}</h2>
    <div class="content body-m muted">{@render children()}</div>
    {#if actions}<div class="actions">{@render actions()}</div>{/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; background: var(--scrim); display: grid; place-items: center; padding: 16px; z-index: 10; }
  .dialog {
    width: 100%; max-width: 360px; max-height: calc(100vh - 32px); overflow-y: auto;
    background: var(--surface-container-high); border-radius: var(--radius-xl); padding: 24px;
    --field-bg: var(--surface-container-high);
  }
  .icon { color: var(--secondary); display: grid; place-items: center; margin-bottom: 16px; }
  .headline { color: var(--on-surface); margin-bottom: 16px; }
  .centered { text-align: center; }
  .content { display: flex; flex-direction: column; gap: 16px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px; flex-wrap: wrap; }
</style>
