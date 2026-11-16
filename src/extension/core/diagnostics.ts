export interface InputTiming { sampledAt?: number; frameGapMs?: number; menuEpoch?: number }
export interface PageTiming {
  kind: string; deliveryMs: number; frameGapMs: number; discoveryMs: number;
  layoutMs: number; selectionMs: number; renderMs: number; totalMs: number; nextFrameMs: number;
  visited: number; styleReads: number; rectReads: number; hitReads: number;
  candidates: number; truncated: boolean;
  membershipHit: boolean;
}
export function newTiming(kind: string, input?: InputTiming): PageTiming {
  const duration = (value: number | undefined) => Number.isFinite(value) ? Math.max(0,Math.min(value!,10000)) : 0;
  return {kind,deliveryMs:duration(input?.sampledAt ? performance.timeOrigin + performance.now()-input.sampledAt : 0),frameGapMs:duration(input?.frameGapMs),
    discoveryMs:0,layoutMs:0,selectionMs:0,renderMs:0,totalMs:0,nextFrameMs:0,visited:0,styleReads:0,rectReads:0,hitReads:0,candidates:0,truncated:false,membershipHit:false};
}
