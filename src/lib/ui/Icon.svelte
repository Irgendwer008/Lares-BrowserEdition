<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<script lang="ts">
  import { ICONS, type IconName } from './icons';
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={ICONS[name]} /></svg>

<style>
  svg { fill: currentColor; flex: none; display: block; }
</style>
