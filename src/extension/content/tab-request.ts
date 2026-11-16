import { browser } from 'wxt/browser';
import type { TabDirection } from '../core/browser-control';

// Both trusted readers share request completion and recovery. The routing itself
// is bounded now that destinations are prepared after activation, so a silent
// runtime releases the reader quickly instead of swallowing the next press for
// more than a second.
export async function requestTabSwitch(type:'ds5-switch-gamepad'|'ds5-switch-document-gamepad',direction:TabDirection):Promise<{reason:string}> {
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {
    const result=await Promise.race([
      browser.runtime.sendMessage({type,direction,sampledAt:Date.now()}),
      new Promise<{reason:string}>(resolve=>{timer=setTimeout(()=>resolve({reason:'request-timeout'}),500);}),
    ]);
    return {reason:typeof result?.reason==='string'?result.reason:'unavailable'};
  } catch { return {reason:'unavailable'}; }
  finally { clearTimeout(timer); }
}
