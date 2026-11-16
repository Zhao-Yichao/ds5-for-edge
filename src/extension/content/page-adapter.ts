import * as bilibili from '../sites/bilibili/page';
import { pageScope as genericScope, visible } from './page';

// Optional site supplements. Ordinary navigation never depends on a video
// selector matching, a player being present, or a media URL being recognised.
const onBilibili = () => /^(www|search)\.bilibili\.com$/.test(location.hostname);

export function navigationTarget(item: HTMLElement): HTMLElement {
  return item;
}

export function preferredInitial(item: HTMLElement): boolean {
  return (document.documentElement.dataset.ds5Demo === 'true' && item.hasAttribute('data-ds5-target')) || (onBilibili() && item instanceof HTMLAnchorElement && bilibili.videoUrl(item.href)!==null);
}

export function activationTarget(item: HTMLElement): HTMLElement | null {
  return item;
}

export function activationDestination(item: HTMLElement): string | null {
  const link = onBilibili() && item instanceof HTMLAnchorElement ? item : null;
  return link ? bilibili.videoUrl(link.href) : null;
}

export function pageScope(): Element {
  return onBilibili() ? bilibili.pageScope() : genericScope();
}

export function mainPlayer(): HTMLVideoElement | null {
  if (onBilibili()) return bilibili.mainPlayer();
  const demo = document.querySelector('[data-ds5-player] video');
  if (demo instanceof HTMLVideoElement) return demo;
  return Array.from(document.querySelectorAll('video')).filter(visible).sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ?? null;
}

export function homeUrl(): string {
  if (onBilibili()) return 'https://www.bilibili.com/';
  return /^https?:$/.test(location.protocol) ? `${location.origin}/` : location.pathname;
}

export function homeLabel(): string {
  return onBilibili() ? '回 B 站首页' : /^https?:$/.test(location.protocol) ? '回本站首页' : '回演示首页';
}

export function closeControl(root: Element): HTMLElement | null {
  return root.querySelector<HTMLElement>('[aria-label="关闭"],[aria-label="Close"],.close' + (onBilibili() ? ',.bili-mini-close-icon' : ''));
}

export function fullscreenTarget(video: HTMLVideoElement): HTMLElement {
  return video.closest<HTMLElement>(onBilibili() ? '.bpx-player-container,[data-ds5-player]' : '[data-ds5-player]') ?? video;
}
