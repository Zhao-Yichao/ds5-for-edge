import { requestTabSwitch } from '../../content/tab-request';
import { RepeatGate, menuInputs } from '../../core/input';
import type { Action } from '../../core/actions';
import { browser } from 'wxt/browser';
import type { TabDirection } from '../../core/browser-control';
import { readGamepad } from '../../core/gamepad-device';

const gate = new RepeatGate<TabDirection>();
const menuGate = new RepeatGate<Action>();
let frame = 0, lastDevice = '', stopped = false, pending = false, lastTime = 0;
function inputs(pad: Gamepad) {
  return [
    { id: 'previous', down: (pad.buttons[4]?.value ?? 0) > 0.55, action: -1 as TabDirection },
    { id: 'next', down: (pad.buttons[5]?.value ?? 0) > 0.55, action: 1 as TabDirection },
  ];
}
function resume() {
  gate.reset(); menuGate.reset(); lastTime = performance.now();
  if (document.hidden) return;
  try {
    const reading=readGamepad(lastDevice),pad=reading.pad;
    if (reading.state==='available'&&pad) { lastDevice = reading.key; gate.sample(inputs(pad), lastTime);menuGate.sample(menuInputs(pad),lastTime); }
  } catch { /* Wait for a safe sample. */ }
}
function poll(now: number) {
  if (stopped) return;
  frame = requestAnimationFrame(poll);
  if (now - lastTime > 300) {gate.reset();menuGate.reset();}
  lastTime = now;
  if (document.hidden) { gate.reset();menuGate.reset(); return; }
  const reading=readGamepad(lastDevice),pad=reading.pad;
  if (reading.state!=='available'||!pad) { lastDevice = ''; gate.reset();menuGate.reset(); return; }
  const device = reading.key;
  if (device !== lastDevice) { lastDevice = device; gate.reset();menuGate.reset(); }
  for(const action of menuGate.sample(menuInputs(pad),now)) {
    void browser.runtime.sendMessage({type:'ds5-fallback-menu-input',action,sampledAt:Date.now()}).catch(()=>{});
  }
  const previous = (pad.buttons[4]?.value ?? 0) > 0.55, next = (pad.buttons[5]?.value ?? 0) > 0.55;
  if (previous && next) { gate.reset(); return; }
  // Observe release during validation; RPC completion must not disarm a press.
  const directions = gate.sample(inputs(pad), now);
  if (directions.length === 1 && !pending) {
    pending = true;
    void requestTabSwitch('ds5-switch-gamepad',directions[0]!).finally(() => { pending = false; });
  }
}
resume(); frame = requestAnimationFrame(poll);
document.addEventListener('visibilitychange', resume);
window.addEventListener('gamepaddisconnected', () => {gate.reset();menuGate.reset();});
window.addEventListener('gamepadconnected', () => {lastDevice='';resume();});
window.addEventListener('pagehide', () => { stopped = true; cancelAnimationFrame(frame); gate.reset(); });
window.addEventListener('pageshow', () => { resume(); if (stopped) { stopped = false; frame = requestAnimationFrame(poll); } });
// No postMessage listener: a website cannot supply gamepad values or tab commands.
