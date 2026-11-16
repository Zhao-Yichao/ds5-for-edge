export interface ViewSnapshot { target: string | null; x: number; y: number }

/** Document-lifetime memory only. No website storage or telemetry. */
export class ViewMemory {
  private entries = new Map<string, ViewSnapshot>();
  constructor(private capacity = 16) {}
  save(route: string, snapshot: ViewSnapshot) {
    if (![snapshot.x, snapshot.y].every(Number.isFinite)) return;
    this.entries.delete(route); this.entries.set(route, { ...snapshot });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
  }
  get(route: string): ViewSnapshot | null {
    const entry = this.entries.get(route);
    return entry ? { ...entry } : null;
  }
}

export type CancelStep = 'menu' | 'dialog' | 'fullscreen' | 'history' | 'unavailable';
export function cancelStep(state: { menu: boolean; dialog: boolean; unknownOverlay: boolean; fullscreen: boolean; canBack: boolean }): CancelStep {
  if (state.menu) return 'menu';
  if (state.dialog) return 'dialog';
  if (state.unknownOverlay) return 'unavailable';
  if (state.fullscreen) return 'fullscreen';
  return state.canBack ? 'history' : 'unavailable';
}

export function adjustedVolume(current: number, delta: number): number {
  return Number.isFinite(current) && Number.isFinite(delta) ? Math.max(0, Math.min(1, Math.round((current + delta) * 100) / 100)) : 0;
}
