<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Guardian code entry (Android: UnlockDialog): password, authenticator code or recovery code. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { UnlockManager } from '@/core/unlock/unlockManager';
  import Button from '@/lib/ui/Button.svelte';
  import Dialog from '@/lib/ui/Dialog.svelte';
  import TextField from '@/lib/ui/TextField.svelte';
  import { formatClock, ui, useModel } from '../ui.svelte';

  const model = useModel();
  let code = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);
  let lockoutEnd = $state(0);

  const minutes = UnlockManager.UNLOCKED_DURATION_MILLIS / 60_000;
  const waitLeft = $derived(Math.max(0, lockoutEnd - model.now));

  $effect(() => {
    if (lockoutEnd > 0 && waitLeft === 0) {
      lockoutEnd = 0;
      error = i18n.t('unlockCanRetry');
    }
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    try {
      const result = await model.services.unlock.unlock(code);
      code = '';
      switch (result.kind) {
        case 'success':
          // The recovery code forces a new guardian code; the setup screen opens by itself.
          await ui.unlocked();
          return;
        case 'wrong':
          if (result.lockoutMillis > 0) {
            lockoutEnd = Date.now() + result.lockoutMillis;
            error = i18n.t('unlockErrorWait', [formatClock(result.lockoutMillis)]);
          } else error = i18n.t('unlockErrorWrong', result.attemptsLeft);
          return;
        case 'lockedOut':
          lockoutEnd = Date.now() + result.remainingMillis;
          error = i18n.t('unlockErrorLocked', [formatClock(result.remainingMillis)]);
          return;
        case 'notSetUp':
          await ui.unlocked();
      }
    } finally {
      busy = false;
    }
  }

  function close() {
    ui.cancelPending();
    ui.close();
  }
</script>

<Dialog title={i18n.t('unlockTitle')} icon="key" onclose={close}>
  <p>{i18n.t('unlockBody', minutes)}</p>
  <form id="unlock-form" onsubmit={submit}>
    <TextField
      label={i18n.t('unlockCodeLabel')}
      secret
      bind:value={code}
      autofocus
      error={waitLeft > 0 ? i18n.t('unlockErrorLocked', [formatClock(waitLeft)]) : error}
    />
  </form>
  {#snippet actions()}
    <Button variant="text" onclick={close}>{i18n.t('cancel')}</Button>
    <Button type="submit" disabled={busy || code.length === 0 || waitLeft > 0} onclick={() => (document.getElementById('unlock-form') as HTMLFormElement).requestSubmit()}>{i18n.t('unlockSubmit')}</Button>
  {/snippet}
</Dialog>
