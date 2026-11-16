import { browser } from 'wxt/browser';
import { isAction } from '../core/actions';
import { permittedPage, resolveTabUrls } from './site-access';

type Sender={id?:string;url?:string;frameId?:number;documentId?:string;tab?:{id?:number}};
// The extension-origin fallback frame supplies real device edges. Delivery is
// private, expires in the receiver, and the receiver refuses a second reader.
export async function relayFallbackMenu(message:{action?:unknown;sampledAt?:unknown},sender:Sender) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const expiresAt=Date.now()+500;
  const wait=async<T>(p:Promise<T>):Promise<T>=>{
    const ms=expiresAt-Date.now();if(ms<=0)throw new Error('expired');
    try{return await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('expired')),ms);})]);}
    finally{clearTimeout(timer);}
  };
  try{
    if(sender.id!==browser.runtime.id||sender.url!==browser.runtime.getURL('/tab-input.html')||sender.frameId===0
      ||!isAction(message.action)||!['navigate','activate','cancel'].includes(message.action.kind)
      ||typeof message.sampledAt!=='number'||!Number.isFinite(message.sampledAt)||Math.abs(Date.now()-message.sampledAt)>400)return {handled:false};
    let id=sender.tab?.id;
    if(id===undefined&&sender.documentId){const contexts=await wait(browser.runtime.getContexts({documentIds:[sender.documentId]}));id=contexts.find(c=>c.tabId>=0&&c.frameId>0)?.tabId;}
    if(id===undefined)return {handled:false};
    const [tab]=await wait(resolveTabUrls([await wait(browser.tabs.get(id))]));
    if(!tab?.active||tab.windowId===undefined)return {handled:false};
    const [window,state,permission]=await wait(Promise.all([browser.windows.get(tab.windowId),browser.storage.local.get('controlEnabled'),permittedPage(tab.url)]));
    if(!window.focused||state.controlEnabled!==true||!permission||Date.now()>=expiresAt)return {handled:false};
    return await wait(browser.tabs.sendMessage(id,{type:'ds5-deliver-fallback-menu',action:message.action,expiresAt},{frameId:0})) as {handled:boolean};
  }catch{return {handled:false};}
  finally{clearTimeout(timer);}
}
