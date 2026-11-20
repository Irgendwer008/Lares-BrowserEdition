<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Material 3 outlined text field. Secret fields never offer autofill (no password managers, like Android). -->
<script lang="ts">
  let {
    value = $bindable(''),
    label,
    type = 'text',
    error = null,
    hint = null,
    placeholder = '',
    inputmode,
    autofocus = false,
    secret = false,
    maxlength,
  }: {
    value?: string;
    label: string;
    type?: 'text' | 'number' | 'url';
    error?: string | null;
    hint?: string | null;
    placeholder?: string;
    inputmode?: 'text' | 'numeric' | 'url';
    autofocus?: boolean;
    secret?: boolean;
    maxlength?: number;
  } = $props();
  const id = `f${Math.random().toString(36).slice(2)}`;

  function focusOnMount(node: HTMLInputElement) {
    if (autofocus) setTimeout(() => node.focus(), 50);
  }
</script>

<div class="field" class:invalid={error}>
  <input
    {id}
    type={secret ? 'password' : type}
    bind:value
    placeholder={placeholder || ' '}
    {inputmode}
    {maxlength}
    autocomplete={secret ? 'off' : undefined}
    data-1p-ignore={secret ? '' : undefined}
    data-lpignore={secret ? 'true' : undefined}
    data-bwignore={secret ? '' : undefined}
    spellcheck="false"
    use:focusOnMount
  />
  <label for={id}>{label}</label>
  {#if error}<p class="support error-text">{error}</p>{:else if hint}<p class="support muted">{hint}</p>{/if}
</div>

<style>
  .field { position: relative; padding-top: 6px; }
  input {
    width: 100%; height: 52px; padding: 0 16px; border-radius: 4px; background: transparent;
    border: 1px solid var(--outline); font-size: 16px; color: var(--on-surface);
  }
  input:focus { outline: none; border: 2px solid var(--primary); padding: 0 15px; }
  input::placeholder { color: transparent; }
  input:focus::placeholder { color: var(--on-surface-variant); }
  label {
    position: absolute; left: 12px; top: 22px; padding: 0 4px;
    color: var(--on-surface-variant); font-size: 16px; pointer-events: none; transition: all .12s; background: var(--field-bg, var(--surface));
    max-width: calc(100% - 24px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  input:focus + label, input:not(:placeholder-shown) + label { top: -2px; font-size: 12px; }
  input:focus + label { color: var(--primary); }
  .invalid input { border-color: var(--error); }
  .invalid label { color: var(--error) !important; }
  .support { font-size: 12px; line-height: 16px; padding: 4px 16px 0; }
</style>
