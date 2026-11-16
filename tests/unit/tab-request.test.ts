import {afterEach,describe,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('wxt/browser',()=>({browser:{runtime:{sendMessage:api.send}}}));
import {requestTabSwitch} from '../../src/extension/content/tab-request';
afterEach(()=>{vi.useRealTimers();api.send.mockReset();});
describe('trusted reader request completion',()=>{
  it('recovers from a silent runtime for both readers and ignores its late reply',async()=>{
    vi.useFakeTimers();
    for(const type of ['ds5-switch-gamepad','ds5-switch-document-gamepad'] as const){
      let reply!:(result:{reason:string})=>void;api.send.mockImplementationOnce(()=>new Promise(resolve=>{reply=resolve;}));
      const first=requestTabSwitch(type,1);await vi.advanceTimersByTimeAsync(1201);expect(await first).toEqual({reason:'request-timeout'});
      api.send.mockResolvedValueOnce({reason:'switched'});expect(await requestTabSwitch(type,-1)).toEqual({reason:'switched'});
      reply({reason:'switched'});expect(await first).toEqual({reason:'request-timeout'});
    }
  });
  it('returns a defined failure when the runtime rejects',async()=>{
    api.send.mockRejectedValueOnce(Error('disconnected'));expect(await requestTabSwitch('ds5-switch-document-gamepad',1)).toEqual({reason:'unavailable'});
  });
});
