<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Create / edit a group (Android: group dialog). Raising the limit or deleting needs the code. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import Button from '@/lib/ui/Button.svelte';
  import Dialog from '@/lib/ui/Dialog.svelte';
  import TextField from '@/lib/ui/TextField.svelte';
  import LimitPicker from '../LimitPicker.svelte';
  import { ui, useModel } from '../ui.svelte';

  /** `thenAdd`: after creating the group, continue with adding websites to it. */
  let { groupId, thenAdd = false }: { groupId: number | null; thenAdd?: boolean } = $props();
  const model = useModel();
  const repo = model.services.rules;
  // svelte-ignore state_referenced_locally
  const group = groupId === null ? undefined : model.groups.find((g) => g.id === groupId);

  let name = $state(group?.name ?? '');
  let limit = $state<number | null>(group ? group.limitMinutesPerDay : 30);
  let valid = $state(true);

  async function save() {
    const trimmed = name.trim();
    if (group) {
      if (await ui.guarded(() => repo.updateGroup({ ...group, name: trimmed, limitMinutesPerDay: limit }))) ui.close();
    } else {
      const id = await repo.createGroup(trimmed, limit);
      // ui.go also closes the dialog.
      if (thenAdd) ui.go({ name: 'add', groupId: id });
      else ui.close();
    }
  }

  async function remove() {
    if (group && (await ui.guarded(() => repo.deleteGroup(group.id)))) ui.close();
  }
</script>

<Dialog title={group ? i18n.t('groupEdit') : i18n.t('groupNewTitle')} onclose={() => ui.close()}>
  <TextField label={i18n.t('groupNameLabel')} placeholder={i18n.t('groupNameHint')} bind:value={name} autofocus={!group} />
  <LimitPicker bind:value={limit} bind:valid />
  <p class="body-s">{i18n.t('groupExplanation')}</p>
  {#snippet actions()}
    {#if group}<Button variant="danger" icon="delete" onclick={remove}>{i18n.t('groupDelete')}</Button>{/if}
    <span class="spacer"></span>
    <Button disabled={!valid || name.trim() === ''} onclick={save}>{i18n.t('ruleDialogSave')}</Button>
  {/snippet}
</Dialog>

<style>
  .spacer { flex: 1; }
</style>
