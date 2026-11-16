import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({
  current: 1, focused: true, enabled: true, focus: true, permitted: true, documentReader: false,
  denied: [] as string[],
  windowQueue: [] as boolean[],
  focusWait: null as Promise<void> | null,
  updates: [] as number[],
  contexts:vi.fn(async()=>[] as {tabId:number;frameId:number;documentUrl:string}[]),
  tabs: [{id:1,index:0,windowId:7,url:'https://www.bilibili.com/'}, {id:2,index:1,windowId:7,url:'https://other.example/'}, {id:3,index:2,windowId:7,url:'edge://settings/'}],
}));
vi.mock('wxt/browser', () => ({browser:{
  runtime:{id:'own',getURL:(p:string)=>`chrome-extension://own${p}`,getContexts:api.contexts},
  permissions:{contains:async({origins}:{origins:string[]})=>api.permitted&&!origins.some(origin=>api.denied.includes(origin))},
  windows:{get:async()=>({focused:api.windowQueue.length?api.windowQueue.shift()!:api.focused})},
  storage:{local:{get:async()=>({controlEnabled:api.enabled})}},
  tabs:{
    get:async(id:number)=>({...api.tabs.find(t=>t.id===id), active:id===api.current}),
    query:async()=>api.tabs,
    sendMessage:async()=>{await api.focusWait; return {active:api.focus,documentReader:api.documentReader};},
    update:async(id:number)=>{api.current=id; api.updates.push(id);},
  },
}}));
import { createTabRouter } from '../../src/extension/content/tab-router';
import { forgetPageGrants } from '../../src/extension/content/site-access';
// A trusted content-script sender carries its own tab snapshot, including the
// active flag, so the router can skip a source re-read on the fast path.
const sender={id:'own',url:'chrome-extension://own/tab-input.html',tab:{id:1,index:0,windowId:7,url:'https://www.bilibili.com/',active:true},frameId:2};
const request={type:'ds5-switch-gamepad',direction:1};
beforeEach(()=>{api.current=1;api.focused=true;api.enabled=true;api.focus=true;api.permitted=true;api.documentReader=false;api.denied=[];api.windowQueue=[];api.focusWait=null;api.updates=[];forgetPageGrants();api.contexts.mockReset();api.contexts.mockResolvedValue([]);api.tabs=[{id:1,index:0,windowId:7,url:'https://www.bilibili.com/'},{id:2,index:1,windowId:7,url:'https://other.example/'},{id:3,index:2,windowId:7,url:'edge://settings/'}];});
afterEach(()=>vi.useRealTimers());
describe('trusted tab requests',()=>{
  it('switches across sites and accepts the next fresh press without a 300ms dead zone',async()=>{
    const router=createTabRouter();
    expect((await router.handle(request,sender)).switched).toBe(true);
    expect((await router.handle({...request,direction:-1},{...sender,tab:{id:2,index:1,windowId:7,url:'https://other.example/',active:true}})).switched).toBe(true);
    expect(api.updates).toEqual([2,1]);
  });
  it('rejects webpage and top-level input-page requests',async()=>{
    const router=createTabRouter();
    expect((await router.handle(request,{...sender,url:'https://www.bilibili.com/',frameId:0})).reason).toBe('source');
    expect((await router.handle(request,{...sender,frameId:0})).reason).toBe('source');
    expect((await router.handle({type:'ds5-switch-keyboard',direction:1},{...sender,url:'https://www.bilibili.com/',frameId:0})).reason).toBe('source');
    expect(api.updates).toEqual([]);
    expect((await router.handle({type:'ds5-switch-keyboard',direction:1},{...sender,url:'chrome-extension://own/demo.html#watch',frameId:0})).switched).toBe(true);
  });
  it('uses trusted top-document eligibility without a second renderer focus request',async()=>{
    api.focusWait=new Promise(()=>{});
    const router=createTabRouter(),source={...sender,url:'https://www.bilibili.com/',frameId:0};
    expect((await router.handle({type:'ds5-switch-document-gamepad',direction:1},source)).switched).toBe(true);
    expect(api.updates).toEqual([2]);
    expect((await router.handle({type:'ds5-switch-document-gamepad',direction:1},{...source,frameId:2})).reason).toBe('source');
  });
  it('retains browser-owned guards on the trusted top-document route',async()=>{
    const router=createTabRouter(),source={...sender,url:'https://www.bilibili.com/',frameId:0},message={type:'ds5-switch-document-gamepad',direction:1};
    api.enabled=false;expect((await router.handle(message,source)).reason).toBe('paused');api.enabled=true;
    api.current=2;expect((await router.handle(message,source)).reason).toBe('changed');api.current=1;
    api.focused=false;expect((await router.handle(message,source)).reason).toBe('window');api.focused=true;
    api.permitted=false;forgetPageGrants();expect((await router.handle(message,source)).reason).toBe('permission');api.permitted=true;
    expect((await router.handle({...message,sampledAt:Date.now()-1000},source)).reason).toBe('stale');
    expect(api.updates).toEqual([]);
  });
  it('re-reads the source when the sender snapshot is not active instead of trusting it',async()=>{
    const router=createTabRouter(),source={...sender,tab:{id:1,index:0,windowId:7,url:'https://www.bilibili.com/'}};
    api.current=2;expect((await router.handle(request,source)).reason).toBe('inactive');
    expect(api.updates).toEqual([]);
  });
  it('switches before attaching the destination so a slow repair cannot delay the press',async()=>{
    const prepare=vi.fn(()=>{expect(api.updates).toEqual([2]);});
    const router=createTabRouter({prepare});
    expect((await router.handle(request,sender)).switched).toBe(true);
    expect(prepare).toHaveBeenCalledWith(2);expect(api.updates).toEqual([2]);
  });
  it('does not hold the switch on a destination attachment that never settles',async()=>{
    const prepare=vi.fn(()=>new Promise(()=>{}));const router=createTabRouter({prepare});
    expect((await router.handle(request,sender)).switched).toBe(true);
    expect((await router.handle({...request,direction:-1},{...sender,tab:{id:2,index:1,windowId:7,url:'https://other.example/',active:true}})).switched).toBe(true);
    expect(api.updates).toEqual([2,1]);
  });
  it('skips a destination without a host grant and never treats the source as its own target',async()=>{
    const router=createTabRouter();api.denied=['https://other.example/*'];
    expect((await router.handle(request,sender)).reason).toBe('no-target');
    expect(api.updates).toEqual([]);
  });
  it('skips unsupported destinations and reaches the next supported tab',async()=>{
    api.tabs=[{id:1,index:0,windowId:7,url:'https://www.bilibili.com/'},{id:3,index:1,windowId:7,url:'edge://settings/'},{id:2,index:2,windowId:7,url:'https://other.example/'}];
    const router=createTabRouter();expect((await router.handle(request,sender)).switched).toBe(true);
    expect(api.current).toBe(2);
  });
  it('rejects paused, inactive, unfocused, editing and revoked sources',async()=>{
    const router=createTabRouter(),fallback={...sender,tab:{id:1,index:0,windowId:7,url:'https://www.bilibili.com/'}};
    api.enabled=false;expect((await router.handle(request,fallback)).reason).toBe('paused');api.enabled=true;
    api.current=2;expect((await router.handle(request,fallback)).reason).toBe('inactive');api.current=1;
    api.focused=false;expect((await router.handle(request,fallback)).reason).toBe('window');api.focused=true;
    api.focus=false;expect((await router.handle(request,fallback)).reason).toBe('focus');api.focus=true;
    api.permitted=false;forgetPageGrants();expect((await router.handle(request,fallback)).reason).toBe('permission');
    expect(api.updates).toEqual([]);
  });
  it('rechecks activity after slow validation and refuses concurrent or stale commands',async()=>{
    const router=createTabRouter();let release!:()=>void;
    api.focusWait=new Promise(resolve=>{release=resolve;});
    const pending=router.handle(request,sender); await new Promise(r=>setTimeout(r,0));
    expect((await router.handle(request,sender)).reason).toBe('busy');
    api.current=2;release();expect((await pending).reason).toBe('changed');
    expect((await router.handle({...request,sampledAt:Date.now()-1000},sender)).reason).toBe('stale');
    expect(api.updates).toEqual([]);
  });
  it('refuses activation when the window loses focus between validation and the switch',async()=>{
    api.windowQueue=[true,false];
    const router=createTabRouter();expect((await router.handle(request,sender)).reason).toBe('changed');
    expect(api.updates).toEqual([]);
  });
  it('repeatedly rejects a fallback-frame request once the top document reports its own reader',async()=>{
    api.documentReader=true;const router=createTabRouter();
    expect((await router.handle(request,sender)).reason).toBe('document-reader');
    expect(api.updates).toEqual([]);
  });
  it('bounds diagnostics and only retains categories and durations',async()=>{
    const router=createTabRouter();
    for(let i=0;i<45;i++) await router.handle(request,{...sender,id:'untrusted'});
    expect(router.snapshot()).toHaveLength(40);
    expect(Object.keys(router.snapshot()[0]!).sort()).toEqual(['activationMs','deliveryMs','preparation','reason','selectionMs','totalMs','validationMs']);
  });
  it('does not query optional contexts behind an already-known adjacent target',async()=>{
    api.tabs.push({id:4,index:3,windowId:7,url:''});api.contexts.mockImplementation(()=>new Promise(()=>{}));
    const router=createTabRouter();expect((await router.handle(request,sender)).switched).toBe(true);
    expect(api.current).toBe(2);expect(api.contexts).not.toHaveBeenCalled();
  });
  it('resolves an unknown URL when its ordered position could be our Demo',async()=>{
    api.tabs[1]!.index=2;api.tabs.push({id:4,index:1,windowId:7,url:''});api.contexts.mockResolvedValue([{tabId:4,frameId:0,documentUrl:'chrome-extension://own/demo.html'}]);
    const router=createTabRouter();expect((await router.handle(request,sender)).switched).toBe(true);
    expect(api.current).toBe(4);expect(api.contexts).toHaveBeenCalledTimes(1);
  });
  it('shares one context lookup across several unknown entries before the next web page',async()=>{
    api.tabs[1]!.index=4;api.tabs[2]!.index=5;
    api.tabs.push({id:4,index:1,windowId:7,url:''},{id:5,index:2,windowId:7,url:''},{id:6,index:3,windowId:7,url:''});
    const router=createTabRouter();expect((await router.handle(request,sender)).switched).toBe(true);
    expect(api.current).toBe(2);expect(api.contexts).toHaveBeenCalledTimes(1);
  });
});
