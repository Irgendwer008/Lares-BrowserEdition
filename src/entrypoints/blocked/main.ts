// SPDX-License-Identifier: GPL-3.0-or-later
import { mount } from 'svelte';
import App from './App.svelte';
import '@/lib/theme.css';

document.documentElement.lang = browser.i18n.getUILanguage();
mount(App, { target: document.getElementById('app')! });
