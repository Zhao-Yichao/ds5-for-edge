export type ProbeState = 'absent' | 'unsupported' | 'available' | 'blocked' | 'unavailable' | 'error';
export interface DeviceReading { state: ProbeState; pad?: Gamepad; connected: number; supported: number; key: string }
// Identity is transient selection state only. Never send key/id over a bridge
// or include it in diagnostics. A standard device must not be masked by an
// earlier connected, unmapped device (e.g. during a connection change).
export function readGamepad(preferred = ''): DeviceReading {
  const empty = (state: ProbeState): DeviceReading => ({state,connected:0,supported:0,key:''});
  if(typeof navigator.getGamepads!=='function')return empty('unavailable');
  try {
    const connected=Array.from(navigator.getGamepads()).filter((p):p is Gamepad=>!!p?.connected);
    const supported=connected.filter(p=>p.mapping==='standard');
    const key=(p:Gamepad)=>`${p.index}:${p.id}:${p.mapping}:${p.buttons.length}:${p.axes.length}`;
    const pad=supported.find(p=>key(p)===preferred)??supported[0]??connected[0];
    return {state:supported.length?'available':connected.length?'unsupported':'absent',pad,connected:connected.length,supported:supported.length,key:pad?key(pad):''};
  }catch(error){return empty(error instanceof Error&&error.name==='SecurityError'?'blocked':'error');}
}

export interface GamepadHealth {
  phase: ProbeState | 'paused' | 'waiting-release' | 'ready';
  discovery: ProbeState;
  connected: number; supported: number; mapping: 'standard' | 'unmapped' | 'none';
  buttons: number; axes: number; transport: 'unknown'; emitted: number;
}

export function cleanGamepadHealth(value: unknown): GamepadHealth | null {
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  const phases=['absent','unsupported','available','blocked','unavailable','error','paused','waiting-release','ready'];
  if(typeof v.phase!=='string'||!phases.includes(v.phase)||typeof v.discovery!=='string'||!phases.slice(0,6).includes(v.discovery)||typeof v.mapping!=='string'||!['standard','unmapped','none'].includes(v.mapping))return null;
  const count=(key:string,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.max(0,Math.min(max,Math.floor(v[key] as number))):0;
  return {phase:v.phase as GamepadHealth['phase'],discovery:v.discovery as ProbeState,connected:count('connected',64),supported:count('supported',64),mapping:v.mapping as GamepadHealth['mapping'],buttons:count('buttons',256),axes:count('axes',64),emitted:count('emitted',1000000),transport:'unknown'};
}
