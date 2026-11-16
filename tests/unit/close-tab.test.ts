import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({get:vi.fn(),remove:vi.fn(),window:vi.fn(),state:vi.fn(),focus:vi.fn(),permit:vi.fn(),contexts:vi.fn()}));
vi.mock('wxt/browser',()=>({browser:{runtime:{id:'own',getURL:(s:string)=>`chrome-extension://own${s}`,getContexts:api.contexts},tabs:{get:api.get,remove:api.remove,sendMessage:api.focus},windows:{get:api.window},storage:{local:{get:api.state}}}}));
vi.mock('../../src/extension/content/site-access',()=>({permittedPage:api.permit}));
import { createTabCloser } from '../../src/extension/content/close-tab';
const source={id:'own',url:'https://fixture.example/a',frameId:0,documentId:'doc',tab:{id:7}};
beforeEach(()=>{
 vi.resetAllMocks();api.get.mockResolvedValue({id:7,active:true,url:source.url,windowId:2});api.remove.mockResolvedValue(undefined);
 api.window.mockResolvedValue({focused:true});api.state.mockResolvedValue({controlEnabled:true});api.focus.mockResolvedValue({allowed:true});api.permit.mockResolvedValue(true);
});
afterEach(()=>vi.useRealTimers());
describe('close only the eligible request source',()=>{
 it('rechecks the originating document and menu choice just before removal',async()=>{
  api.focus.mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({allowed:false});
  expect((await createTabCloser()(source)).ok).toBe(false);expect(api.remove).not.toHaveBeenCalled();
 });
 it('uses live packaged document identity when the Demo tab URL is hidden',async()=>{
  api.get.mockResolvedValue({id:7,active:true,windowId:2});api.contexts.mockResolvedValue([{tabId:7,frameId:0,documentUrl:'chrome-extension://own/demo.html'}]);
  expect((await createTabCloser()({...source,url:'chrome-extension://own/demo.html'})).ok).toBe(true);
  expect(api.focus).not.toHaveBeenCalled();expect(api.remove).toHaveBeenCalledExactlyOnceWith(7);
 });
 it('does not close a Demo tab after its original document has disappeared',async()=>{
  api.get.mockResolvedValue({id:7,active:true,windowId:2});api.contexts.mockResolvedValue([]);
  expect((await createTabCloser()({...source,url:'chrome-extension://own/demo.html'})).ok).toBe(false);expect(api.remove).not.toHaveBeenCalled();
 });
 it('closes its source tab after checking the same document and live activity',async()=>{
  expect(await createTabCloser()(source)).toEqual({ok:true,reason:'closed'});expect(api.remove).toHaveBeenCalledExactlyOnceWith(7);
  expect(api.focus).toHaveBeenCalledWith(7,{type:'ds5-close-focus'},{documentId:'doc'});
 });
 it('rejects external, subframe and protected-page sources before any removal',async()=>{
  const close=createTabCloser();for(const s of [{...source,id:'page'},{...source,frameId:3},{...source,url:'edge://settings'}])expect((await close(s)).ok).toBe(false);
  expect(api.remove).not.toHaveBeenCalled();
 });
 it('requires an active tab, foreground window, enabled control, permission and selected close command',async()=>{
  const close=createTabCloser();api.get.mockResolvedValueOnce({active:false,windowId:2});expect((await close(source)).ok).toBe(false);
  for(const [mock,value] of [[api.window,{focused:false}],[api.state,{controlEnabled:false}],[api.permit,false],[api.focus,{allowed:false}]] as const){
   const previous=mock.getMockImplementation();mock.mockResolvedValueOnce(value);expect((await close(source)).ok).toBe(false);mock.mockImplementation(previous!);
  }
  expect(api.remove).not.toHaveBeenCalled();
 });
 it('refuses a changed active tab/document URL after asynchronous validation',async()=>{
  const close=createTabCloser();api.get.mockResolvedValueOnce({active:true,url:source.url,windowId:2}).mockResolvedValueOnce({active:true,url:'https://fixture.example/new',windowId:2});
  expect((await close(source)).ok).toBe(false);expect(api.remove).not.toHaveBeenCalled();
 });
 it('bounds silent validation, releases the lock and never removes on a late reply',async()=>{
  vi.useFakeTimers();let release!:(v:{allowed:boolean})=>void;api.focus.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));
  const close=createTabCloser(),first=close(source);await vi.advanceTimersByTimeAsync(501);expect((await first).ok).toBe(false);
  release({allowed:true});await vi.advanceTimersByTimeAsync(0);expect(api.remove).not.toHaveBeenCalled();
  expect((await close(source)).ok).toBe(true);expect(api.remove).toHaveBeenCalledTimes(1);
 });
 it('duplicate requests do not release the original lock or cause a second removal',async()=>{
  let release!:(v:{allowed:boolean})=>void;api.focus.mockReturnValueOnce(new Promise(resolve=>{release=resolve;}));const close=createTabCloser();const first=close(source);
  await new Promise(r=>setTimeout(r,0));expect((await close(source)).reason).toBe('busy');expect((await close(source)).reason).toBe('busy');
  release({allowed:true});expect((await first).ok).toBe(true);expect(api.remove).toHaveBeenCalledTimes(1);
 });
});
