<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Add rules (Android: AddRuleScreen): templates, a single website, or a new group. -->
<script lang="ts">
  import { i18n } from '#i18n';
  import { tick } from 'svelte';
  import { RuleTemplates, templateTargets, type RuleTemplate } from '@/core/policy/ruleTemplates';
  import Button from '@/lib/ui/Button.svelte';
  import LetterIcon from '@/lib/ui/LetterIcon.svelte';
  import TextField from '@/lib/ui/TextField.svelte';
  import TopBar from '@/lib/ui/TopBar.svelte';
  import LimitPicker from '../LimitPicker.svelte';
  import { ui, useModel } from '../ui.svelte';

  let { groupId }: { groupId: number | null } = $props();
  const model = useModel();
  const repo = model.services.rules;
  // svelte-ignore state_referenced_locally
  const group = groupId === null ? undefined : model.groups.find((g) => g.id === groupId);

  type Tab = 'templates' | 'website' | 'group';
  let tab = $state<Tab>('templates');
  const tabs: Tab[] = group ? ['templates', 'website'] : ['templates', 'website', 'group'];

  // Website
  let website = $state('');
  let websiteError = $state<string | null>(null);
  let limit = $state<number | null>(null);
  let limitValid = $state(true);

  // Templates
  let selected = $state<RuleTemplate | null>(null);
  let asGroup = $state(true);
  let templateLimit = $state<number | null>(30);
  let templateLimitValid = $state(true);

  const tabLabel = (t: Tab) => (t === 'templates' ? i18n.t('addRuleTabTemplates') : t === 'website' ? i18n.t('addRuleTabWebsite') : i18n.t('addRuleTabGroup'));
  const groupLimitText = $derived(group ? (group.limitMinutesPerDay === null ? i18n.t('ruleAlwaysBlocked') : i18n.t('groupLimitMinutes', group.limitMinutesPerDay)) : '');

  async function addWebsite(e: SubmitEvent) {
    e.preventDefault();
    const result = await repo.add('WEBSITE', website, group ? null : limit, groupId);
    if (result.kind === 'invalidTarget') websiteError = i18n.t('addRuleInvalid');
    else if (result.kind === 'duplicate') websiteError = group ? i18n.t('addRuleDuplicateInGroup') : i18n.t('addRuleDuplicate');
    else ui.go({ name: 'home' });
  }

  /** Opens a template's options and scrolls so the whole entry (with its options) is in view. */
  async function select(t: RuleTemplate) {
    selected = selected?.id === t.id ? null : t;
    if (selected === null) return;
    await tick();
    document.getElementById(`template-${t.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function addTemplate() {
    if (!selected) return;
    const targets = templateTargets(selected);
    if (group) await repo.addAll(targets, null, group.id);
    else if (asGroup) await repo.createGroupWith(selected.name, templateLimit, targets);
    else await repo.addAll(targets, templateLimit);
    ui.go({ name: 'home' });
  }
</script>

<TopBar title={group ? i18n.t('addRuleToGroupTitle', [group.name]) : i18n.t('addRuleTitle')} onback={() => ui.go({ name: 'home' })} />

<div class="tabs" role="tablist">
  {#each tabs as t (t)}
    <button role="tab" aria-selected={tab === t} class:active={tab === t} onclick={() => (tab = t)}>{tabLabel(t)}</button>
  {/each}
</div>

<div class="content">
  {#if group}<p class="note body-m">{i18n.t('addRuleGroupHint', [groupLimitText])}</p>{/if}

  {#if tab === 'templates'}
    <p class="body-m muted">{i18n.t('addRuleTemplatesIntro')}</p>
    <div class="templates">
      {#each RuleTemplates.all as t (t.id)}
        <div class="template" id="template-{t.id}" class:open={selected?.id === t.id}>
          <button class="template-head" onclick={() => select(t)}>
            <LetterIcon target={t.websites[0]!} />
            <span class="template-text">
              <span class="body-l">{t.name}</span>
              <span class="body-s muted">{t.websites.join(', ')}</span>
            </span>
          </button>
          {#if selected?.id === t.id}
            <div class="template-config">
              {#if !group}
                <label class="check body-m">
                  <input type="checkbox" bind:checked={asGroup} />
                  <span>{i18n.t('addRuleTemplateAsGroup')}</span>
                </label>
                <p class="body-s muted">{asGroup ? i18n.t('addRuleTemplateGroupNote') : i18n.t('addRuleTemplateLimitNote')}</p>
                <LimitPicker bind:value={templateLimit} bind:valid={templateLimitValid} />
              {/if}
              <div class="end"><Button disabled={!templateLimitValid} onclick={addTemplate}>{i18n.t('addRuleAdd')}</Button></div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else if tab === 'website'}
    <form onsubmit={addWebsite}>
      <TextField label={i18n.t('addRuleWebsiteLabel')} placeholder={i18n.t('addRuleWebsiteHint')} bind:value={website} inputmode="url" error={websiteError} autofocus />
      {#if !group}<LimitPicker bind:value={limit} bind:valid={limitValid} />{/if}
      <div class="end"><Button type="submit" disabled={website.trim() === '' || !limitValid}>{i18n.t('addRuleAdd')}</Button></div>
    </form>
  {:else}
    <p class="body-m muted">{i18n.t('groupExplanation')}</p>
    <div><Button icon="add" onclick={() => ui.open({ name: 'group', groupId: null, thenAdd: true })}>{i18n.t('addRuleGroupCreate')}</Button></div>
  {/if}
</div>

<style>
  .tabs { display: flex; border-bottom: 1px solid var(--outline-variant); position: sticky; top: 56px; background: var(--surface); z-index: 2; }
  .tabs button {
    flex: 1; height: 44px; border: 0; background: none; cursor: pointer; color: var(--on-surface-variant);
    font-weight: 500; border-bottom: 3px solid transparent; padding: 0 8px;
  }
  .tabs .active { color: var(--primary); border-bottom-color: var(--primary); }
  .content { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
  .note { background: var(--secondary-container); color: var(--on-secondary-container); padding: 12px 16px; border-radius: var(--radius-m); }
  .templates { display: flex; flex-direction: column; border: 1px solid var(--outline-variant); border-radius: var(--radius-m); overflow: hidden; }
  .template + .template { border-top: 1px solid var(--outline-variant); }
  /* Keep scrolled-to entries clear of the sticky top bar + tabs. */
  .template { scroll-margin-top: 108px; scroll-margin-bottom: 16px; }
  .template.open { background: var(--surface-container-low); --field-bg: var(--surface-container-low); }
  .template-head { display: flex; align-items: center; gap: 16px; width: 100%; padding: 10px 16px; border: 0; background: none; cursor: pointer; text-align: left; color: inherit; }
  .template-head:hover { background: color-mix(in srgb, var(--on-surface) 5%, transparent); }
  .template-text { display: flex; flex-direction: column; min-width: 0; }
  .template-config { display: flex; flex-direction: column; gap: 8px; padding: 4px 16px 16px 68px; }
  .check { display: flex; gap: 12px; align-items: center; cursor: pointer; color: var(--on-surface); }
  .check input { width: 18px; height: 18px; accent-color: var(--primary); margin: 0; }
  form { display: flex; flex-direction: column; gap: 12px; }
  .end { display: flex; justify-content: flex-end; }
</style>
