<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Edit a rule (Android: rule dialog). Loosening (remove, disable, raise the limit) needs the code. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import Button from '@/lib/ui/Button.svelte';
  import Dialog from '@/lib/ui/Dialog.svelte';
  import Switch from '@/lib/ui/Switch.svelte';
  import LimitPicker from '../LimitPicker.svelte';
  import { ui, useModel } from '../ui.svelte';

  let { ruleId }: { ruleId: number } = $props();
  const model = useModel();
  const repo = model.services.rules;
  // svelte-ignore state_referenced_locally
  const rule = model.rules.find((r) => r.id === ruleId);
  const group = rule?.groupId == null ? undefined : model.groups.find((g) => g.id === rule.groupId);

  let enabled = $state(rule?.enabled ?? true);
  let limit = $state<number | null>(rule?.limitMinutesPerDay ?? null);
  let valid = $state(true);
  let groupChoice = $state<string>('');

  async function save() {
    if (!rule) return;
    const ok = await ui.guarded(async () => {
      if (!group) await repo.updateRule(rule.id, limit, enabled);
      if (groupChoice !== '') await repo.setGroup(rule.id, Number(groupChoice));
    });
    if (ok) ui.close();
  }

  async function remove() {
    if (rule && (await ui.guarded(() => repo.remove(rule.id)))) ui.close();
  }

  async function takeOut() {
    if (rule && (await ui.guarded(() => repo.setGroup(rule.id, null)))) ui.close();
  }
</script>

{#if rule}
  <Dialog title={rule.target} onclose={() => ui.close()}>
    {#if group}
      <p>{i18n.t('memberInfo', [group.name, group.limitMinutesPerDay === null ? i18n.t('ruleAlwaysBlocked') : i18n.t('groupLimitMinutes', group.limitMinutesPerDay)])}</p>
      <div><Button variant="outlined" onclick={takeOut}>{i18n.t('memberTakeOut')}</Button></div>
    {:else}
      <div class="row on-surface">
        <span class="body-l">{i18n.t('ruleDialogEnabled')}</span>
        <Switch checked={enabled} label={i18n.t('ruleDialogEnabled')} onchange={(v) => (enabled = v)} />
      </div>
      <LimitPicker bind:value={limit} bind:valid />
      {#if model.groups.length > 0}
        <label class="select on-surface">
          <span class="body-s muted">{i18n.t('ruleAddToGroup')}</span>
          <select bind:value={groupChoice}>
            <option value="">{i18n.t('noGroup')}</option>
            {#each model.groups as g (g.id)}<option value={String(g.id)}>{g.name}</option>{/each}
          </select>
        </label>
      {/if}
      <p class="body-s">{i18n.t('ruleDialogHint')}</p>
    {/if}
    {#snippet actions()}
      <Button variant="danger" icon="delete" onclick={remove}>{i18n.t('ruleDialogRemove')}</Button>
      <span class="spacer"></span>
      {#if !group}<Button disabled={!valid} onclick={save}>{i18n.t('ruleDialogSave')}</Button>{/if}
    {/snippet}
  </Dialog>
{/if}

<style>
  .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .on-surface { color: var(--on-surface); }
  .select { display: flex; flex-direction: column; gap: 4px; }
  select { height: 44px; border-radius: 4px; border: 1px solid var(--outline); background: transparent; padding: 0 12px; color: var(--on-surface); }
  select option { background: var(--surface-container-high); }
  .spacer { flex: 1; }
</style>
