import { describe, expect, it } from 'vitest';
import { adjacentTab, sitePattern, supportedUrl } from '../../src/extension/core/browser-control';
import { videoUrl } from '../../src/extension/sites/bilibili/page';

describe('limited browser routing', () => {
  it('cycles tabs by visual order, wrapping without changing the list', () => {
    const tabs = [{ id: 3, index: 4 }, { id: 1, index: 0 }, { id: 2, index: 2 }];
    expect(adjacentTab(tabs, 3, 1)).toBe(1); expect(adjacentTab(tabs, 2, -1)).toBe(1);
    expect(adjacentTab(tabs, 99, 1)).toBeNull(); expect(adjacentTab([{ id: 1, index: 0 }], 1, 1)).toBeNull();
  });
  it('accepts web protocol eligibility and our demo; permission checks belong to the background', () => {
    const origin = 'chrome-extension://own/';
    expect(supportedUrl('https://www.bilibili.com/video/BV123/', origin)).toBe(true);
    expect(supportedUrl('chrome-extension://own/demo.html', origin)).toBe(true);
    expect(supportedUrl('https://example.com/', origin)).toBe(true);
    expect(sitePattern('http://localhost:8080/path?q=private')).toBe('http://localhost/*');
    for (const url of ['chrome://settings/', 'chrome-extension://other/demo.html', 'file:///demo.html', 'javascript:void(0)']) {
      expect(supportedUrl(url, origin)).toBe(false); expect(sitePattern(url)).toBeNull();
    }
    expect(supportedUrl('https://microsoftedge.microsoft.com/addons/', origin)).toBe(false);
    expect(supportedUrl('https://chromewebstore.google.com/', origin)).toBe(false);
  });
  it('recognises actual video destinations without allowing arbitrary schemes or hosts', () => {
    const base = 'https://www.bilibili.com/';
    expect(videoUrl('//www.bilibili.com/video/BV123Abc/', base)).toBe('https://www.bilibili.com/video/BV123Abc/');
    expect(videoUrl('/video/av123/', base)).toBe('https://www.bilibili.com/video/av123/');
    for (const value of ['javascript:alert(1)', 'https://example.com/video/BV123/', 'https://space.bilibili.com/123', 'https://www.bilibili.com/read/123']) expect(videoUrl(value, base)).toBeNull();
  });
});
