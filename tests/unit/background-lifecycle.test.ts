import {beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({updated:null as null|((id:number,change:Record<string,unknown>)=>void),ensure:vi.fn(async()=>true)}));
vi.mock('wxt/utils/define-background',()=>({defineBackground:(run:()=>void)=>({main:run})}));
vi.mock('../../src/extension/content/tab-router',()=>({createTabRouter:()=>({handle:vi.fn(),snapshot:()=>[]})}));
vi.mock('../../src/extension/content/site-access',()=>({ensurePageController:api.ensure,preparePageForSwitch:vi.fn(),forgetPageController:vi.fn(),forgetPageGrants:vi.fn(),syncSiteScripts:async()=>{},attachExistingPages:async()=>{},permittedPage:async()=>true,enableSite:async()=>{}}));
vi.mock('wxt/browser',()=>{
 const event=()=>({addListener:vi.fn()});
 return {browser:{runtime:{id:'own',getURL:(p:string)=>`chrome-extension://own${p}`,onMessage:event(),onInstalled:event(),onStartup:event()},permissions:{onAdded:event(),onRemoved:event()},storage:{onChanged:event()},tabs:{query:async()=>[{id:9,active:true}],onActivated:event(),onRemoved:event(),onReplaced:event(),onUpdated:{addListener:(listener:typeof api.updated)=>{api.updated=listener;}}}}};
});
import background from '../../src/extension/entrypoints/background';
beforeEach(()=>{api.ensure.mockClear();api.updated=null;});
it('repairs a thawed page even when activation happened before frozen cleared',async()=>{
 background.main();api.updated!(7,{frozen:false});await Promise.resolve();expect(api.ensure).toHaveBeenCalledWith(7);
});
it('repairs only the focused tab when the worker wakes, so a press is not queued behind every tab',async()=>{
 background.main();
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(api.ensure).toHaveBeenCalledWith(9);
 expect(api.ensure).not.toHaveBeenCalledWith(7);
});
