export type Direction = 'up' | 'down' | 'left' | 'right';
export type Action =
  | { kind: 'navigate'; direction: Direction }
  | { kind: 'activate' | 'cancel' | 'back' | 'play' | 'mute' | 'fullscreen' | 'menu' }
  | { kind: 'volume'; delta: number }
  | { kind: 'seek'; seconds: number }
  | { kind: 'scroll'; amount: number };

export function isAction(value: unknown): value is Action {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'navigate') return ['up', 'down', 'left', 'right'].includes(String(v.direction));
  if (v.kind === 'seek') return v.seconds === 5 || v.seconds === -5;
  if (v.kind === 'volume') return v.delta === 0.05 || v.delta === -0.05;
  if (v.kind === 'scroll') return typeof v.amount === 'number' && Number.isFinite(v.amount) && Math.abs(v.amount) <= 40;
  return ['activate', 'cancel', 'back', 'play', 'mute', 'fullscreen', 'menu'].includes(String(v.kind));
}

export function keyAction(key: string): Action | null {
  const directions: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  if (directions[key]) return { kind: 'navigate', direction: directions[key] };
  const keys: Record<string, Action> = {
    Enter: { kind: 'activate' }, Escape: { kind: 'cancel' }, ' ': { kind: 'play' },
    '[': { kind: 'seek', seconds: -5 }, ']': { kind: 'seek', seconds: 5 },
    m: { kind: 'mute' }, f: { kind: 'fullscreen' },
    '?': { kind: 'menu' }, '+': { kind: 'volume', delta: 0.05 }, '=': { kind: 'volume', delta: 0.05 },
    '-': { kind: 'volume', delta: -0.05 },
  };
  return keys[key] ?? null;
}
