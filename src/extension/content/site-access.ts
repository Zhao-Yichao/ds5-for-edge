import { browser } from 'wxt/browser';
import { sitePattern, supportedUrl } from '../core/browser-control';

const ids = ['ds5-generic-gamepad', 'ds5-generic-navigation'];
let queue: Promise<void> = Promise.resolve();
export type PagePreparation = { state:'ready'|'restoring'|'unavailable'|'timeout' };
// Repair fits inside the routing budget; a live status reply normally arrives
// immediately. Waiting hundreds of ms before trying injection delayed cold tabs.
export const tabPreparationPolicy = { requestMs:600, repairMs:500, statusProbeMs:40, readyProbeMs:400 } as const;
class PreparationExpired extends Error {}
type ControllerTab={id?:number;url?:string;discarded?:boolean;frozen?:boolean;status?:string};
const attaching = new Map<number, Promise<PagePreparation>>();
// Worker-local readiness, never persisted. Lifecycle events invalidate it on
// document changes; ordinary repair callers still probe the live controller.
const readyPages = new Map<number, string>();
export function forgetPageController(tabId?: number) {
  if (tabId === undefined) { readyPages.clear(); attaching.clear(); }
  else { readyPages.delete(tabId); attaching.delete(tabId); }
}

export async function preparePageForSwitch(tabId: number, deadline=performance.now()+tabPreparationPolicy.requestMs): Promise<PagePreparation> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const remaining=deadline-performance.now();
    if(remaining<=0)return {state:'timeout'};
    return await Promise.race([
      (async():Promise<PagePreparation>=>{
        const [tab] = await resolveTabUrls([await browser.tabs.get(tabId)]);
        if (!tab || !await permittedPage(tab.url)) return {state:'unavailable'};
        if(performance.now()>=deadline)return {state:'timeout'};
        if (!sitePattern(tab.url) || tab.discarded || tab.frozen || tab.status === 'loading') return {state:'restoring'};
        if (readyPages.get(tabId) === tab.url) return {state:'ready'};
        return prepareController(tabId,deadline,tab);
      })(),
      new Promise<PagePreparation>(resolve=>{timer=setTimeout(()=>resolve({state:'timeout'}),remaining);}),
    ]);
  } catch { return {state:'unavailable'}; }
  finally { clearTimeout(timer); }
}
// Host access does not always expose even our own extension tabs' URLs.
// Resolve only our top-level Demo from browser-owned extension contexts.
export async function resolveTabUrls<T extends {id?:number;url?:string}>(tabs:T[]):Promise<T[]> {
  if(tabs.every(tab=>tab.url))return tabs;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    if(typeof browser.runtime.getContexts!=='function')return tabs;
    const contexts=await Promise.race([
      browser.runtime.getContexts({contextTypes:['TAB']}),
      new Promise<[]>(resolve=>{timer=setTimeout(()=>resolve([]),100);}),
    ]);
    return tabs.map(tab=>{
      if(tab.url)return tab;
      const context=contexts.find(c=>c.tabId===tab.id&&c.frameId===0&&c.documentUrl?.split(/[?#]/,1)[0]===browser.runtime.getURL('/demo.html'));
      return context?{...tab,url:context.documentUrl}:tab;
    });
  } catch { return tabs; } // Optional Demo metadata must not break known web tabs.
  finally { clearTimeout(timer); }
}

// Host grants only change through permissions events, which the background
// forwards here. Positive grants are cached so a switch does not spend an IPC
// per candidate; denials are re-checked because a grant may land later.
const grantedOrigins = new Set<string>();
export function forgetPageGrants() { grantedOrigins.clear(); }
export async function permittedPage(url: string | undefined): Promise<boolean> {
  if (!supportedUrl(url, browser.runtime.getURL('/'))) return false;
  const pattern = sitePattern(url);
  if (pattern === null) return true;
  if (grantedOrigins.has(pattern)) return true;
  const granted = await browser.permissions.contains({ origins: [pattern] });
  if (granted) grantedOrigins.add(pattern);
  return granted;
}

export function syncSiteScripts(): Promise<void> {
  const run = async () => {
    // 0.5 uses static scripts on ordinary web pages. Remove old 0.4 dynamic
    // registrations on update so a page never gets two controllers/pollers.
    const registered = await browser.scripting.getRegisteredContentScripts({ ids });
    if (registered.length) await browser.scripting.unregisterContentScripts({ ids: registered.map(script => script.id) });
  };
  queue = queue.catch(() => {}).then(run);
  return queue;
}

export async function enableSite(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (!tab.active || !await permittedPage(tab.url) || !sitePattern(tab.url)) throw new Error('Unapproved page');
  await syncSiteScripts();
  if (!await ensurePageController(tabId)) throw new Error('Page unavailable');
  await browser.storage.local.set({ controlEnabled: true });
}

// Static match scripts cover future documents. Explicitly repair documents that
// predate install/reload, and coalesce startup/activation/enable races per tab.
export async function ensurePageController(tabId: number): Promise<boolean> {
  const result=await prepareController(tabId);
  return result.state==='ready'||result.state==='restoring';
}

function prepareController(tabId:number, requestDeadline=Infinity, knownTab?:ControllerTab):Promise<PagePreparation> {
  const pending = attaching.get(tabId);
  if (pending) return pending;
  let task!: Promise<PagePreparation>;
  task = Promise.resolve().then(async ():Promise<PagePreparation> => {
    const deadline=Math.min(performance.now()+tabPreparationPolicy.repairMs,requestDeadline);
    const wait=async<T>(operation:()=>Promise<T>):Promise<T>=>{
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {
        const remaining=deadline-performance.now();
        if(remaining<=0)throw new PreparationExpired();
        if(attaching.get(tabId)!==task)throw Error('Preparation superseded');
        return await Promise.race([
          operation(),
          new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new PreparationExpired()),remaining);}),
        ]);
      }finally{clearTimeout(timer);}
    };
    const remember = (url: string):PagePreparation => {
      if (attaching.get(tabId) !== task) return {state:'unavailable'};
      readyPages.set(tabId, url);
      return {state:'ready'};
    };
    try {
      const rawTab=knownTab??await wait(()=>browser.tabs.get(tabId));
      const [tab] = await wait(()=>resolveTabUrls([rawTab]));
      if(!tab)return {state:'unavailable'};
      if (!await wait(()=>permittedPage(tab.url))) { if(attaching.get(tabId)===task)readyPages.delete(tabId); return {state:'unavailable'}; }
      if (!sitePattern(tab.url) || tab.discarded || tab.frozen || tab.status === 'loading') return {state:'restoring'};
      let status: { enabled?: boolean; version?: string; inputReady?: boolean } | undefined;
      // Live checks of an already-confirmed controller run off the switching
      // path. Give a busy renderer time to answer instead of rebuilding its UI.
      const probeMs=readyPages.get(tabId)===tab.url?tabPreparationPolicy.readyProbeMs:tabPreparationPolicy.statusProbeMs;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        status = await wait(()=>Promise.race([
          browser.tabs.sendMessage(tabId, { type: 'ds5-status' }, { frameId: 0 }),
          new Promise<undefined>(resolve => { timeout = setTimeout(() => resolve(undefined), probeMs); }),
        ]));
      } catch { /* no controller */ } finally { clearTimeout(timeout); }
      if (typeof status?.enabled === 'boolean' && status.version === browser.runtime.getManifest().version && status.inputReady) return remember(tab.url!);
      if (attaching.get(tabId) === task) readyPages.delete(tabId);
      const results = await wait(()=>browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/navigation.js'], world: 'ISOLATED' }));
      // Bind the second world to the same document; navigation during repair is
      // retried by onUpdated rather than injecting only half into the new page.
      const documentId = results[0]?.documentId;
      if(attaching.get(tabId)!==task)return {state:'unavailable'};
      await wait(()=>browser.scripting.executeScript({ target: documentId ? { tabId, documentIds: [documentId] } : { tabId }, files: ['/content-scripts/gamepad.js'], world: 'MAIN' }));
      return remember(tab.url!);
    } catch(error) { if (attaching.get(tabId) === task) readyPages.delete(tabId); return {state:error instanceof PreparationExpired?'timeout':'unavailable'}; }
  }).finally(() => { if (attaching.get(tabId) === task) attaching.delete(tabId); });
  attaching.set(tabId, task);
  return task;
}

export async function attachExistingPages(): Promise<void> {
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => tab.id !== undefined).map(tab => ensurePageController(tab.id!)));
}
