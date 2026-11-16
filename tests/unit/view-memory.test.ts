import { describe, expect, it } from 'vitest';
import { adjustedVolume, cancelStep, ViewMemory } from '../../src/extension/core/view-memory';

describe('single-step cancel policy', () => {
  const state = { menu: false, dialog: false, unknownOverlay: false, fullscreen: false, canBack: true };
  it('only chooses one foreground layer', () => {
    expect(cancelStep({ ...state, menu: true, dialog: true, fullscreen: true })).toBe('menu');
    expect(cancelStep({ ...state, dialog: true, fullscreen: true })).toBe('dialog');
    expect(cancelStep({ ...state, fullscreen: true })).toBe('fullscreen');
    expect(cancelStep(state)).toBe('history');
  });
  it('never navigates back through an unknown overlay or uncertain history', () => {
    expect(cancelStep({ ...state, unknownOverlay: true, fullscreen: true })).toBe('unavailable');
    expect(cancelStep({ ...state, canBack: false })).toBe('unavailable');
  });
});
describe('bounded document view memory', () => {
  it('isolates routes and returns defensive snapshots', () => {
    const memory = new ViewMemory(); memory.save('list', { target: 'card-2', x: 0, y: 500 });
    const restored = memory.get('list')!; restored.y = 999;
    expect(memory.get('list')?.y).toBe(500); expect(memory.get('other')).toBeNull();
  });
  it('expires oldest entries and ignores invalid coordinates', () => {
    const memory = new ViewMemory(2);
    memory.save('one', { target: null, x: 0, y: 0 }); memory.save('two', { target: null, x: 0, y: 1 });
    memory.save('three', { target: null, x: 0, y: 2 }); memory.save('bad', { target: null, x: NaN, y: 0 });
    expect(memory.get('one')).toBeNull(); expect(memory.get('two')?.y).toBe(1); expect(memory.get('bad')).toBeNull();
  });
});
describe('video volume', () => {
  it('keeps five percent steps within zero and one without floating point drift', () => {
    expect(adjustedVolume(0.99, 0.05)).toBe(1); expect(adjustedVolume(0.01, -0.05)).toBe(0);
    expect(adjustedVolume(0.55, -0.05)).toBe(0.5);
  });
});
