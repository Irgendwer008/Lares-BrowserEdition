<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!--
  Time of day as hour / minute selects in the browser language's format: 24-hour clock where that's
  usual (de, fr, en-GB …), otherwise 12-hour with AM / PM. The native <input type="time"> can't be
  used because it follows the operating system instead. Reports changes; shows `value`.
-->
<script lang="ts">
  import { dayPeriods, uses24h } from '@/lib/timeFormat';

  let { value, label, onchange }: { value: number; label: string; onchange: (minuteOfDay: number) => void } = $props();

  const h24 = uses24h();
  const periods = dayPeriods();
  const hour = $derived(Math.floor(value / 60));
  const minute = $derived(value % 60);
  const pm = $derived(hour >= 12);
  const hour12 = $derived(hour % 12 === 0 ? 12 : hour % 12);
  const pad = (n: number) => String(n).padStart(2, '0');

  function emit(h: number, m: number) {
    if (h * 60 + m !== value) onchange(h * 60 + m);
  }
  const setHour24 = (e: Event) => emit(Number((e.currentTarget as HTMLSelectElement).value), minute);
  const setHour12 = (e: Event) => emit((Number((e.currentTarget as HTMLSelectElement).value) % 12) + (pm ? 12 : 0), minute);
  const setMinute = (e: Event) => emit(hour, Number((e.currentTarget as HTMLSelectElement).value));
  const setPeriod = (e: Event) => emit((hour % 12) + ((e.currentTarget as HTMLSelectElement).value === 'pm' ? 12 : 0), minute);
</script>

{#snippet period()}
  <select aria-label={label} value={pm ? 'pm' : 'am'} onchange={setPeriod}>
    <option value="am">{periods.am}</option>
    <option value="pm">{periods.pm}</option>
  </select>
{/snippet}

<div class="time" role="group" aria-label={label}>
  {#if !h24 && periods.first}{@render period()}{/if}
  {#if h24}
    <select aria-label={label} value={hour} onchange={setHour24}>
      {#each Array.from({ length: 24 }, (_, i) => i) as h (h)}<option value={h}>{pad(h)}</option>{/each}
    </select>
  {:else}
    <select aria-label={label} value={hour12} onchange={setHour12}>
      {#each [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as h (h)}<option value={h}>{h}</option>{/each}
    </select>
  {/if}
  <span aria-hidden="true">:</span>
  <select aria-label={label} value={minute} onchange={setMinute}>
    {#each Array.from({ length: 60 }, (_, i) => i) as m (m)}<option value={m}>{pad(m)}</option>{/each}
  </select>
  {#if !h24 && !periods.first}{@render period()}{/if}
</div>

<style>
  .time { display: inline-flex; align-items: center; gap: 2px; flex: none; }
  select {
    height: 36px; border: 1px solid var(--outline); border-radius: 4px; background: transparent;
    color: var(--on-surface); padding: 0 4px; font-variant-numeric: tabular-nums; cursor: pointer;
  }
  select option { background: var(--surface-container-high); }
  span { color: var(--on-surface-variant); }
</style>
