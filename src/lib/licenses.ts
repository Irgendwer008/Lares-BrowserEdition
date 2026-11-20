// SPDX-License-Identifier: GPL-3.0-or-later
// Lares' own license and the third-party code shipped in the extension (Android: AboutLibraries
// + the GPL text bundled from LICENSE). Versions and license texts are read from the installed
// packages at build time, so they always match what is bundled. Only code that ends up in the
// extension is listed – build tools (Vite, TypeScript, Vitest …) don't ship.
import gplText from '../../LICENSE?raw';
import apacheText from '../../assets/licenses/apache-2.0.txt?raw';
// The WXT packages declare MIT in package.json but ship no license file.
import wxtMitText from '../../assets/licenses/wxt-mit.txt?raw';
import svelteText from '../../node_modules/svelte/LICENSE.md?raw';
import uqrText from '../../node_modules/uqr/LICENSE?raw';
import sveltePkg from '../../node_modules/svelte/package.json';
import uqrPkg from '../../node_modules/uqr/package.json';
import wxtPkg from '../../node_modules/wxt/package.json';
import browserPkg from '../../node_modules/@wxt-dev/browser/package.json';
import i18nPkg from '../../node_modules/@wxt-dev/i18n/package.json';

export interface Library {
  readonly name: string;
  readonly version: string | null;
  readonly author: string;
  readonly license: string;
  readonly website: string | null;
  readonly source: string;
  readonly text: string;
}

export const LARES_LICENSE_TEXT: string = gplText;

export const LIBRARIES: readonly Library[] = [
  {
    name: 'Material icons',
    version: null,
    author: 'Google',
    license: 'Apache-2.0',
    website: 'https://fonts.google.com/icons',
    source: 'https://github.com/google/material-design-icons',
    text: apacheText,
  },
  {
    name: 'Svelte',
    version: sveltePkg.version,
    author: 'Svelte contributors',
    license: sveltePkg.license,
    website: 'https://svelte.dev',
    source: 'https://github.com/sveltejs/svelte',
    text: svelteText,
  },
  {
    name: 'uqr',
    version: uqrPkg.version,
    author: 'Anthony Fu, Project Nayuki',
    license: uqrPkg.license,
    website: null,
    source: 'https://github.com/unjs/uqr',
    text: uqrText,
  },
  {
    name: 'WXT',
    version: wxtPkg.version,
    author: 'Aaron Klinker',
    license: wxtPkg.license,
    website: 'https://wxt.dev',
    source: 'https://github.com/wxt-dev/wxt',
    text: wxtMitText,
  },
  {
    name: '@wxt-dev/browser',
    version: browserPkg.version,
    author: 'Aaron Klinker',
    license: browserPkg.license,
    website: 'https://wxt.dev',
    source: 'https://github.com/wxt-dev/wxt/tree/main/packages/browser',
    text: wxtMitText,
  },
  {
    name: '@wxt-dev/i18n',
    version: i18nPkg.version,
    author: 'Aaron Klinker',
    license: i18nPkg.license,
    website: 'https://wxt.dev/guide/i18n/installation.html',
    source: 'https://github.com/wxt-dev/wxt/tree/main/packages/i18n',
    text: wxtMitText,
  },
];
