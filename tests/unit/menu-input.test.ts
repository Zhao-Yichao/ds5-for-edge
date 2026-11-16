import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({tab:vi.fn(),window:vi.fn(),state:vi.fn(),send:vi.fn(),permit:vi.fn()}));
vi.mock('wxt/browser',()=>({browser:{runtime:{id:'own',getURL:(s:string)=>`chrome-extension://own${s}`},tabs:{get:api.tab,sendMessage:api.send},windows:{get:api.window},storage:{local:{get:api.state}}}}));
vi.mock('../../src/extension/content/site-access',()=>({permittedPage:api.permit,resolveTabUrls:async(t:unknown)=>t}));
import {relayFallbackMenu} from '../../src/extension/content/menu-input';
const sender={id:'own',url:'chrome-extension://own/tab-input.html',frameId:2,tab:{id:7}};
const message=()=>({action:{kind:'activate'},sampledAt:Date.now()});
beforeEach(()=>{vi.resetAllMocks();api.tab.mockResolvedValue({id:7,active:true,windowId:2,url:'https://fixture.example/'});api.window.mockResolvedValue({focused:true});api.state.mockResolvedValue({controlEnabled:true});api.permit.mockResolvedValue(true);api.send.mockResolvedValue({handled:true});});
afterEach(()=>vi.useRealTimers());
it('relays only real fallback-source menu actions to its own top document with expiry',async()=>{
 expect(await relayFallbackMenu(message(),sender)).toEqual({handled:true});expect(api.send).toHaveBeenCalledWith(7,expect.objectContaining({type:'ds5-deliver-fallback-menu',action:{kind:'activate'},expiresAt:expect.any(Number)}),{frameId:0});
});
it('rejects page sources, top frames, non-menu actions and stale samples',async()=>{
 for(const [m,s] of [[message(),{...sender,url:'https://fixture.example/'}],[message(),{...sender,frameId:0}],[{action:{kind:'back'},sampledAt:Date.now()},sender],[{...message(),sampledAt:Date.now()-1000},sender]] as const)expect((await relayFallbackMenu(m,s)).handled).toBe(false);
 expect(api.send).not.toHaveBeenCalled();
});
it('requires activity, foreground focus and enabled control before delivering',async()=>{
 api.tab.mockResolvedValueOnce({active:false,windowId:2});expect((await relayFallbackMenu(message(),sender)).handled).toBe(false);
 api.window.mockResolvedValueOnce({focused:false});expect((await relayFallbackMenu(message(),sender)).handled).toBe(false);
 api.state.mockResolvedValueOnce({controlEnabled:false});expect((await relayFallbackMenu(message(),sender)).handled).toBe(false);expect(api.send).not.toHaveBeenCalled();
});
it('does not deliver a late action after silent validation expires',async()=>{
 vi.useFakeTimers();let release!:(v:{focused:boolean})=>void;api.window.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
 const p=relayFallbackMenu(message(),sender);await vi.advanceTimersByTimeAsync(501);expect((await p).handled).toBe(false);release({focused:true});await vi.advanceTimersByTimeAsync(0);expect(api.send).not.toHaveBeenCalled();
});
