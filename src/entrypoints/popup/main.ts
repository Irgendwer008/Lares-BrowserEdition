// SPDX-License-Identifier: GPL-3.0-or-later
import { mount } from 'svelte';
import App from './App.svelte';
import { createServices, LaresModel } from '@/lib/app.svelte';
import { setModel, ui } from './ui.svelte';
import '@/lib/theme.css';

/** Shows unexpected errors in the UI instead of a blank popup. */
function showError(e: unknown) {
  ui.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  console.error(e);
}
window.addEventListener('error', (e) => showError(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason));

async function start() {
  document.documentElement.lang = browser.i18n.getUILanguage();
  const params = new URLSearchParams(location.search);
  const inTab = params.has('tab');
  const model = new LaresModel(await createServices());
  setModel(model);
  if (params.get('tab') === 'settings') ui.go({ name: 'settings' });
  // Fresh usage numbers when the popup opens.
  void browser.runtime.sendMessage({ type: 'sync' }).catch(() => {});
  mount(App, { target: document.getElementById('app')!, props: { inTab } });
}

start().catch((e) => {
  document.getElementById('app')!.textContent = `Lares: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}`;
  console.error(e);
});
