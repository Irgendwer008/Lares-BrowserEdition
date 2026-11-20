<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Guardian code setup (Android: SetupScreen). Modes: FIRST (welcome first), RECOVERY (after the
  recovery code was used), CHANGE (from the settings, while unlocked). Steps: method → password or
  authenticator → recovery code → done.
-->
<script lang="ts">
  import { i18n } from '#i18n';
  import { renderSVG } from 'uqr';
  import { CodeRequiredError } from '@/core/data/appState';
  import { UnlockManager, type TotpSetup } from '@/core/unlock/unlockManager';
  import Button from '@/lib/ui/Button.svelte';
  import OptionCard from '@/lib/ui/OptionCard.svelte';
  import TextField from '@/lib/ui/TextField.svelte';
  import Wordmark from '@/lib/ui/Wordmark.svelte';
  import { ui, useModel } from '../ui.svelte';

  let { mode, onfinish, oncancel }: { mode: 'FIRST' | 'RECOVERY' | 'CHANGE'; onfinish: () => void; oncancel?: () => void } = $props();
  const model = useModel();
  const unlock = model.services.unlock;

  type Step = 'intro' | 'method' | 'password' | 'totp' | 'recovery';
  // svelte-ignore state_referenced_locally
  let step = $state<Step>(mode === 'FIRST' ? 'intro' : 'method');
  let busy = $state(false);

  // Password
  let password = $state('');
  let repeat = $state('');
  let passwordError = $state<string | null>(null);
  let repeatError = $state<string | null>(null);

  // Authenticator
  let totp = $state<TotpSetup | null>(null);
  let totpCode = $state('');
  let totpError = $state<string | null>(null);

  // Recovery code
  let recovery = $state('');
  let stored = $state(false);
  let notAllowed = $state(false);

  async function run(action: () => Promise<void>) {
    busy = true;
    try {
      await action();
    } catch (e) {
      // Unlocked mode ran out during a change / recovery: the code is needed again.
      if (e instanceof CodeRequiredError) notAllowed = true;
      else throw e;
    } finally {
      busy = false;
    }
  }

  function startTotp() {
    totp = unlock.beginTotpSetup('Browser');
    totpCode = '';
    totpError = null;
    step = 'totp';
  }

  async function savePassword(e: SubmitEvent) {
    e.preventDefault();
    passwordError = password.length < UnlockManager.MIN_PASSWORD_LENGTH ? i18n.t('setupPasswordTooShort', UnlockManager.MIN_PASSWORD_LENGTH) : null;
    repeatError = !passwordError && password !== repeat ? i18n.t('setupPasswordMismatch') : null;
    if (passwordError || repeatError) return;
    await run(async () => {
      recovery = await unlock.setupPassword(password);
      password = repeat = '';
      step = 'recovery';
    });
  }

  async function confirmTotp(e: SubmitEvent) {
    e.preventDefault();
    await run(async () => {
      const code = await unlock.confirmTotpSetup(totp!, totpCode);
      if (code === null) {
        totpError = i18n.t('setupTotpWrong');
        return;
      }
      totp = null;
      recovery = code;
      step = 'recovery';
    });
  }

  async function copyRecovery() {
    await navigator.clipboard.writeText(recovery);
    ui.snack(i18n.t('setupRecoveryCopied'));
  }

  function saveRecovery() {
    const created = new Date().toLocaleString();
    const text = i18n.t('recoveryFileContent', [recovery, created]);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'lares-recovery-code.txt' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function finish() {
    await run(async () => {
      await unlock.completeSetup();
      onfinish();
    });
  }

  const qr = $derived(totp ? renderSVG(totp.provisioningUri, { border: 2 }) : '');
</script>

<div class="setup">
  {#if step === 'intro'}
    <div class="brand"><Wordmark height={64} /></div>
    <p class="title-m muted">{i18n.t('homeTagline')}</p>
    <h1 class="headline">{i18n.t('setupIntroTitle')}</h1>
    <p class="body-l pre">{i18n.t('setupIntroBody')}</p>
    <Button full onclick={() => (step = 'method')}>{i18n.t('setupIntroStart')}</Button>
  {:else if step === 'method'}
    {#if mode === 'RECOVERY'}<p class="notice body-m">{i18n.t('setupReSetupNotice')}</p>{/if}
    {#if mode === 'CHANGE'}<p class="notice body-m">{i18n.t('setupChangeNotice')}</p>{/if}
    <h1 class="headline">{i18n.t('setupMethodTitle')}</h1>
    <p class="body-l">{i18n.t('setupMethodBody')}</p>
    <OptionCard title={i18n.t('setupMethodPasswordTitle')} description={i18n.t('setupMethodPasswordDesc')} onclick={() => (step = 'password')} />
    <OptionCard title={i18n.t('setupMethodTotpTitle')} description={i18n.t('setupMethodTotpDesc')} onclick={startTotp} />
    <div class="row">
      {#if mode === 'FIRST'}<Button variant="text" onclick={() => (step = 'intro')}>{i18n.t('back')}</Button>{/if}
      {#if mode === 'CHANGE'}<Button variant="text" onclick={() => oncancel?.()}>{i18n.t('cancel')}</Button>{/if}
    </div>
  {:else if step === 'password'}
    <h1 class="headline">{i18n.t('setupPasswordTitle')}</h1>
    <form onsubmit={savePassword}>
      <TextField label={i18n.t('setupPasswordLabel')} secret bind:value={password} error={passwordError} autofocus />
      <TextField label={i18n.t('setupPasswordRepeatLabel')} secret bind:value={repeat} error={repeatError} />
      <div class="row">
        <Button variant="text" onclick={() => (step = 'method')}>{i18n.t('back')}</Button>
        <Button type="submit" disabled={busy}>{i18n.t('setupContinue')}</Button>
      </div>
    </form>
  {:else if step === 'totp' && totp}
    <h1 class="headline">{i18n.t('setupTotpTitle')}</h1>
    <p class="body-m">{i18n.t('setupTotpBody')}</p>
    <div class="qr" role="img" aria-label={i18n.t('setupTotpQrDescription')}>{@html qr}</div>
    <p class="body-s muted">{i18n.t('setupTotpManual')}</p>
    <code class="secret">{totp.secretBase32.replace(/(.{4})/g, '$1 ').trim()}</code>
    <form onsubmit={confirmTotp}>
      <TextField label={i18n.t('setupTotpCodeLabel')} bind:value={totpCode} inputmode="numeric" maxlength={6} error={totpError} secret />
      <div class="row">
        <Button variant="text" onclick={() => (step = 'method')}>{i18n.t('back')}</Button>
        <Button type="submit" disabled={busy || totpCode.trim().length < 6}>{i18n.t('setupTotpConfirm')}</Button>
      </div>
    </form>
  {:else if step === 'recovery'}
    <h1 class="headline">{i18n.t('setupRecoveryTitle')}</h1>
    <p class="body-m">{i18n.t('setupRecoveryBody')}</p>
    <code class="recovery">{recovery}</code>
    <div class="row start">
      <Button variant="tonal" icon="copy" onclick={copyRecovery}>{i18n.t('setupRecoveryCopy')}</Button>
      <Button variant="tonal" icon="download" onclick={saveRecovery}>{i18n.t('setupRecoverySave')}</Button>
    </div>
    <p class="body-s muted">{i18n.t('setupRecoveryExportWarning')}</p>
    <label class="check body-m">
      <input type="checkbox" bind:checked={stored} />
      {i18n.t('setupRecoveryConfirm')}
    </label>
    {#if notAllowed}<p class="body-m error-text">{i18n.t('setupUnlockExpired')}</p>{/if}
    <Button full disabled={!stored || busy} onclick={finish}>{i18n.t('setupFinish')}</Button>
  {/if}
</div>

<style>
  .setup { display: flex; flex-direction: column; gap: 16px; padding: 24px 20px; }
  .brand { color: var(--on-surface); margin-top: 8px; }
  .pre { white-space: pre-line; }
  .notice { background: var(--secondary-container); color: var(--on-secondary-container); padding: 12px 16px; border-radius: var(--radius-m); }
  form { display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
  .row.start { justify-content: flex-start; flex-wrap: wrap; }
  .qr { width: 200px; align-self: center; background: #fff; padding: 4px; border-radius: var(--radius-s); }
  .qr :global(svg) { display: block; width: 100%; height: auto; }
  .secret, .recovery {
    font-family: ui-monospace, "Cascadia Mono", Menlo, monospace; background: var(--surface-container-high);
    border-radius: var(--radius-s); padding: 12px; text-align: center; word-break: break-all; user-select: all;
  }
  .secret { font-size: 13px; }
  .recovery { font-size: 18px; letter-spacing: 1px; }
  .check { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
  .check input { width: 18px; height: 18px; accent-color: var(--primary); margin: 1px 0 0; flex: none; }
</style>
