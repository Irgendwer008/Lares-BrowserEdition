// SPDX-License-Identifier: GPL-3.0-or-later
import { expect, test } from 'vitest';
import { countedPages, type TabInfo } from '@/core/blocking/countedPages';

const tab = (tabId: number, changes: Partial<TabInfo> = {}): TabInfo => ({
  tabId,
  url: `https://site${tabId}.example/`,
  windowId: 1,
  active: false,
  audible: false,
  muted: false,
  ...changes,
});
const ids = (pages: { tabId: number }[]) => pages.map((p) => p.tabId);

test('active tab of the focused window counts while the user is active', () => {
  const tabs = [tab(1, { active: true }), tab(2), tab(3, { windowId: 2, active: true })];
  expect(ids(countedPages(tabs, 1, 'active', {}))).toEqual([1]);
  expect(ids(countedPages(tabs, null, 'active', {}))).toEqual([]); // another program in front
});

test('split view: other visible tabs of the focused window count', () => {
  const tabs = [tab(1, { active: true }), tab(2), tab(3, { windowId: 2 })];
  expect(ids(countedPages(tabs, 1, 'active', { 2: { visible: true }, 3: { visible: true } }))).toEqual([1, 2]);
});

test('media with sound counts in the background, in other windows and with another program in front', () => {
  const tabs = [tab(1, { active: true }), tab(2, { audible: true }), tab(3, { windowId: 2, audible: true })];
  expect(ids(countedPages(tabs, 1, 'active', {}))).toEqual([1, 2, 3]);
  expect(ids(countedPages(tabs, null, 'active', {}))).toEqual([2, 3]);
});

test('muted or silent media in the background does not count; picture-in-picture does', () => {
  const tabs = [tab(1, { audible: true, muted: true }), tab(2), tab(3)];
  expect(ids(countedPages(tabs, 1, 'active', { 3: { pictureInPicture: true } }))).toEqual([3]);
});

test('idle: only media counts; locked: nothing', () => {
  const tabs = [tab(1, { active: true }), tab(2, { active: false, audible: true })];
  expect(ids(countedPages(tabs, 1, 'idle', {}))).toEqual([2]);
  expect(ids(countedPages([tab(1, { active: true, audible: true })], 1, 'idle', {}))).toEqual([1]);
  expect(ids(countedPages(tabs, 1, 'locked', {}))).toEqual([]);
});

test('tabs without a URL are skipped', () => {
  expect(countedPages([tab(1, { active: true, url: undefined })], 1, 'active', {})).toEqual([]);
});
