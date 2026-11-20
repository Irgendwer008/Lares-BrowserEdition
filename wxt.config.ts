// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/reference/wxt/interfaces/inlineconfig.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte', '@wxt-dev/i18n/module'],
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    host_permissions: ['http://*/*', 'https://*/*'],
    permissions: ['storage', 'tabs', 'webNavigation', 'alarms', 'idle', 'notifications'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'lares-browser@irgendwer008.github.io',
          // Nothing is collected or sent to the developers. (Guardian notifications go to services
          // the user sets up themselves – revisit this when they ship.)
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
