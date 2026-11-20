<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Material 3 switch. The change is reported, not applied: the caller decides (loosening may need the code). -->
<script lang="ts">
  let { checked, label, onchange, disabled = false }: { checked: boolean; label: string; onchange: (value: boolean) => void; disabled?: boolean } = $props();
</script>

<button type="button" role="switch" aria-checked={checked} aria-label={label} {disabled} class:on={checked} onclick={(e) => { e.stopPropagation(); onchange(!checked); }}>
  <span class="thumb"></span>
</button>

<style>
  button {
    width: 52px; height: 32px; border-radius: 16px; flex: none; cursor: pointer; padding: 0;
    border: 2px solid var(--outline); background: var(--surface-container-highest); position: relative;
    transition: background .15s, border-color .15s;
  }
  .thumb {
    position: absolute; top: 50%; left: 6px; width: 16px; height: 16px; border-radius: 50%;
    background: var(--outline); transform: translateY(-50%); transition: all .15s;
  }
  .on { background: var(--primary); border-color: var(--primary); }
  .on .thumb { left: 22px; width: 24px; height: 24px; background: var(--on-primary); }
  button:disabled { opacity: .38; cursor: default; }
</style>
