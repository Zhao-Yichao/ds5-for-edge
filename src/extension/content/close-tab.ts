import { browser } from 'wxt/browser';
import { supportedUrl } from '../core/browser-control';
import { permittedPage } from './site-access';

type Sender = { id?: string; url?: string; documentId?: string; frameId?: number; tab?: { id?: number } };
// A separate operation: no supplied target ID, no page-message bridge, no switch
// preparation or delayed retry. A stale request must never close a different tab.
export function createTabCloser() {
  const pending = new Set<number>();
  return async (sender: Sender) => {
    let tabId: number | undefined, locked = false, timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = performance.now() + 500;
    const wait = async <T>(p: Promise<T>): Promise<T> => {
      clearTimeout(timer);
      const remaining = deadline - performance.now();
      if (remaining <= 0) throw new Error('expired');
      try { return await Promise.race([p, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('expired')), remaining); })]); }
      finally { clearTimeout(timer); }
    };
    try {
      const demo = sender.url?.split(/[?#]/, 1)[0] === browser.runtime.getURL('/demo.html');
      if (sender.id !== browser.runtime.id || !supportedUrl(sender.url, browser.runtime.getURL('/'))
        || (sender.frameId !== 0 && !(demo && sender.frameId === undefined))) return { ok: false, reason: 'source' };
      if (demo && !sender.documentId) return { ok: false, reason: 'source' };
      tabId = sender.tab?.id;
      if (tabId === undefined && sender.documentId) {
        const contexts = await wait(browser.runtime.getContexts({ documentIds: [sender.documentId] }));
        tabId = contexts.find(c => c.tabId >= 0 && c.frameId === 0)?.tabId;
      }
      if (tabId === undefined || pending.has(tabId)) return { ok: false, reason: 'busy' };
      pending.add(tabId);
      locked = true;
      const tab = await wait(browser.tabs.get(tabId));
      if (!tab.active) return { ok: false, reason: 'inactive' };
      const [window, state, permitted, focus] = await wait(Promise.all([
        browser.windows.get(tab.windowId), browser.storage.local.get('controlEnabled'), demo ? Promise.resolve(true) : permittedPage(tab.url),
        demo ? Promise.resolve({ allowed: true }) : browser.tabs.sendMessage(tabId, { type: 'ds5-close-focus' }, sender.documentId ? { documentId: sender.documentId } : { frameId: 0 }) as Promise<{ allowed?: boolean }>,
      ]));
      if (!window.focused || state.controlEnabled !== true || !permitted || focus?.allowed !== true) return { ok: false, reason: 'protected' };
      const current = await wait(browser.tabs.get(tabId));
      const currentWindow = await wait(browser.windows.get(tab.windowId));
      // Own extension-page URLs can be omitted from tabs.get without the broad
      // tabs permission. Verify the exact packaged document's live context instead.
      if (demo) {
        const contexts = await wait(browser.runtime.getContexts({ documentIds: [sender.documentId!] }));
        if (!contexts.some(c => c.tabId === tabId && c.frameId === 0 && c.documentUrl?.split(/[?#]/, 1)[0] === browser.runtime.getURL('/demo.html'))) return { ok: false, reason: 'changed' };
      } else {
        const currentFocus = await wait(browser.tabs.sendMessage(tabId, { type: 'ds5-close-focus' }, sender.documentId ? { documentId: sender.documentId } : { frameId: 0 }) as Promise<{ allowed?: boolean }>);
        if (currentFocus?.allowed !== true) return { ok: false, reason: 'changed' };
      }
      if (performance.now() >= deadline || !current.active || !currentWindow.focused || current.windowId !== tab.windowId || current.url !== tab.url) return { ok: false, reason: 'changed' };
      await wait(browser.tabs.remove(tabId));
      return { ok: true, reason: 'closed' };
    } catch { return { ok: false, reason: 'unavailable' }; }
    finally { clearTimeout(timer); if (locked && tabId !== undefined) pending.delete(tabId); }
  };
}
