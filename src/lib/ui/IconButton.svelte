<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script lang="ts">
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  let { icon, label, onclick }: { icon: IconName; label: string; onclick?: (e: MouseEvent) => void } = $props();
</script>

<button type="button" aria-label={label} title={label} {onclick}><Icon name={icon} /></button>

<style>
  button {
    width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent;
    color: var(--on-surface-variant); display: grid; place-items: center; cursor: pointer; flex: none;
  }
  button:hover { background: color-mix(in srgb, var(--on-surface) 8%, transparent); }
</style>
