<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Pill-shaped usage bar with "used / limit min" inside (Android: UsageBar). -->
<script lang="ts">
  import { i18n } from '#i18n';
  let { usedMillis, limitMinutes }: { usedMillis: number; limitMinutes: number } = $props();
  const used = $derived(Math.min(limitMinutes, Math.floor(usedMillis / 60_000)));
  const fraction = $derived(limitMinutes === 0 ? 1 : Math.min(1, usedMillis / (limitMinutes * 60_000)));
  const reached = $derived(fraction >= 1);
</script>

<div class="bar" class:reached role="progressbar" aria-valuemin="0" aria-valuemax={limitMinutes} aria-valuenow={used}>
  <div class="fill" style:width="{fraction * 100}%"></div>
  <span>{i18n.t('usageBar', [used, limitMinutes])}</span>
</div>

<style>
  /* Android: surfaceVariant track, primaryContainer fill (errorContainer once reached), labelSmall. */
  .bar { position: relative; height: 18px; border-radius: 9px; background: var(--surface-variant); overflow: hidden; flex: 1; min-width: 0; }
  .fill { position: absolute; inset: 0 auto 0 0; background: var(--primary-container); }
  span { position: relative; display: block; text-align: center; font-size: 11px; line-height: 18px; font-weight: 500; letter-spacing: .5px; color: var(--on-primary-container); }
  .reached .fill { background: var(--error-container); }
  .reached span { color: var(--on-error-container); }
</style>
