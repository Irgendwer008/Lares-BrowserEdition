<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { i18n } from '#i18n';
  import IconButton from './IconButton.svelte';
  let { title, onback, actions }: { title: string; onback?: () => void; actions?: Snippet } = $props();
</script>

<header>
  {#if onback}<IconButton icon="arrowBack" label={i18n.t('back')} onclick={onback} />{/if}
  <h1 class="title-l">{title}</h1>
  {#if actions}{@render actions()}{/if}
</header>

<style>
  header { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 4px; position: sticky; top: 0; background: var(--surface); z-index: 2; min-height: 56px; }
  h1 { flex: 1; padding-left: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
