import {afterEach,describe,it,expect,vi} from 'vitest';
import {cleanGamepadHealth,readGamepad} from '../../src/extension/core/gamepad-device';
afterEach(()=>vi.unstubAllGlobals());
const pad=(index:number,mapping='standard')=>({connected:true,index,id:`PRIVATE DEVICE ${index}`,mapping,buttons:Array(17).fill({value:0}),axes:[0,0,0,0]});
describe('gamepad discovery and bounded diagnostics',()=>{
 it('does not let an unmapped first device mask a standard second device',()=>{
  const devices=[pad(0,''),pad(1)];vi.stubGlobal('navigator',{getGamepads:()=>devices});
  const result=readGamepad();expect(result.pad).toBe(devices[1]);expect(result).toMatchObject({state:'available',connected:2,supported:1});
 });
 it('keeps a selected standard pad stable and selects the surviving device after disconnect',()=>{
  const devices=[pad(0),pad(1)];vi.stubGlobal('navigator',{getGamepads:()=>devices});
  const first=readGamepad();devices.reverse();expect(readGamepad(first.key).pad?.index).toBe(0);
  devices[1]!.connected=false;expect(readGamepad(first.key).pad?.index).toBe(1);
 });
 it('distinguishes absent, unsupported, unavailable and browser-denied discovery',()=>{
  vi.stubGlobal('navigator',{});expect(readGamepad().state).toBe('unavailable');
  vi.stubGlobal('navigator',{getGamepads:()=>[null]});expect(readGamepad().state).toBe('absent');
  vi.stubGlobal('navigator',{getGamepads:()=>[pad(0,'')]});expect(readGamepad().state).toBe('unsupported');
  vi.stubGlobal('navigator',{getGamepads:()=>{const e=new Error('private detail');e.name='SecurityError';throw e;}});expect(readGamepad().state).toBe('blocked');
 });
 it('only accepts allowlisted, bounded health fields; never infers a transport or copies identifiers',()=>{
  expect(cleanGamepadHealth({phase:'unknown',mapping:'standard'})).toBeNull();
  expect(cleanGamepadHealth({phase:['ready'],mapping:'standard'})).toBeNull();
  const state=cleanGamepadHealth({phase:'ready',discovery:'available',mapping:'standard',connected:1e9,supported:1,emitted:Infinity,buttons:17,axes:4,id:'PRIVATE',transport:'bluetooth',url:'private'});
  expect(state).toEqual({phase:'ready',discovery:'available',mapping:'standard',connected:64,supported:1,emitted:0,buttons:17,axes:4,transport:'unknown'});
 });
});
