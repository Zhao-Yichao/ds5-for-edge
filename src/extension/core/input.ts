import type { Action } from './actions';
import type { InputTiming } from './diagnostics';
import { readGamepad, type DeviceReading, type GamepadHealth } from './gamepad-device';

// Kept across sampler restarts in this document, never persisted or used as a
// privilege check. It distinguishes queued webpage input from consumed menu input.
let menuEpoch = 0;

/** Every new session must observe neutral input before it can emit actions. */
export class RepeatGate<T = Action> {
  private states = new Map<string, { down: boolean; next: number }>();
  private armed = false;
  get ready() { return this.armed; }
  reset() { this.states.clear(); this.armed = false; }
  sample(inputs: readonly { id: string; down: boolean; action: T; repeat?: { delay: number; interval: number } }[], now: number): T[] {
    if (!this.armed) {
      if (inputs.every(input => !input.down)) this.armed = true;
      return [];
    }
    const actions: T[] = [];
    for (const input of inputs) {
      const previous = this.states.get(input.id);
      if (input.down && !previous?.down) {
        actions.push(input.action);
        this.states.set(input.id, { down: true, next: now + (input.repeat?.delay ?? Infinity) });
      } else if (input.down && input.repeat && previous && now >= previous.next) {
        actions.push(input.action);
        // No catch-up bursts after a stalled event loop.
        previous.next = now + input.repeat.interval;
      } else if (!input.down) this.states.delete(input.id);
    }
    return actions;
  }
}

export function startGamepad(onAction: (action: Action, timing?: InputTiming) => void, onStatus: (text: string, health?: GamepadHealth) => void): () => void {
  const gate = new RepeatGate();
  let frame = 0, stopped = false, lastStatus = '', lastDevice = '', lastTime = 0, route = location.href;
  let emitted = 0, lastPublish = 0, publishedCount = -1;
  const status = (reading: DeviceReading, phase: GamepadHealth['phase'], now: number) => {
    const text = ({absent:'未检测到手柄 · 按键唤醒并检查连接',unsupported:'已发现手柄 · 映射未支持，未执行动作',blocked:'浏览器限制了手柄读取',unavailable:'当前页面没有手柄读取接口',error:'手柄读取失败 · 查看诊断',paused:'已暂停采样 · 页面未在前台',available:'已发现手柄', 'waiting-release':'已发现手柄 · 请释放按键和摇杆',ready:emitted?'已检测到输入 · 页面动作请看诊断':'已发现手柄 · 标准映射 · 等待输入'} satisfies Record<GamepadHealth['phase'],string>)[phase];
    const signature=`${text}:${reading.connected}:${reading.supported}:${reading.pad?.buttons.length}:${reading.pad?.axes.length}`;
    if(signature!==lastStatus || (emitted!==publishedCount&&now-lastPublish>=250)) {
      lastStatus=signature;lastPublish=now;publishedCount=emitted;
      onStatus(text,{phase,discovery:reading.state,connected:reading.connected,supported:reading.supported,mapping:reading.pad?(reading.pad.mapping==='standard'?'standard':'unmapped'):'none',buttons:reading.pad?.buttons.length??0,axes:reading.pad?.axes.length??0,transport:'unknown',emitted});
    }
  };
  const reset = () => gate.reset();
  // Observe actual neutral state at activation rather than waiting for the
  // first animation frame. Already-held controls still leave the gate disarmed.
  const resume = () => {
    gate.reset(); lastTime = performance.now();
    if (document.hidden || !document.hasFocus()) return;
    const reading=readGamepad(lastDevice), pad=reading.pad;
    if (reading.state!=='available'||!pad) return;
    lastDevice = reading.key;
    gate.sample(pageInputs(pad), lastTime);
  };
  const menuClosed = (event: Event) => {
    const epoch=(event as CustomEvent<{epoch?:unknown}>).detail?.epoch;
    if(typeof epoch==='number'&&Number.isSafeInteger(epoch)&&epoch>=0)menuEpoch=epoch;
    resume();
  };
  window.addEventListener('ds5-menu-session',menuClosed);
  window.addEventListener('blur', reset);
  window.addEventListener('focus', resume);
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('gamepaddisconnected', reset);
  const reconnect=()=>{lastDevice='';resume();};
  window.addEventListener('gamepadconnected',reconnect);
  const poll = (now: number) => {
    if (stopped) return;
    frame = requestAnimationFrame(poll);
    if (route !== location.href) { route = location.href; gate.reset(); }
    if (now - lastTime > 300) gate.reset();
    const frameGapMs = now-lastTime, elapsed = Math.min(32, frameGapMs || 16); lastTime = now;
    const reading=readGamepad(lastDevice),pad=reading.pad;
    if (!document.hasFocus() || document.hidden) { gate.reset();status(reading,'paused',now);return; }
    if(reading.state!=='available'||!pad){gate.reset();lastDevice='';status(reading,reading.state,now);return;}
    const device = reading.key;
    if (device !== lastDevice) { gate.reset(); lastDevice = device; }
    const timing={sampledAt:performance.timeOrigin+now,frameGapMs,menuEpoch};
    for (const action of gate.sample(pageInputs(pad), now)) { emitted=Math.min(1000000,emitted+1);onAction(action,timing); }
    // Scroll is continuous but cannot resume with an already held stick after reset.
    const scroll = pad.axes[3] ?? 0;
    if (Math.abs(scroll) > 0.2 && gate.ready) {emitted=Math.min(1000000,emitted+1);onAction({ kind: 'scroll', amount: scroll * elapsed * 0.8 },timing);}
    status(reading,gate.ready?'ready':'waiting-release',now);
  };
  resume();
  frame = requestAnimationFrame(poll);
  return () => {
    stopped = true; cancelAnimationFrame(frame); gate.reset();
    window.removeEventListener('blur', reset); window.removeEventListener('focus', resume);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('gamepaddisconnected', reset);
    window.removeEventListener('gamepadconnected',reconnect);
    window.removeEventListener('ds5-menu-session',menuClosed);
  };
}

export function menuInputs(pad: Gamepad) {
  const down=(n:number)=>(pad.buttons[n]?.value??0)>.55, x=pad.axes[0]??0, y=pad.axes[1]??0;
  const repeat={delay:420,interval:160};
  return [
    {id:'up',down:down(12)||y<-.6,action:{kind:'navigate',direction:'up'} as Action,repeat},
    {id:'down',down:down(13)||y>.6,action:{kind:'navigate',direction:'down'} as Action,repeat},
    {id:'left',down:down(14)||x<-.6,action:{kind:'navigate',direction:'left'} as Action,repeat},
    {id:'right',down:down(15)||x>.6,action:{kind:'navigate',direction:'right'} as Action,repeat},
    {id:'confirm',down:down(0),action:{kind:'activate'} as Action},
    {id:'cancel',down:down(1),action:{kind:'cancel'} as Action},
  ];
}
function pageInputs(pad: Gamepad) {
    const button = (n: number) => (pad.buttons[n]?.value ?? 0) > 0.55;
    const x = pad.axes[0] ?? 0, y = pad.axes[1] ?? 0;
    const repeat = { delay: 420, interval: 160 };
    return [
      { id: 'up', down: button(12) || y < -0.6, action: { kind: 'navigate', direction: 'up' } as Action, repeat },
      { id: 'down', down: button(13) || y > 0.6, action: { kind: 'navigate', direction: 'down' } as Action, repeat },
      { id: 'left', down: button(14) || x < -0.6, action: { kind: 'navigate', direction: 'left' } as Action, repeat },
      { id: 'right', down: button(15) || x > 0.6, action: { kind: 'navigate', direction: 'right' } as Action, repeat },
      ...(['activate', 'cancel', 'play', 'fullscreen'] as const).map((kind, n) => ({ id: kind, down: button(n), action: { kind } as Action })),
      { id: 'backward', down: button(6), action: { kind: 'seek', seconds: -5 } as Action, repeat: { delay: 400, interval: 200 } },
      { id: 'forward', down: button(7), action: { kind: 'seek', seconds: 5 } as Action, repeat: { delay: 400, interval: 200 } },
      { id: 'mute', down: button(11), action: { kind: 'mute' } as Action },
      { id: 'menu', down: button(9), action: { kind: 'menu' } as Action },
      { id: 'back', down: button(10), action: { kind: 'back' } as Action },
      { id: 'scroll-guard', down: Math.abs(pad.axes[3] ?? 0) > 0.2, action: { kind: 'scroll', amount: 0 } as Action },
    ];
}
