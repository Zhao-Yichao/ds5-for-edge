import { pageScope as genericScope, visible } from '../../content/page';

export const cardSelector = '.bili-video-card,.video-list-item,.video-page-card-small,.small-item';

export function videoUrl(value: string, base = location.href): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && url.hostname === 'www.bilibili.com' && /^\/video\/(?:BV[0-9A-Za-z]+|av\d+)(?:\/|$)/.test(url.pathname) ? url.href : null;
  } catch { return null; }
}

export function videoAnchor(element: HTMLElement): HTMLAnchorElement | null {
  const own = element instanceof HTMLAnchorElement ? [element] : [];
  return [...own, ...element.querySelectorAll<HTMLAnchorElement>('a[href]')].find(link => videoUrl(link.href) !== null) ?? null;
}

export function pageScope(): Element {
  return genericScope(/^(www|search)\.bilibili\.com$/.test(location.hostname) ? '.bili-mini-mask' : '');
}

export function mainPlayer(): HTMLVideoElement | null {
  const demo = document.querySelector('[data-ds5-player] video');
  if (demo instanceof HTMLVideoElement) return demo;
  const primary = document.querySelector('.bpx-player-video-wrap video,.bpx-player-video-area video,#bilibili-player video,.bpx-player-container video');
  if (primary instanceof HTMLVideoElement) return primary;
  // Bilibili may use bwp-video; never fall back to a recommendation preview there.
  if (location.hostname === 'www.bilibili.com' || location.hostname === 'search.bilibili.com') return null;
  return Array.from(document.querySelectorAll('video')).filter(visible).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ?? null;
}
