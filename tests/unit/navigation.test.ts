import { describe, expect, it } from 'vitest';
import { boundedSeek, contentNeighbor, initialCandidate, neighbor } from '../../src/extension/core/navigation';
import { isAction } from '../../src/extension/core/actions';

const target = (id: string, x: number, y: number) => ({ id, rect: { left: x, top: y, right: x + 100, bottom: y + 60 } });
describe('spatial navigation', () => {
  it('prefers the next card in the same row over a closer diagonal', () => {
    const current = target('a', 0, 0);
    expect(neighbor(current, 'right', [current, target('b', 180, 0), target('c', 20, 80)])).toBe('b');
  });
  it('does not wrap or select targets in the opposite direction', () => {
    expect(neighbor(target('a', 0, 0), 'left', [target('b', 150, 0)])).toBeNull();
  });
  it('does not let a one-pixel lane overlap force a distant jump',()=>{
    const current=target('current',0,0);
    const far=target('far',1000,59),near=target('near',110,61);
    expect(neighbor(current,'right',[far,near])).toBe('near');
  });
  it('finds a visible centre/content default without choosing offscreen controls',()=>{
    const viewport={left:0,right:1000,top:0,bottom:800};
    const centre={...target('centre',450,370),content:true};
    expect(initialCandidate([target('top',0,0),target('off',450,900),centre],viewport)?.id).toBe('centre');
    expect(initialCandidate([target('off',450,900)],viewport)).toBeNull();
  });
  it('keeps an explicit path to every small control while preferring primary movement',()=>{
    const a={id:'a',rect:{left:100,right:500,top:100,bottom:300},group:'a',primary:true};
    const tiny={id:'tiny',rect:{left:280,right:320,top:260,bottom:284},group:'a',primary:false};
    const b={id:'b',rect:{left:100,right:500,top:340,bottom:540},group:'b',primary:true};
    expect(contentNeighbor(a,'down',[a,tiny,b])).toBe('b');
    expect(contentNeighbor(a,'down',[a,tiny,b],true)).toBe('tiny');
    const all=[a,tiny,b],seen=new Set(['a']),queue=[a];
    while(queue.length){const current=queue.shift()!;for(const direction of ['up','down','left','right'] as const){const id=contentNeighbor(current,direction,all,true),next=all.find(c=>c.id===id);if(next&&!seen.has(next.id)){seen.add(next.id);queue.push(next);}}}
    expect(seen.size).toBe(all.length);
  });
  it('ignores tiny same-row baseline offsets when moving down', () => {
    const current = target('text', 430, 0);
    expect(neighbor(current, 'down', [target('check', 300, 3), target('next-row', 0, 90)])).toBe('next-row');
    expect(neighbor(current, 'left', [target('check', 300, 3)])).toBe('check');
  });
  it('has a stable result independent of collection order for tied rectangles', () => {
    const a = target('b', 150, 0), b = target('c', 150, 0), current = target('a', 0, 0);
    expect(neighbor(current, 'right', [a, b])).toBe(neighbor(current, 'right', [b, a]));
  });
});
describe('seek and page action boundary', () => {
  it('clamps to the playable range and avoids gaps', () => {
    expect(boundedSeek(8, 5, [[0, 10]])).toBe(10);
    expect(boundedSeek(1, -5, [[0, 10]])).toBe(0);
    expect(boundedSeek(12, 1, [[0, 10], [20, 30]])).toBe(10);
    expect(boundedSeek(0, 5, [])).toBeNull();
    expect(boundedSeek(NaN, 5, [[0, 10]])).toBeNull();
  });
  it('rejects privileged or unbounded actions from the page bridge', () => {
    for (const value of [null, { kind: 'close-tab' }, { kind: 'seek', seconds: 500 }, { kind: 'scroll', amount: Infinity }, { kind: 'navigate', direction: 'back' }, { kind: 'volume', delta: 1 }]) expect(isAction(value)).toBe(false);
    expect(isAction({ kind: 'seek', seconds: 5 })).toBe(true);
    expect(isAction({ kind: 'volume', delta: 0.05 })).toBe(true);
  });
});
