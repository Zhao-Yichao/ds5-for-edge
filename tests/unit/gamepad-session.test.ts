import { afterEach, describe, expect, it, vi } from 'vitest';
import { startGamepad } from '../../src/extension/core/input';
import type { Action } from '../../src/extension/core/actions';

afterEach(()=>vi.unstubAllGlobals());
function session(held=false){
  const window=new EventTarget(),document=Object.assign(new EventTarget(),{hidden:false,hasFocus:()=>focused});
  let focused=true,time=0,next=0;
  const callbacks=new Map<number,FrameRequestCallback>();
  const pad={connected:true,index:0,id:'SYNTHETIC',mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0}))};
  pad.buttons[15]!.value=held?1:0;
  vi.stubGlobal('window',window);vi.stubGlobal('document',document);
  vi.stubGlobal('navigator',{getGamepads:()=>[pad]});vi.stubGlobal('location',{href:'https://fixture.example/'});
  vi.stubGlobal('performance',{now:()=>time});
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callbacks.set(++next,callback);return next;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>callbacks.delete(id));
  const actions:Action[]=[],states:string[]=[],discoveries:string[]=[];
  const stop=startGamepad(action=>actions.push(action),(_text,health)=>{if(health){states.push(health.phase);discoveries.push(health.discovery);}});
  return {pad,actions,states,discoveries,stop,
    menuClosed(){window.dispatchEvent(new CustomEvent('ds5-menu-session',{detail:{epoch:1}}));},
    reconnect(){window.dispatchEvent(new Event('gamepadconnected'));},
    frame(delta=16){time+=delta;const pending=[...callbacks.values()];callbacks.clear();for(const callback of pending)callback(time);},
    focus(value:boolean){focused=value;document.hidden=!value;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event(value?'focus':'blur'));},
  };
}
describe('page gamepad activation',()=>{
  it('requires release after a menu consumes a held button before page actions resume',()=>{
    const s=session();s.frame();s.pad.buttons[1]!.value=1;s.frame();expect(s.actions).toEqual([{kind:'cancel'}]);
    s.menuClosed();s.frame();s.frame(200);expect(s.actions).toHaveLength(1);
    s.pad.buttons[1]!.value=0;s.frame();s.pad.buttons[0]!.value=1;s.frame();expect(s.actions.at(-1)).toEqual({kind:'activate'});s.stop();
  });
  it('maps L3 to one explicit back action per fresh press without repeating a hold',()=>{
    const s=session();s.frame();s.pad.buttons[10]!.value=1;s.frame();s.frame(200);s.frame(200);
    expect(s.actions).toEqual([{kind:'back'}]);
    s.focus(false);s.focus(true);s.frame();expect(s.actions).toHaveLength(1);
    s.pad.buttons[10]!.value=0;s.frame();s.pad.buttons[10]!.value=1;s.frame();
    expect(s.actions).toEqual([{kind:'back'},{kind:'back'}]);s.stop();
  });
  it('accepts a fresh press before the first animation frame after observing neutral at startup',()=>{
    const s=session();s.pad.buttons[15]!.value=1;s.frame();
    expect(s.actions).toEqual([{kind:'navigate',direction:'right'}]);s.stop();
  });
  it('accepts a fresh press before the first frame after a long hidden interval',()=>{
    const s=session();s.frame();s.focus(false);s.frame(1000);expect(s.states.at(-1)).toBe('paused');expect(s.discoveries.at(-1)).toBe('available');s.focus(true);
    s.pad.buttons[15]!.value=1;s.frame();
    expect(s.actions).toEqual([{kind:'navigate',direction:'right'}]);s.stop();
  });
  it('does not activate a held button or scroll stick when the page resumes',()=>{
    const s=session();s.frame();s.focus(false);s.pad.buttons[0]!.value=1;s.pad.axes[3]=0.8;
    s.frame(1000);s.focus(true);s.frame();s.frame(500);
    expect(s.actions).toEqual([]);
    s.pad.buttons[0]!.value=0;s.pad.axes[3]=0;s.frame();s.pad.buttons[0]!.value=1;s.frame();
    expect(s.actions).toEqual([{kind:'activate'}]);s.stop();
  });
  it('keeps startup-held input disarmed and cancels repetition after a sampling stall',()=>{
    const s=session(true);s.frame();expect(s.actions).toEqual([]);
    s.pad.buttons[15]!.value=0;s.frame();s.pad.buttons[15]!.value=1;s.frame();
    expect(s.actions).toHaveLength(1);s.frame(1000);s.frame(500);
    expect(s.actions).toHaveLength(1);s.stop();
  });
  it('re-observes neutral on a connection event and refuses held input after a same-slot reconnection',()=>{
    const s=session();s.frame();s.pad.buttons[0]!.value=1;s.reconnect();s.frame();expect(s.actions).toEqual([]);expect(s.states.at(-1)).toBe('waiting-release');
    s.pad.buttons[0]!.value=0;s.frame();s.pad.buttons[0]!.value=1;s.frame();expect(s.actions).toEqual([{kind:'activate'}]);
    s.pad.buttons[0]!.value=0;s.reconnect();s.pad.buttons[15]!.value=1;s.frame();expect(s.actions.at(-1)).toEqual({kind:'navigate',direction:'right'});s.stop();
  });
});
