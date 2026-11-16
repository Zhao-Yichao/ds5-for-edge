import { describe, expect, it } from 'vitest';
import { RepeatGate } from '../../src/extension/core/input';

const input = (down: boolean, repeat = true) => [{ id: 'seek', down, action: { kind: 'seek' as const, seconds: 5 }, ...(repeat ? { repeat: { delay: 400, interval: 200 } } : {}) }];
describe('press, hold, release and rearm', () => {
  it('requires neutral after startup and cancellation', () => {
    const gate = new RepeatGate();
    expect(gate.sample(input(true), 0)).toEqual([]);
    gate.sample(input(false), 1);
    expect(gate.sample(input(true), 2)).toHaveLength(1);
    gate.reset();
    expect(gate.sample(input(true), 1000)).toEqual([]);
    gate.sample(input(false), 1001);
    expect(gate.sample(input(true), 1002)).toHaveLength(1);
  });
  it('repeats after the delay and stops immediately on release', () => {
    const gate = new RepeatGate(); gate.sample(input(false), 0);
    expect(gate.sample(input(true), 1)).toHaveLength(1);
    expect(gate.sample(input(true), 400)).toEqual([]);
    expect(gate.sample(input(true), 401)).toHaveLength(1);
    expect(gate.sample(input(true), 601)).toHaveLength(1);
    expect(gate.sample(input(false), 602)).toEqual([]);
    expect(gate.sample(input(false), 1200)).toEqual([]);
  });
  it('does not replay a backlog after a stall or repeat single-shot actions', () => {
    const gate = new RepeatGate(); gate.sample(input(false), 0); gate.sample(input(true), 1);
    expect(gate.sample(input(true), 5000)).toHaveLength(1);
    expect(gate.sample(input(true), 5001)).toEqual([]);
    gate.sample(input(false, false), 6000);
    expect(gate.sample(input(true, false), 6001)).toHaveLength(1);
    expect(gate.sample(input(true, false), 9000)).toEqual([]);
  });
});
