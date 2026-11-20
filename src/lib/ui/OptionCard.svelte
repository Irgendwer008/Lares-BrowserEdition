<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Selectable outlined card with title and description (setup choices). -->
<script lang="ts">
  let { title, description, selected = false, onclick }: { title: string; description?: string; selected?: boolean; onclick: () => void } = $props();
</script>

<button type="button" class:selected {onclick} aria-pressed={selected}>
  <span class="title-m">{title}</span>
  {#if description}<span class="body-m muted">{description}</span>{/if}
</button>

<style>
  button {
    display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%; cursor: pointer;
    padding: 16px; border-radius: var(--radius-m); border: 1px solid var(--outline-variant); background: transparent;
  }
  button:hover { background: color-mix(in srgb, var(--on-surface) 5%, transparent); }
  .selected { border: 2px solid var(--primary); padding: 15px; }
</style>
