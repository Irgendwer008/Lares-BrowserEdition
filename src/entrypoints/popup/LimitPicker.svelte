<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- "Always blocked" or "Daily time limit" + minutes. `value` is null (always) or minutes; `valid` reports input errors. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import TextField from '@/lib/ui/TextField.svelte';

  let { value = $bindable(null), valid = $bindable(true) }: { value?: number | null; valid?: boolean } = $props();
  // svelte-ignore state_referenced_locally
  let daily = $state(value !== null);
  // svelte-ignore state_referenced_locally
  let minutes = $state(value === null ? '30' : String(value));

  $effect(() => {
    const n = Number.parseInt(minutes, 10);
    valid = !daily || (/^\d+$/.test(minutes.trim()) && n >= 0 && n <= 1440);
    value = daily ? (valid ? n : null) : null;
  });
</script>

<div class="limit">
  <label class="radio"><input type="radio" checked={!daily} onchange={() => (daily = false)} />{i18n.t('limitAlways')}</label>
  <label class="radio"><input type="radio" checked={daily} onchange={() => (daily = true)} />{i18n.t('limitDaily')}</label>
  {#if daily}
    <TextField label={i18n.t('limitMinutesLabel')} bind:value={minutes} inputmode="numeric" error={valid ? null : ' '} />
  {/if}
</div>

<style>
  .limit { display: flex; flex-direction: column; gap: 8px; color: var(--on-surface); }
  .radio { display: flex; align-items: center; gap: 12px; cursor: pointer; min-height: 32px; }
  .radio input { width: 18px; height: 18px; accent-color: var(--primary); margin: 0; }
</style>
