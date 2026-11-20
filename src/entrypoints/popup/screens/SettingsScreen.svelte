<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Settings (Android: SettingsScreen): guardian code, blocking, backup, about. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { BackupCodec } from '@/core/data/backup';
  import { resetScheduleOf } from '@/core/data/appState';
  import Button from '@/lib/ui/Button.svelte';
  import Icon from '@/lib/ui/Icon.svelte';
  import type { IconName } from '@/lib/ui/icons';
  import Switch from '@/lib/ui/Switch.svelte';
  import TopBar from '@/lib/ui/TopBar.svelte';
  import TimeField from '@/lib/ui/TimeField.svelte';
  import { formatMinuteOfDay } from '@/lib/timeFormat';
  import { ui, useModel } from '../ui.svelte';

  let { inTab }: { inTab: boolean } = $props();
  const model = useModel();
  const settingsRepo = model.services.settings;
  const settings = $derived(model.state.settings);
  const schedule = $derived(resetScheduleOf(settings));

  /** Bumped when a change wasn't applied (needs the code), so the field shows the stored time again. */
  let resetKey = $state(0);

  const hasTotpPackage = $derived(model.state.unlock.method === 'TOTP' && model.state.unlock.totpTransfer !== null);
  let importInput: HTMLInputElement | undefined = $state();
  let showAbout = $state(false);
  const SOURCE_URL = 'https://github.com/Irgendwer008/Lares-BrowserEdition';

  function changeCode() {
    ui.whenUnlocked(model.isUnlocked, () => ui.go({ name: 'changeCode' }));
  }

  async function setResetTime(minuteOfDay: number) {
    if (!(await ui.guarded(() => settingsRepo.setResetTime(minuteOfDay)))) resetKey++;
  }

  async function exportRules() {
    const backup = await model.services.rules.exportBackup();
    if (backup.rules.length === 0 && backup.groups.length === 0) {
      ui.snack(i18n.t('backupExportEmpty'));
      return;
    }
    const withTotp = settings.exportIncludesTotp && hasTotpPackage ? { ...backup, guardianTotp: model.state.unlock.totpTransfer } : backup;
    const url = URL.createObjectURL(new Blob([BackupCodec.encode(withTotp)], { type: 'application/json' }));
    const date = new Date().toISOString().slice(0, 10);
    Object.assign(document.createElement('a'), { href: url, download: `lares-rules-${date}.json` }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    ui.snack(i18n.t('backupExported'));
  }

  function startImport() {
    // In the popup the file picker would close the popup (and lose the file): continue in a tab.
    if (!inTab) void browser.tabs.create({ url: browser.runtime.getURL('/popup.html?tab=settings') });
    else importInput?.click();
  }

  async function importFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const result = await model.services.rules.importBackup(BackupCodec.decode(await file.text()));
      ui.snack(
        i18n.t('backupImported', [
          i18n.t('backupImportedRules', result.rulesAdded),
          i18n.t('backupImportedGroups', result.groupsAdded),
          i18n.t('backupImportedSkipped', result.skipped),
        ]),
      );
    } catch {
      ui.snack(i18n.t('backupImportFailed'));
    } finally {
      if (importInput) importInput.value = '';
    }
  }
</script>

{#snippet row(icon: IconName, title: string, description: string | null, onclick: (() => void) | null)}
  <svelte:element this={onclick ? 'button' : 'div'} class="row" role={onclick ? undefined : 'group'} onclick={onclick ?? undefined}>
    <Icon name={icon} />
    <span class="text">
      <span class="body-l">{title}</span>
      {#if description}<span class="body-m muted">{description}</span>{/if}
    </span>
  </svelte:element>
{/snippet}

<TopBar title={i18n.t('settingsTitle')} onback={() => ui.go({ name: 'home' })} />

<div class="content">
  <p class="hint body-m">{i18n.t('settingsLockedHint')}</p>

  <h2 class="section title-s">{i18n.t('settingsGroupGuardian')}</h2>
  {@render row('key', i18n.t('settingsGuardianCode'), model.state.unlock.method === 'TOTP' ? i18n.t('setupMethodTotpTitle') : i18n.t('setupMethodPasswordTitle'), changeCode)}

  <h2 class="section title-s">{i18n.t('settingsGroupBlocking')}</h2>
  <div class="row">
    <Icon name="schedule" />
    <span class="text">
      <span class="body-l">{i18n.t('settingsResetTime')}</span>
      <span class="body-m muted">
        {schedule.pending
          ? i18n.t('settingsResetTimePending', [formatMinuteOfDay(schedule.resetTime), formatMinuteOfDay(schedule.pending.resetTime)])
          : i18n.t('settingsResetTimeExplanation')}
      </span>
    </span>
    {#key resetKey}<TimeField value={settings.pendingResetMinuteOfDay ?? settings.resetMinuteOfDay} label={i18n.t('settingsResetTime')} onchange={setResetTime} />{/key}
  </div>
  <div class="row">
    <Icon name="timer" />
    <span class="text">
      <span class="body-l">{i18n.t('settingsLimitTimer')}</span>
      <span class="body-m muted">{i18n.t('settingsLimitTimerDesc')}</span>
    </span>
    <Switch checked={settings.limitTimer} label={i18n.t('settingsLimitTimer')} onchange={(v) => ui.guarded(() => settingsRepo.setLimitTimer(v))} />
  </div>
  <div class="row">
    <Icon name="notifications" />
    <span class="text">
      <span class="body-l">{i18n.t('settingsWarnFive')}</span>
      <span class="body-m muted">{i18n.t('settingsWarnDesc')}</span>
    </span>
    <Switch checked={settings.warnFiveMinutes} label={i18n.t('settingsWarnFive')} onchange={(v) => ui.guarded(() => settingsRepo.setWarnings(v, settings.warnOneMinute))} />
  </div>
  <div class="row">
    <span class="icon-space"></span>
    <span class="text"><span class="body-l">{i18n.t('settingsWarnOne')}</span></span>
    <Switch checked={settings.warnOneMinute} label={i18n.t('settingsWarnOne')} onchange={(v) => ui.guarded(() => settingsRepo.setWarnings(settings.warnFiveMinutes, v))} />
  </div>

  <h2 class="section title-s">{i18n.t('settingsGroupBackup')}</h2>
  {@render row('upload', i18n.t('backupExport'), hasTotpPackage && settings.exportIncludesTotp ? i18n.t('backupExportDesc') : i18n.t('backupExportDescNoTotp'), exportRules)}
  {#if model.state.unlock.method === 'TOTP'}
    <div class="row">
      <span class="icon-space"></span>
      <span class="text">
        <span class="body-l">{i18n.t('backupIncludeTotp')}</span>
        <span class="body-m muted">{hasTotpPackage ? i18n.t('backupIncludeTotpDesc') : i18n.t('backupIncludeTotpUnavailable')}</span>
      </span>
      <Switch checked={settings.exportIncludesTotp && hasTotpPackage} disabled={!hasTotpPackage} label={i18n.t('backupIncludeTotp')} onchange={(v) => settingsRepo.setExportIncludesTotp(v)} />
    </div>
  {/if}
  {@render row('download', i18n.t('backupImport'), inTab ? i18n.t('backupImportDesc') : `${i18n.t('backupImportDesc')} ${i18n.t('importOpenTab')}`, startImport)}
  <input bind:this={importInput} type="file" accept="application/json,.json" hidden onchange={importFile} />

  <h2 class="section title-s">{i18n.t('settingsGroupApp')}</h2>
  {@render row('info', i18n.t('aboutTitle'), i18n.t('aboutVersion', [browser.runtime.getManifest().version]), () => (showAbout = !showAbout))}
  {#if showAbout}
    <div class="about">
      <p class="body-m muted">{i18n.t('aboutBody')}</p>
      <a class="body-m" href={SOURCE_URL} target="_blank" rel="noreferrer">{i18n.t('librariesSource')}: {SOURCE_URL.replace('https://', '')}</a>
    </div>
  {/if}
  {@render row('privacyTip', i18n.t('privacyTitle'), i18n.t('privacySummary'), null)}
  {@render row('description', i18n.t('licenseTitle'), i18n.t('licenseSummary'), () => ui.go({ name: 'licenses', view: 'license' }))}
  {@render row('code', i18n.t('librariesTitle'), i18n.t('librariesSummary'), () => ui.go({ name: 'licenses', view: 'libraries' }))}
</div>

<style>
  .content { display: flex; flex-direction: column; padding: 0 0 24px; }
  .hint { margin: 4px 16px 8px; background: var(--surface-container-high); padding: 12px 16px; border-radius: var(--radius-m); color: var(--on-surface-variant); }
  .section { color: var(--primary); padding: 16px 16px 4px; }
  .row {
    display: flex; align-items: center; gap: 16px; padding: 12px 16px; width: 100%; text-align: left;
    border: 0; background: none; color: var(--on-surface); font: inherit;
  }
  .row :global(svg) { color: var(--on-surface-variant); }
  button.row { cursor: pointer; }
  button.row:hover { background: color-mix(in srgb, var(--on-surface) 5%, transparent); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .icon-space { width: 24px; flex: none; }
  .about { padding: 0 16px 8px 56px; white-space: pre-line; display: flex; flex-direction: column; gap: 8px; }
  .about a { color: var(--primary); font-weight: 500; overflow-wrap: anywhere; }
</style>
