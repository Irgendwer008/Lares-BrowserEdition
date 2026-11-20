<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Letter icon in the template's brand color (no logos – see Android decisions: logos are
  trademarked and fetching favicons would tell each site about the user). Dark letter on light
  colors, outline on black.
-->
<script lang="ts">
  import { RuleTemplates } from '@/core/policy/ruleTemplates';
  let { target, size = 36 }: { target: string; size?: number } = $props();

  const argb = $derived(RuleTemplates.colorFor('WEBSITE', target));
  const rgb = $derived(argb === null ? null : argb & 0xffffff);
  const color = $derived(rgb === null ? null : `#${rgb.toString(16).padStart(6, '0')}`);
  const light = $derived.by(() => {
    if (rgb === null) return false;
    const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 160;
  });
  const black = $derived(rgb === 0);
  const letter = $derived(target.replace(/^www\./, '').charAt(0).toLowerCase() || '?');
</script>

<span
  class="letter"
  class:plain={color === null}
  class:black
  style:width="{size}px"
  style:height="{size}px"
  style:font-size="{size * 0.45}px"
  style:background={black ? 'transparent' : color}
  style:color={color === null || black ? undefined : light ? '#1A1A1A' : '#FFFFFF'}
  aria-hidden="true">{letter}</span
>

<style>
  .letter { border-radius: 50%; display: grid; place-items: center; font-weight: 600; flex: none; }
  .plain { background: var(--secondary-container); color: var(--on-secondary-container); }
  .black { border: 2px solid var(--on-surface); color: var(--on-surface); }
</style>
