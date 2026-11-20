// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, test } from 'vitest';
import { UrlMatcher, webAddress } from '@/core/policy/urlMatcher';

describe('UrlMatcher', () => {
  test('parses URL bar variants', () => {
    expect(UrlMatcher.parse('instagram.com')).toEqual(webAddress('instagram.com', ''));
    expect(UrlMatcher.parse('https://www.instagram.com/')).toEqual(webAddress('instagram.com', ''));
    expect(UrlMatcher.parse('http://user@M.YouTube.com:443/shorts/abc/?x=1#t')).toEqual(webAddress('m.youtube.com', '/shorts/abc'));
    expect(UrlMatcher.parse('bücher.de')).toEqual(webAddress('xn--bcher-kva.de', ''));
    expect(UrlMatcher.parse('https://münchen.de/')).toEqual(webAddress('xn--mnchen-3ya.de', ''));
  });

  test('rejects search terms and other schemes', () => {
    expect(UrlMatcher.parse('funny cat videos')).toBeNull();
    expect(UrlMatcher.parse('cats')).toBeNull();
    expect(UrlMatcher.parse('')).toBeNull();
    expect(UrlMatcher.parse('chrome://settings')).toBeNull();
    expect(UrlMatcher.parse('file:///sdcard/x.html')).toBeNull();
    expect(UrlMatcher.parse('moz-extension://abc/page.html')).toBeNull();
  });

  test('matches subdomains but not lookalikes', () => {
    expect(UrlMatcher.matches('https://m.facebook.com/feed', 'facebook.com')).toBe(true);
    expect(UrlMatcher.matches('facebook.com', 'www.facebook.com')).toBe(true);
    expect(UrlMatcher.matches('notfacebook.com', 'facebook.com')).toBe(false);
    expect(UrlMatcher.matches('facebook.com.evil.org', 'facebook.com')).toBe(false);
  });

  test('base host for sorting', () => {
    expect(UrlMatcher.baseHost('youtube.com')).toBe('youtube.com');
    expect(UrlMatcher.baseHost('m.youtube.com')).toBe('youtube.com');
    expect(UrlMatcher.baseHost('news.bbc.co.uk')).toBe('bbc.co.uk');
    expect(UrlMatcher.baseHost('localhost')).toBe('localhost');
  });

  test('path rules match by segment, case-insensitively', () => {
    const rule = 'youtube.com/shorts';
    expect(UrlMatcher.matches('youtube.com/shorts', rule)).toBe(true);
    expect(UrlMatcher.matches('https://m.youtube.com/shorts/xyz', rule)).toBe(true);
    expect(UrlMatcher.matches('youtube.com/Shorts/xyz', rule)).toBe(true);
    expect(UrlMatcher.matches('youtube.com/shortsfoo', rule)).toBe(false);
    expect(UrlMatcher.matches('youtube.com/watch?v=1', rule)).toBe(false);
    expect(UrlMatcher.matches('youtube.com', rule)).toBe(false);
  });

  test('scheme only at the start', () => {
    expect(UrlMatcher.matches('youtube.com/shorts/abc?x=https://a', 'youtube.com/shorts')).toBe(true);
    expect(UrlMatcher.matches('reddit.com/#://', 'reddit.com')).toBe(true);
    expect(UrlMatcher.matches('https://reddit.com/r/x?u=ftp://y', 'reddit.com')).toBe(true);
    expect(UrlMatcher.parse('ftp://reddit.com')).toBeNull();
  });

  test('path spelling does not escape rules', () => {
    expect(UrlMatcher.matches('youtube.com//shorts/abc', 'youtube.com/shorts')).toBe(true);
    expect(UrlMatcher.matches('youtube.com/%73horts', 'youtube.com/shorts')).toBe(true);
    expect(UrlMatcher.matches('youtube.com/%53HORTS/x', 'youtube.com/shorts')).toBe(true);
    // Encoded reserved characters keep their meaning (no new path segments).
    expect(UrlMatcher.matches('youtube.com/shorts%2Fabc', 'youtube.com/shorts/abc')).toBe(false);
  });
});
