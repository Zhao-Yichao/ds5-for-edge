import { requestTabSwitch } from './tab-request';
import { RepeatGate, menuInputs } from '../core/input';
import type { Action } from '../core/actions';
import { readGamepad, type DeviceReading } from '../core/gamepad-device';
import type { TabDirection } from '../core/browser-control';

// Runs in the isolated top document, never consumes a webpage message or
// supplied button value. The background still validates source/focus/activity.
// `onFallback` only fires when this world cannot read the Gamepad API at all;
// the extension-origin frame then becomes a genuine fallback instead of a
// second reader racing this one for the same press.
export function startDocumentTabInput(eligible:()=>boolean, onFallback?:(reason:string)=>void, menuInput?:{active:()=>boolean;execute:(action:Action)=>void}) {
  const gate=new RepeatGate<TabDirection>();
  const menuGate=new RepeatGate<Action>();
  let frame=0,stopped=false,pending=false,lastTime=performance.now(),device='',fallbackRequested=false;
  let state={available:false,phase:'starting',connected:0,supported:0,result:'none',pending:false,sentAt:0};
  const inputs=(pad:Gamepad)=>[
    {id:'previous',down:(pad.buttons[4]?.value??0)>.55,action:-1 as TabDirection},
    {id:'next',down:(pad.buttons[5]?.value??0)>.55,action:1 as TabDirection},
  ];
  const noteReading=(reading:DeviceReading)=>{
    if(fallbackRequested)return;
    if(reading.state==='blocked'||reading.state==='unavailable'){fallbackRequested=true;onFallback?.(reading.state);}
  };
  const resume=()=>{
    gate.reset();menuGate.reset();lastTime=performance.now();
    const reading=readGamepad(device);state.available=reading.state==='available';noteReading(reading);
    if(eligible()&&reading.pad&&state.available){device=reading.key;gate.sample(inputs(reading.pad),lastTime);}
    if(menuInput?.active()&&reading.pad&&state.available)menuGate.sample(menuInputs(reading.pad),lastTime);
  };
  const poll=(now:number)=>{
    if(stopped)return;frame=requestAnimationFrame(poll);
    if(now-lastTime>300){gate.reset();menuGate.reset();}lastTime=now;
    const reading=readGamepad(device);state.available=reading.state==='available';state.connected=reading.connected;state.supported=reading.supported;noteReading(reading);
    if(!state.available||!reading.pad){gate.reset();menuGate.reset();device='';state.phase=reading.state;return;}
    if(device!==reading.key){gate.reset();menuGate.reset();device=reading.key;}
    if(menuInput?.active())for(const action of menuGate.sample(menuInputs(reading.pad),now))menuInput.execute(action);
    else menuGate.reset();
    if(!eligible()){gate.reset();state.phase='protected';return;}
    const buttons=inputs(reading.pad);
    if(buttons.every(b=>b.down)){gate.reset();state.phase='waiting-release';return;}
    const directions=gate.sample(buttons,now);state.phase=gate.ready?'ready':'waiting-release';
    if(directions.length===1&&!pending){
      pending=true;state.pending=true;state.sentAt=Date.now();
      void requestTabSwitch('ds5-switch-document-gamepad',directions[0]!)
        .then(result=>{state.result=result.reason;}).finally(()=>{pending=false;state.pending=false;});
    }
  };
  const events=['focus','blur','pageshow','gamepadconnected','gamepaddisconnected'];
  for(const event of events)window.addEventListener(event,resume);
  document.addEventListener('visibilitychange',resume);
  resume();frame=requestAnimationFrame(poll);
  return {snapshot:()=>({...state}),destroy(){stopped=true;cancelAnimationFrame(frame);gate.reset();for(const event of events)window.removeEventListener(event,resume);document.removeEventListener('visibilitychange',resume);}};
}
