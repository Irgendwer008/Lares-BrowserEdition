<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Start a pause (only while unlocked; Android: presets 5 min / 15 min / 1 h + custom, no maximum). -->
<script lang="ts">
  import { i18n } from '#i18n';
  import Button from '@/lib/ui/Button.svelte';
  import Dialog from '@/lib/ui/Dialog.svelte';
  import TextField from '@/lib/ui/TextField.svelte';
  import { formatDuration, ui, useModel } from '../ui.svelte';

  const model = useModel();
  const PRESETS = [5, 15, 60];
  let choice = $state<number | 'custom'>(15);
  let custom = $state('');

  const minutes = $derived(choice === 'custom' ? Number.parseInt(custom, 10) : choice);
  const valid = $derived(Number.isFinite(minutes) && minutes > 0 && minutes <= 525_600);

  async function start() {
    await ui.guarded(() => model.services.unlock.startPause(minutes * 60_000));
    ui.close();
  }
</script>

<Dialog title={i18n.t('pauseTitle')} icon="pause" onclose={() => ui.close()}>
  <p>{i18n.t('pauseBody')}</p>
  <div class="chips" role="radiogroup" aria-label={i18n.t('pausePresets')}>
    {#each PRESETS as m (m)}
      <button role="radio" aria-checked={choice === m} class:selected={choice === m} onclick={() => (choice = m)}>{formatDuration(m)}</button>
    {/each}
    <button role="radio" aria-checked={choice === 'custom'} class:selected={choice === 'custom'} onclick={() => (choice = 'custom')}>{i18n.t('pauseCustom')}</button>
  </div>
  {#if choice === 'custom'}
    <TextField label={i18n.t('pauseCustomMinutes')} bind:value={custom} inputmode="numeric" autofocus />
  {/if}
  {#snippet actions()}
    <Button variant="text" onclick={() => ui.close()}>{i18n.t('cancel')}</Button>
    <Button disabled={!valid} onclick={start}>{i18n.t('pauseStart')}</Button>
  {/snippet}
</Dialog>

<style>
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chips button {
    height: 32px; padding: 0 16px; border-radius: var(--radius-s); border: 1px solid var(--outline);
    background: transparent; color: var(--on-surface-variant); cursor: pointer; font-weight: 500;
  }
  .chips .selected { background: var(--secondary-container); color: var(--on-secondary-container); border-color: transparent; }
</style>
