import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  origins: ['https://www.bilibili.com/*', 'https://search.bilibili.com/*'] as string[],
  scripts: new Map<string, Record<string, unknown>>(),
  tab: { id: 7, active: true, url: 'https://controls.example/next', discarded: false },
  status: false,
  probes: 0,
  statusWait: null as Promise<void> | null,
  tabWait:null as Promise<void>|null,
  permissionWait:null as Promise<void>|null,
  contextMode:'missing',
  injections: [] as unknown[],
  injectionWait:null as Promise<void>|null,
}));
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { getURL: (path: string) => `chrome-extension://own${path}`, getManifest: () => ({version:'test'}),get getContexts(){return api.contextMode==='missing'?undefined:async()=>{if(api.contextMode==='silent')return new Promise(()=>{});throw Error('unavailable');};} },
  permissions: {
    getAll: async () => ({ origins: api.origins }),
    contains: async ({ origins }: { origins: string[] }) => {await api.permissionWait;return origins.every(origin => api.origins.includes(origin));},
  },
  tabs: { get: async () => {await api.tabWait;return api.tab;}, sendMessage: async () => { api.probes++; await api.statusWait; if (!api.status) throw new Error('Not injected'); return { enabled: false,version:'test',inputReady:true }; } },
  storage: { local: { set: vi.fn(async () => {}) } },
  scripting: {
    getRegisteredContentScripts: async () => [...api.scripts.values()],
    registerContentScripts: async (scripts: { id: string }[]) => { for (const script of scripts) api.scripts.set(script.id, script); },
    updateContentScripts: async (scripts: { id: string }[]) => { for (const script of scripts) api.scripts.set(script.id, script); },
    unregisterContentScripts: async ({ ids }: { ids: string[] }) => { for (const id of ids) api.scripts.delete(id); },
    executeScript: async (options: unknown) => { api.injections.push(options);await api.injectionWait;return [{documentId:'doc'}]; },
  },
} }));
import { enableSite, ensurePageController, forgetPageController, forgetPageGrants, permittedPage, preparePageForSwitch, resolveTabUrls, syncSiteScripts } from '../../src/extension/content/site-access';

beforeEach(() => {
  api.origins = ['https://www.bilibili.com/*', 'https://search.bilibili.com/*'];
  api.scripts.clear(); api.injections.length = 0; api.status = false;
  api.probes=0;api.statusWait=null;api.tabWait=null;api.permissionWait=null;api.injectionWait=null;api.contextMode='missing';forgetPageController();forgetPageGrants();
  api.tab = { id: 7, active: true, url: 'https://controls.example/next', discarded: false };
});
afterEach(()=>vi.useRealTimers());

describe('site access lifecycle', () => {
  it('requires an actual host grant, while allowing only our own demo extension page', async () => {
    expect(await permittedPage('https://controls.example/')).toBe(false);
    expect(await permittedPage('https://www.bilibili.com/')).toBe(true);
    expect(await permittedPage('chrome-extension://own/demo.html')).toBe(true);
    expect(await permittedPage('chrome-extension://other/demo.html')).toBe(false);
    expect(await permittedPage('file:///private')).toBe(false);
  });
  it('removes legacy dynamic scripts when migrating to static cross-site injection', async () => {
    api.scripts.set('ds5-generic-gamepad', {id:'ds5-generic-gamepad'});
    api.scripts.set('ds5-generic-navigation', {id:'ds5-generic-navigation'});
    await syncSiteScripts(); expect(api.scripts.size).toBe(0);
    await syncSiteScripts(); expect(api.scripts.size).toBe(0);
  });
  it('rejects unapproved or inactive pages before injecting', async () => {
    await expect(enableSite(7)).rejects.toThrow('Unapproved page');
    api.origins.push('https://controls.example/*'); api.tab.active = false;
    await expect(enableSite(7)).rejects.toThrow('Unapproved page');
    expect(api.injections).toHaveLength(0);
  });
  it('injects both worlds once for an approved page and reuses an existing controller', async () => {
    api.origins.push('https://controls.example/*'); await enableSite(7);
    expect(api.injections).toHaveLength(2);
    api.status = true; await enableSite(7); expect(api.injections).toHaveLength(2);
  });
  it('attaches an existing inactive document once during concurrent lifecycle events',async()=>{
    api.origins.push('https://controls.example/*');api.tab.active=false;
    expect(await Promise.all([ensurePageController(7),ensurePageController(7),ensurePageController(7)])).toEqual([true,true,true]);
    expect(api.injections).toHaveLength(2);
    expect(api.injections[1]).toMatchObject({target:{tabId:7,documentIds:['doc']},world:'MAIN'});
  });
  it('does not reload a discarded restored tab or inject a protected page',async()=>{
    api.origins.push('https://controls.example/*');api.tab.discarded=true;
    expect(await ensurePageController(7)).toBe(true);expect(api.injections).toHaveLength(0);
    api.tab.discarded=false;api.tab.url='https://microsoftedge.microsoft.com/addons/detail/test';
    expect(await ensurePageController(7)).toBe(false);expect(api.injections).toHaveLength(0);
  });
  it('reuses readiness for switching but still checks permission and probes explicit repairs',async()=>{
    api.origins.push('https://controls.example/*');api.status=true;
    await ensurePageController(7);expect(api.probes).toBe(1);
    expect(await preparePageForSwitch(7)).toEqual({state:'ready'});expect(api.probes).toBe(1);
    await ensurePageController(7);expect(api.probes).toBe(2);
    api.origins=[];forgetPageGrants();expect(await preparePageForSwitch(7)).toEqual({state:'unavailable'});
  });
  it('preserves known web URLs when optional context lookup is missing or fails',async()=>{
    const tabs=[{id:1,url:'https://controls.example/'},{id:2}];
    for(const mode of ['missing','rejected']){api.contextMode=mode;expect(await resolveTabUrls(tabs)).toEqual(tabs);}
  });
  it('allows a browser-reported frozen target to activate without awaiting renderer injection',async()=>{
    api.origins.push('https://controls.example/*');Object.assign(api.tab,{frozen:true});
    expect(await preparePageForSwitch(7)).toEqual({state:'restoring'});expect(await ensurePageController(7)).toBe(true);
    expect(api.probes).toBe(0);expect(api.injections).toHaveLength(0);
  });
  it.each(['tabWait','permissionWait'] as const)('expires a hung %s and permits fresh preparation after recovery',async key=>{
    vi.useFakeTimers();api.origins.push('https://controls.example/*');api.status=true;
    let release!:()=>void;api[key]=new Promise(resolve=>{release=resolve;});
    const first=ensurePageController(7);await vi.advanceTimersByTimeAsync(1100);expect(await first).toBe(false);
    api[key]=null;expect(await preparePageForSwitch(7)).toEqual({state:'ready'});expect(api.probes).toBe(1);
    release();await vi.advanceTimersByTimeAsync(1);expect(api.probes).toBe(1);expect(api.injections).toHaveLength(0);
  });
  it('bounds optional context lookup when it never replies',async()=>{
    vi.useFakeTimers();api.contextMode='silent';const tabs=[{id:1,url:'https://controls.example/'},{id:2}];
    const query=resolveTabUrls(tabs);await vi.advanceTimersByTimeAsync(101);expect(await query).toEqual(tabs);
  });
  it('invalidates readiness on same-URL document changes and does not revive an invalidated in-flight probe',async()=>{
    api.origins.push('https://controls.example/*');api.status=true;
    await ensurePageController(7);forgetPageController(7);
    let release!:()=>void;api.statusWait=new Promise(resolve=>{release=resolve;});
    const pending=ensurePageController(7);await new Promise(r=>setTimeout(r,0));forgetPageController(7);release();await pending;api.statusWait=null;
    const before=api.probes;expect(await preparePageForSwitch(7)).toEqual({state:'ready'});expect(api.probes).toBe(before+1);
    expect(await preparePageForSwitch(7)).toEqual({state:'ready'});expect(api.probes).toBe(before+1);
  });
  it('returns an explicit timeout when the caller budget is already exhausted',async()=>{
    expect(await preparePageForSwitch(7,performance.now()-1)).toEqual({state:'timeout'});
    expect(api.probes).toBe(0);expect(api.injections).toHaveLength(0);
  });
  it('reuses ongoing repair and finishes moderate cold work inside the routing budget',async()=>{
    vi.useFakeTimers();api.origins.push('https://controls.example/*');api.statusWait=new Promise(()=>{});
    let release!:()=>void;api.injectionWait=new Promise(resolve=>{release=resolve;});
    const repair=ensurePageController(7);await vi.advanceTimersByTimeAsync(50);
    const switching=preparePageForSwitch(7);release();await vi.advanceTimersByTimeAsync(1);
    expect(await switching).toEqual({state:'ready'});expect(await repair).toBe(true);expect(api.injections).toHaveLength(2);expect(api.probes).toBe(1);
  });
  it('classifies stalled repair as timeout and permits a fresh request without late continuation',async()=>{
    vi.useFakeTimers();api.origins.push('https://controls.example/*');let release!:()=>void;api.injectionWait=new Promise(resolve=>{release=resolve;});
    const first=preparePageForSwitch(7);await vi.advanceTimersByTimeAsync(550);expect(await first).toEqual({state:'timeout'});
    api.injectionWait=null;api.status=true;expect(await preparePageForSwitch(7)).toEqual({state:'ready'});
    const before=api.injections.length;release();await vi.advanceTimersByTimeAsync(1);expect(api.injections).toHaveLength(before);
  });
  it('does not rebuild a known ready controller merely because its background reply is slow',async()=>{
    vi.useFakeTimers();api.origins.push('https://controls.example/*');api.status=true;await ensurePageController(7);
    let release!:()=>void;api.statusWait=new Promise(resolve=>{release=resolve;});const checking=ensurePageController(7);
    await vi.advanceTimersByTimeAsync(180);release();await vi.advanceTimersByTimeAsync(1);
    expect(await checking).toBe(true);expect(api.injections).toHaveLength(0);
  });
});
