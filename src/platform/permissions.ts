// SPDX-License-Identifier: GPL-3.0-or-later
import type { GrantedPermissions } from '@/core/data/setupRequirements';

/** Host access the countdown content script needs (optional in Firefox MV3, granted at install in Chrome). */
export const HOST_ORIGINS = ['http://*/*', 'https://*/*'];

export async function grantedPermissions(): Promise<GrantedPermissions> {
  const [hostAccess, incognitoAccess] = await Promise.all([
    browser.permissions.contains({ origins: HOST_ORIGINS }).catch(() => false),
    browser.extension.isAllowedIncognitoAccess().catch(() => false),
  ]);
  return { hostAccess, incognitoAccess };
}

/** Must be called from a user gesture. */
export function requestHostAccess(): Promise<boolean> {
  return browser.permissions.request({ origins: HOST_ORIGINS });
}

export const isFirefox = import.meta.env.FIREFOX;

export const ADDONS_URL = 'about:addons';

/**
 * Opens the page where the user can allow private windows: Chrome's extension details, Firefox's
 * add-ons manager. Firefox normally refuses to let extensions open about: pages – then the address
 * is copied so the user can paste it.
 * @return 'opened', or 'copied' if the page couldn't be opened.
 */
export async function openExtensionDetails(): Promise<'opened' | 'copied'> {
  const url = isFirefox ? ADDONS_URL : `chrome://extensions/?id=${browser.runtime.id}`;
  try {
    await browser.tabs.create({ url });
    return 'opened';
  } catch {
    await navigator.clipboard.writeText(url);
    return 'copied';
  }
}
