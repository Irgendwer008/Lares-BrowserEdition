<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Main screen (Android: HomeScreen): status card, setup issues, groups, single rules, "Add". -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { SETUP_ISSUE_REQUIRED, SetupRequirements, type SetupIssue } from '@/core/data/setupRequirements';
  import type { Rule, RuleGroup } from '@/core/policy/rule';
  import Button from '@/lib/ui/Button.svelte';
  import Icon from '@/lib/ui/Icon.svelte';
  import IconButton from '@/lib/ui/IconButton.svelte';
  import LetterIcon from '@/lib/ui/LetterIcon.svelte';
  import Switch from '@/lib/ui/Switch.svelte';
  import UsageBar from '@/lib/ui/UsageBar.svelte';
  import Wordmark from '@/lib/ui/Wordmark.svelte';
  import { ADDONS_URL, grantedPermissions, isFirefox, openExtensionDetails, requestHostAccess } from '@/platform/permissions';
  import { formatClock, ui, useModel } from '../ui.svelte';

  const model = useModel();
  const repo = model.services.rules;

  let issues = $state<SetupIssue[]>([]);
  async function refreshIssues() {
    issues = SetupRequirements.missing(model.state.settings, await grantedPermissions());
  }
  void refreshIssues();

  let expanded = $state<Set<number>>(new Set());
  function toggle(id: number) {
    const next = new Set(expanded);
    if (!next.delete(id)) next.add(id);
    expanded = next;
  }

  const websites = $derived(model.rules.filter((r) => r.type === 'WEBSITE'));
  const singles = $derived(websites.filter((r) => r.groupId === null || !model.groups.some((g) => g.id === r.groupId)));
  const membersOf = (g: RuleGroup) => websites.filter((r) => r.groupId === g.id);

  function limitText(limit: number | null, perGroup = false): string {
    if (limit === null) return i18n.t('ruleAlwaysBlocked');
    return perGroup ? i18n.t('groupLimitMinutes', limit) : i18n.t('ruleLimitMinutes', limit);
  }

  function setRuleEnabled(rule: Rule, enabled: boolean) {
    void ui.guarded(() => repo.setEnabled(rule.id, enabled));
  }

  function setGroupEnabled(group: RuleGroup, enabled: boolean) {
    void ui.guarded(() => repo.setGroupEnabled(group.id, enabled));
  }

  async function openDetails(e: MouseEvent) {
    e.preventDefault();
    if ((await openExtensionDetails()) === 'copied') ui.snack(i18n.t('issueAddonsCopied'));
    else window.close();
  }

  async function allowHost() {
    if (await requestHostAccess()) await refreshIssues();
  }
</script>

<header class="top">
  <Wordmark height={30} />
  <IconButton icon="settings" label={i18n.t('menuSettings')} onclick={() => ui.go({ name: 'settings' })} />
</header>

<div class="content">
  <!-- Status -->
  <section class="status">
    {#if model.pauseMillis > 0}
      <div class="status-head"><Icon name="pause" /><h2 class="title-m">{i18n.t('homeStatusPausedTitle')}</h2></div>
      <p class="body-m">{i18n.t('homeTimeLeft', [formatClock(model.pauseMillis)])}</p>
      <div class="actions"><Button onclick={() => model.services.unlock.endPause()}>{i18n.t('homeEndPause')}</Button></div>
    {:else if model.isUnlocked}
      <div class="status-head"><Icon name="lockOpen" /><h2 class="title-m">{i18n.t('unlockedLeft', [formatClock(model.unlockedMillis)])}</h2></div>
      <p class="body-m">{i18n.t('homeStatusUnlockedBody')}</p>
      <div class="actions">
        <Button onclick={() => model.services.unlock.lock()}>{i18n.t('homeLock')}</Button>
        <Button variant="outlined" onclick={() => ui.open({ name: 'pause' })}>{i18n.t('homePause')}</Button>
      </div>
    {:else}
      <div class="status-head"><Icon name="lock" /><h2 class="title-m">{i18n.t('homeStatusProtectedTitle')}</h2></div>
      <p class="body-m">{i18n.t('homeStatusProtectedBody')}</p>
      <div class="actions"><Button onclick={() => ui.open({ name: 'unlock' })}>{i18n.t('homeUnlock')}</Button></div>
    {/if}
  </section>

  <!-- Setup issues (required first, then recommendations) -->
  {#each issues as issue (issue)}
    <section class="issue" class:required={SETUP_ISSUE_REQUIRED[issue]}>
      <div class="status-head"><Icon name="warning" /><h2 class="title-s">{issue === 'INCOGNITO_ACCESS' ? i18n.t('issueIncognitoTitle') : i18n.t('issueHostTitle')}</h2></div>
      {#if issue === 'INCOGNITO_ACCESS'}
        <p class="body-m">{i18n.t('issueIncognitoBody')}</p>
        <p class="body-m">
          {#if isFirefox}
            {i18n.t('issueIncognitoFirefoxBefore')}<a href={ADDONS_URL} onclick={openDetails}>about:addons</a>{i18n.t('issueIncognitoFirefoxAfter')}
          {:else}
            {i18n.t('issueIncognitoChrome')}
          {/if}
        </p>
        <div class="actions">
          <Button variant="tonal" icon="openInNew" onclick={openDetails}>{isFirefox ? i18n.t('issueOpenAddons') : i18n.t('issueOpenDetails')}</Button>
        </div>
      {:else}
        <p class="body-m">{i18n.t('issueHostBody')}</p>
        <div class="actions"><Button variant="tonal" onclick={allowHost}>{i18n.t('issueHostAction')}</Button></div>
      {/if}
    </section>
  {/each}

  {#if websites.length === 0 && model.groups.length === 0}
    <section class="empty">
      <Icon name="shield" size={40} />
      <h2 class="title-m">{i18n.t('homeEmptyTitle')}</h2>
      <p class="body-m muted">{i18n.t('homeEmptyHint')}</p>
    </section>
  {/if}

  <!-- Groups -->
  {#if model.groups.length > 0}
    <h2 class="section-title title-s">{i18n.t('homeGroups')}</h2>
    {#each model.groups as group (group.id)}
      {@const members = membersOf(group)}
      {@const open = expanded.has(group.id)}
      <div class="card" class:off={!group.enabled}>
        <div class="card-head">
          <button class="expand" aria-expanded={open} aria-label={open ? i18n.t('groupCollapse') : i18n.t('groupExpand')} onclick={() => toggle(group.id)}>
            <span class="chevron" class:open><Icon name="expandMore" /></span>
          </button>
          <button class="card-main" onclick={() => toggle(group.id)}>
            <span class="title-m name">{group.name}</span>
            {#if group.limitMinutesPerDay !== null && group.enabled}
              <span class="usage-row">
                <UsageBar usedMillis={model.usedMillis('group', group.id)} limitMinutes={group.limitMinutesPerDay} />
                <span class="body-s muted">{i18n.t('groupMemberCount', members.length)}</span>
              </span>
            {:else}
              <span class="body-m muted">
                {group.enabled
                  ? i18n.t('groupSummary', [limitText(group.limitMinutesPerDay, true), i18n.t('groupMemberCount', members.length)])
                  : i18n.t('groupSummaryDisabled', [limitText(group.limitMinutesPerDay, true), i18n.t('groupMemberCount', members.length), i18n.t('ruleDisabled')])}
              </span>
            {/if}
          </button>
          <IconButton icon="settings" label={i18n.t('groupEdit')} onclick={() => ui.open({ name: 'group', groupId: group.id })} />
          <Switch checked={group.enabled} label={group.name} onchange={(v) => setGroupEnabled(group, v)} />
        </div>
        {#if open}
          <div class="members">
            {#if members.length === 0}<p class="body-m muted pad">{i18n.t('groupEmpty')}</p>{/if}
            {#each members as rule (rule.id)}
              <button class="member" onclick={() => ui.open({ name: 'rule', ruleId: rule.id })}>
                <LetterIcon target={rule.target} size={32} />
                <span class="body-l">{rule.target}</span>
              </button>
            {/each}
            <div class="member-actions">
              <Button variant="text" onclick={() => ui.go({ name: 'add', groupId: group.id })}>{i18n.t('groupAddMember')}</Button>
              <Button variant="text" onclick={() => ui.open({ name: 'group', groupId: group.id })}>{i18n.t('groupEdit')}</Button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  {/if}

  <!-- Single rules -->
  {#if singles.length > 0}
    <h2 class="section-title title-s">{i18n.t('homeSingleRules')}</h2>
    <div class="card list">
      {#each singles as rule (rule.id)}
        <div class="rule" class:off={!rule.enabled}>
          <button class="rule-main" onclick={() => ui.open({ name: 'rule', ruleId: rule.id })}>
            <LetterIcon target={rule.target} />
            <span class="rule-text">
              <span class="body-l name">{rule.target}</span>
              {#if rule.limitMinutesPerDay !== null && rule.enabled}
                <UsageBar usedMillis={model.usedMillis('rule', rule.id)} limitMinutes={rule.limitMinutesPerDay} />
              {:else}
                <span class="body-m muted">
                  {rule.enabled ? limitText(rule.limitMinutesPerDay) : i18n.t('ruleSupportingDisabled', [limitText(rule.limitMinutesPerDay), i18n.t('ruleDisabled')])}
                </span>
              {/if}
            </span>
          </button>
          <Switch checked={rule.enabled} label={rule.target} onchange={(v) => setRuleEnabled(rule, v)} />
        </div>
      {/each}
    </div>
  {/if}
  <div class="fab-space"></div>
</div>

<!-- Material 3 extended FAB (Android: ExtendedFloatingActionButton – primaryContainer). -->
<button class="fab label-l" onclick={() => ui.go({ name: 'add', groupId: null })}>
  <Icon name="add" />{i18n.t('homeAddRule')}
</button>

<style>
  .top { display: flex; align-items: center; justify-content: space-between; padding: 12px 8px 4px 16px; color: var(--on-surface); }
  .content { display: flex; flex-direction: column; gap: 8px; padding: 8px 12px 16px; }
  .status, .issue { border-radius: var(--radius-l); padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .status { background: var(--surface-container-highest); }
  .issue { background: var(--surface-container-high); }
  .issue.required { background: var(--error-container); color: var(--on-error-container); }
  .status-head { display: flex; align-items: center; gap: 12px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .issue a { color: inherit; font-weight: 600; text-decoration: underline; }
  .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 32px 16px; color: var(--primary); }
  .empty h2 { color: var(--on-surface); }
  .section-title { padding: 16px 8px 4px; }
  .card { border: 1px solid var(--outline-variant); border-radius: var(--radius-m); overflow: hidden; }
  .card-head { display: flex; align-items: center; gap: 4px; padding: 8px 8px 8px 4px; }
  button { background: none; border: 0; padding: 0; cursor: pointer; text-align: left; color: inherit; }
  .expand { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; flex: none; }
  .chevron { display: grid; transition: transform .15s; }
  .chevron.open { transform: rotate(180deg); }
  .card-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 4px 0; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .usage-row { display: flex; align-items: center; gap: 8px; }
  .off .name { color: var(--on-surface-variant); }
  .members { border-top: 1px solid var(--outline-variant); padding: 4px 0; }
  .member { display: flex; align-items: center; gap: 16px; width: 100%; padding: 8px 16px; }
  .member:hover, .rule-main:hover { background: color-mix(in srgb, var(--on-surface) 5%, transparent); }
  .member-actions { display: flex; gap: 4px; padding: 4px 8px; }
  .pad { padding: 8px 16px; }
  .list { display: flex; flex-direction: column; }
  .rule { display: flex; align-items: center; gap: 8px; padding-right: 12px; }
  .rule + .rule { border-top: 1px solid var(--outline-variant); }
  .rule-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 16px; padding: 12px 8px 12px 16px; }
  .rule-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .fab-space { height: 56px; }
  .fab {
    position: fixed; right: 16px; bottom: 16px; z-index: 3; display: flex; align-items: center; gap: 12px;
    height: 56px; padding: 0 20px 0 16px; border-radius: var(--radius-l); cursor: pointer;
    background: var(--primary-container); color: var(--on-primary-container);
    box-shadow: 0 1px 3px rgb(0 0 0 / .3), 0 4px 8px 3px rgb(0 0 0 / .15);
  }
  .fab:hover { background: color-mix(in srgb, var(--on-primary-container) 8%, var(--primary-container)); }
</style>
