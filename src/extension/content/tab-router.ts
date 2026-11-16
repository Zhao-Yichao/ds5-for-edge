import { browser } from 'wxt/browser';
import { supportedUrl } from '../core/browser-control';
import { permittedPage, resolveTabUrls, tabPreparationPolicy, type PagePreparation } from './site-access';

type Sender = { id?: string; url?: string; documentId?: string; tab?: { id?: number; url?: string; active?: boolean; windowId?: number; index?: number }; frameId?: number };
type Request = { type: string; direction?: unknown; sampledAt?: number };
type Timing = { reason: string; preparation:PagePreparation['state']|'none'; deliveryMs: number; validationMs: number; selectionMs: number; activationMs: number; totalMs: number };
class RequestExpired extends Error {}

// The switch itself must stay independent of destination readiness: preparing a
// page before activating it put renderer work on the user's key press. The
// destination is prepared after activation (where it is also foreground) and by
// the existing onActivated repair. `prepare` is therefore fire-and-forget.
export function createTabRouter(options: { prepare?: (tabId: number) => void } = {}) {
  const pending = new Set<number>(), diagnostics: Timing[] = [];
  // Never retain URLs, tab/window/device IDs, page text, or wall-clock timestamps.
  const snapshot = () => diagnostics.map(row => ({ ...row }));
  async function handle(message: Request, sender: Sender) {
    const started = performance.now(), received = Date.now();
    let stage = 'validation',stageStarted=started;
    const wait = async <T>(operation: Promise<T>): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const remaining = tabPreparationPolicy.requestMs - (performance.now() - started);
        if (remaining <= 0) throw new RequestExpired();
        return await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RequestExpired()),remaining);})]);
      } finally { clearTimeout(timer); }
    };
    const timing: Timing = { reason: 'error',preparation:'none', deliveryMs: Math.max(0, Math.min(10000, received - (message.sampledAt ?? received))), validationMs: 0, selectionMs: 0, activationMs: 0, totalMs: 0 };
    let lock: number | undefined;
    const finish = (reason: string) => { timing.reason = reason; return { switched: reason === 'switched', reason }; };
    try {
      if (sender.id !== browser.runtime.id) return finish('source');
      const keyboard = message.type === 'ds5-switch-keyboard';
      const documentInput=message.type==='ds5-switch-document-gamepad';
      const ownDemo=sender.url?.split(/[?#]/,1)[0]===browser.runtime.getURL('/demo.html');
      if (keyboard ? !ownDemo || (sender.frameId!==undefined&&sender.frameId!==0)
        : documentInput ? !supportedUrl(sender.url,browser.runtime.getURL('/')) || (sender.frameId!==0 && !(ownDemo&&sender.frameId===undefined))
        : sender.url !== browser.runtime.getURL('/tab-input.html') || sender.frameId === 0) return finish('source');
      if (message.direction !== -1 && message.direction !== 1) return finish('direction');
      if (timing.deliveryMs > 400) return finish('stale');
      let tabId = sender.tab?.id;
      if (tabId === undefined && sender.documentId) {
        const contexts = await wait(browser.runtime.getContexts({ documentIds: [sender.documentId] }));
        tabId = contexts.find(c => c.tabId >= 0 && (!documentInput&&!keyboard || c.frameId===0))?.tabId;
      }
      if (tabId === undefined) return finish('source');
      // A trusted content-script sender carries the tab snapshot. Trust it only
      // when it says active; anything else re-reads, and the activation guard
      // below is a second live check either way.
      const snapshotTab = sender.tab;
      const tab = snapshotTab && snapshotTab.active === true && snapshotTab.windowId !== undefined && snapshotTab.url !== undefined
        ? snapshotTab : await wait(browser.tabs.get(tabId));
      if (!tab) return finish('source');
      if (!tab.active) return finish('inactive');
      if (tab.windowId === undefined) return finish('source');
      if (pending.has(tab.windowId)) return finish('busy');
      pending.add(tab.windowId); lock = tab.windowId;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      // The isolated top-document sampler checks enabled/focus/editing/fullscreen
      // synchronously before emitting. Its trusted runtime sender is distinct
      // from the iframe fallback, which still needs the parent focus RPC.
      // Browser-owned activity/window/permission/state checks remain below.
      const focus = documentInput || ownDemo || tab.url?.split(/[?#]/,1)[0]===browser.runtime.getURL('/demo.html') ? Promise.resolve({active:true,documentReader:true}) : Promise.race([
          browser.tabs.sendMessage(tabId, { type: 'ds5-tab-focus' }, { frameId: 0 }) as Promise<{ active?: boolean;documentReader?:boolean }>,
          new Promise<{ active: boolean;documentReader?:boolean }>(resolve => { timeout = setTimeout(() => resolve({ active: false }), 400); }),
        ]);
      // One parallel pass replaces the previous validation pass. Host grants are
      // cached in site-access; the preference is a single read per press.
      const validation = await wait(Promise.all([
        browser.windows.get(tab.windowId), browser.tabs.query({windowId: tab.windowId}), browser.storage.local.get('controlEnabled'), permittedPage(tab.url), focus,
      ])).finally(() => clearTimeout(timeout));
      timing.validationMs = Math.round(performance.now() - started);
      if (!validation[0].focused) return finish('window');
      if (validation[2].controlEnabled !== true) return finish('paused');
      if (!validation[3]) return finish('permission');
      if (!validation[4]?.active) return finish('focus');
      if(!documentInput&&!keyboard&&validation[4]?.documentReader)return finish('document-reader');
      const selecting = performance.now();
      stage='preparation';stageStarted=selecting;
      const tabs = validation[1].filter(t=>t.id!==undefined).sort((a,b)=>a.index-b.index);
      // Switching scope is protocol based, independent of per-site page grants.
      // Broad default host access supplies normal web URLs without tabs permission.
      // Resolve missing URLs only if ordering actually reaches that tab. An
      // unrelated hidden URL must not delay an already-known adjacent web page.
      const position=tabs.findIndex(t=>t.id===tabId);
      let metadata:typeof tabs|undefined;
      let target:number|null=null;
      for(let step=1;position>=0&&step<tabs.length;step++){
        const candidate=tabs[(position+message.direction*step+tabs.length)%tabs.length]!;
        // A full cycle can land back on the source; it is never its own target.
        if(candidate.id===tabId)continue;
        // One optional lookup per request even if several protected/unknown
        // tabs lie between the source and its next supported destination.
        if(!candidate.url&&!metadata)metadata=await wait(resolveTabUrls(tabs));
        const resolved=candidate.url?candidate:metadata?.find(tab=>tab.id===candidate.id);
        if(!resolved||!supportedUrl(resolved.url,browser.runtime.getURL('/')))continue;
        // Destination readiness is a renderer concern handled after activation.
        // Only protocol scope and the host grant can make a destination a trap.
        if(!await wait(permittedPage(resolved.url)))continue;
        target=candidate.id!;break;
      }
      timing.selectionMs = Math.round(performance.now() - selecting);
      if (target === null) return finish('no-target');
      stage='activation';stageStarted=performance.now();
      const activating = performance.now();
      // Last live guard: the source must still be the active tab of a focused
      // window. The preference was checked at the start of this same press.
      const [current, window] = await wait(Promise.all([
        browser.tabs.get(tabId).then(tab=>resolveTabUrls([tab])).then(tabs=>tabs[0]!), browser.windows.get(tab.windowId),
      ]));
      if (!current.active || current.url !== tab.url || !window.focused) return finish('changed');
      if (performance.now() - started > tabPreparationPolicy.requestMs) return finish('stale');
      await wait(browser.tabs.update(target, { active: true }));
      timing.activationMs = Math.round(performance.now() - activating);
      // Attachment runs after the activation, never before it.
      if (options.prepare) void options.prepare(target);
      return finish('switched');
    } catch(error) { return finish(error instanceof RequestExpired ? stage==='preparation'?'prepare-timeout':'request-timeout' : 'unavailable'); }
    finally {
      if (lock !== undefined) pending.delete(lock);
      timing.totalMs = Math.round(performance.now() - started);
      if(stage==='preparation')timing.selectionMs=Math.round(performance.now()-stageStarted);
      else if(stage==='validation'&&!timing.validationMs)timing.validationMs=timing.totalMs;
      else if(stage==='activation'&&!timing.activationMs)timing.activationMs=Math.round(performance.now()-stageStarted);
      diagnostics.push(timing); if (diagnostics.length > 40) diagnostics.shift();
    }
  }
  return { handle, snapshot };
}
