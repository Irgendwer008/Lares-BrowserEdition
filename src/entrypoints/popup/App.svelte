<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The whole Lares UI lives in the toolbar popup (also opened in a tab for file import). -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { ui, useModel } from './ui.svelte';
  import SetupScreen from './screens/SetupScreen.svelte';
  import HomeScreen from './screens/HomeScreen.svelte';
  import AddRuleScreen from './screens/AddRuleScreen.svelte';
  import SettingsScreen from './screens/SettingsScreen.svelte';
  import LicensesScreen from './screens/LicensesScreen.svelte';
  import UnlockDialog from './dialogs/UnlockDialog.svelte';
  import PauseDialog from './dialogs/PauseDialog.svelte';
  import RuleDialog from './dialogs/RuleDialog.svelte';
  import GroupDialog from './dialogs/GroupDialog.svelte';

  let { inTab }: { inTab: boolean } = $props();
  const model = useModel();
  const unlock = $derived(model.state.unlock);
  const setupMode = $derived(
    !model.state.settings.setupComplete || unlock.method === null ? 'FIRST' : unlock.reSetupRequired ? 'RECOVERY' : null,
  );
</script>

<main class:tab={inTab}>
  {#if !model.loaded}
    <div></div>
  {:else if setupMode}
    <SetupScreen mode={setupMode} onfinish={() => ui.go({ name: 'home' })} />
  {:else if ui.screen.name === 'changeCode'}
    <SetupScreen mode="CHANGE" onfinish={() => ui.go({ name: 'settings' })} oncancel={() => ui.go({ name: 'settings' })} />
  {:else if ui.screen.name === 'add'}
    {#key ui.screen.groupId}<AddRuleScreen groupId={ui.screen.groupId} />{/key}
  {:else if ui.screen.name === 'licenses'}
    {#key ui.screen.view}<LicensesScreen view={ui.screen.view} />{/key}
  {:else if ui.screen.name === 'settings'}
    <SettingsScreen {inTab} />
  {:else}
    <HomeScreen />
  {/if}
</main>

{#if ui.dialog?.name === 'unlock'}
  <UnlockDialog />
{:else if ui.dialog?.name === 'pause'}
  <PauseDialog />
{:else if ui.dialog?.name === 'rule'}
  {#key ui.dialog.ruleId}<RuleDialog ruleId={ui.dialog.ruleId} />{/key}
{:else if ui.dialog?.name === 'group'}
  <GroupDialog groupId={ui.dialog.groupId} thenAdd={ui.dialog.thenAdd ?? false} />
{/if}

{#if ui.snackbar}<div class="snackbar body-m" role="status">{ui.snackbar}</div>{/if}

{#if ui.error}
  <div class="error" role="alert">
    <strong>{i18n.t('errorTitle')}</strong>
    <pre>{ui.error}</pre>
  </div>
{/if}

<style>
  main { width: 380px; min-height: 480px; }
  main.tab { width: auto; max-width: 480px; margin: 0 auto; }
  .snackbar {
    position: fixed; left: 12px; right: 12px; bottom: 84px; z-index: 20; padding: 14px 16px;
    background: var(--inverse-surface); color: var(--inverse-on-surface); border-radius: 4px;
    box-shadow: 0 3px 8px rgb(0 0 0 / .3);
  }
  .error { position: fixed; inset: auto 8px 8px; z-index: 30; padding: 12px; border-radius: var(--radius-m); background: var(--error-container); color: var(--on-error-container); }
  .error pre { white-space: pre-wrap; font-size: 11px; margin: 4px 0 0; max-height: 160px; overflow: auto; }
</style>
