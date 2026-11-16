export type TabDirection = -1 | 1;
export function sitePattern(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    return ['https:', 'http:'].includes(url.protocol) ? `${url.protocol}//${url.hostname}/*` : null;
  } catch { return null; }
}

// Web/Demo eligibility, excluding known protected stores. Page control callers
// must separately verify host permission; tab destination ordering must not.
export function supportedUrl(value: string | undefined, extensionOrigin: string): boolean {
  try {
    const url = new URL(value ?? '');
    const own = new URL(extensionOrigin);
    if (url.hostname === 'chromewebstore.google.com'
      || (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))
      || (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))) return false;
    return sitePattern(value) !== null
      || (url.protocol === own.protocol && url.host === own.host && url.pathname === '/demo.html');
  } catch { return false; }
}

export function adjacentTab(tabs: readonly { id?: number; index: number }[], current: number, direction: TabDirection): number | null {
  const ordered = [...tabs].filter(t => t.id !== undefined).sort((a, b) => a.index - b.index);
  const position = ordered.findIndex(t => t.id === current);
  if (position < 0 || ordered.length < 2) return null;
  return ordered[(position + direction + ordered.length) % ordered.length]?.id ?? null;
}
