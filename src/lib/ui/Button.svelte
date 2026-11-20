<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Material 3 buttons: filled, tonal, outlined, text. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  let {
    variant = 'filled',
    icon,
    full = false,
    type = 'button',
    disabled = false,
    onclick,
    children,
  }: {
    variant?: 'filled' | 'tonal' | 'outlined' | 'text' | 'danger';
    icon?: IconName;
    full?: boolean;
    type?: 'button' | 'submit';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  } = $props();
</script>

<button class={variant} class:full {type} {disabled} {onclick}>
  {#if icon}<Icon name={icon} size={18} />{/if}
  {@render children()}
</button>

<style>
  button {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 40px; padding: 0 24px; border-radius: 999px; border: 1px solid transparent;
    font-size: 14px; font-weight: 500; letter-spacing: .1px; cursor: pointer;
    position: relative; overflow: hidden; white-space: nowrap;
  }
  button::after { content: ''; position: absolute; inset: 0; background: currentColor; opacity: 0; transition: opacity .15s; }
  button:hover:not(:disabled)::after { opacity: .08; }
  button:active:not(:disabled)::after { opacity: .12; }
  button:disabled { opacity: .38; cursor: default; }
  .full { width: 100%; }
  .filled { background: var(--primary); color: var(--on-primary); }
  .tonal { background: var(--secondary-container); color: var(--on-secondary-container); }
  .outlined { background: transparent; color: var(--primary); border-color: var(--outline); }
  .text { background: transparent; color: var(--primary); padding: 0 12px; }
  .danger { background: transparent; color: var(--error); padding: 0 12px; }
</style>
