import type { Direction } from './actions';

export interface Rect { left: number; right: number; top: number; bottom: number }
export interface Candidate { id: string; rect: Rect; penalty?: number }
export interface ContentCandidate extends Candidate { group?: unknown; primary?: boolean; content?: boolean }

export function initialCandidate<T extends ContentCandidate>(candidates: readonly T[], viewport: Rect): T | null {
  const visible = candidates.filter(({rect:r}) => r.right > viewport.left && r.left < viewport.right && r.bottom > viewport.top && r.top < viewport.bottom);
  const content = visible.filter(c => c.content);
  const pool = content.length ? content : visible;
  const primary = pool.filter(c => c.primary);
  const choices = primary.length ? primary : pool;
  const cx = (viewport.left + viewport.right) / 2, cy = (viewport.top + viewport.bottom) / 2;
  const score = ({rect:r}: T) => {
    const x = (Math.max(r.left, viewport.left) + Math.min(r.right, viewport.right)) / 2;
    const y = (Math.max(r.top, viewport.top) + Math.min(r.bottom, viewport.bottom)) / 2;
    return (x-cx)**2 + (y-cy)**2;
  };
  return choices.reduce<T | null>((best,c) => !best || score(c)<score(best) ? c : best,null);
}

/** Candidate policy, not a confirmed new interaction mode. All controls remain
 * available horizontally and through the explicit all-controls menu setting. */
export function contentNeighbor(current: ContentCandidate, direction: Direction, candidates: readonly ContentCandidate[], allControls = false): string | null {
  const vertical = direction === 'up' || direction === 'down';
  const pool = !allControls && vertical && current.group && current.primary
    ? candidates.map(c => c.group && !c.primary ? {...c,penalty:Math.min(160,(current.rect.bottom-current.rect.top)*.9)} : c) : candidates;
  return neighbor(current, direction, pool);
}

export function neighbor(current: Candidate, direction: Direction, candidates: readonly Candidate[]): string | null {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const c = current.rect;
  const cx = (c.left + c.right) / 2, cy = (c.top + c.bottom) / 2;
  let best: { id: string; score: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.id === current.id) continue;
    const r = candidate.rect;
    const dx = (r.left + r.right) / 2 - cx, dy = (r.top + r.bottom) / 2 - cy;
    const primary = (horizontal ? dx : dy) * sign;
    // Small baseline/centering differences within one row must not turn Down
    // into a sideways move (checkboxes and text fields commonly differ by 3px).
    const extent = horizontal ? Math.min(c.right - c.left, r.right - r.left) : Math.min(c.bottom - c.top, r.bottom - r.top);
    if (primary <= Math.max(2, extent * 0.25)) continue;
    const cross = Math.abs(horizontal ? dy : dx);
    const overlap = horizontal
      ? Math.min(c.bottom, r.bottom) - Math.max(c.top, r.top)
      : Math.min(c.right, r.right) - Math.max(c.left, r.left);
    const crossExtent = horizontal ? Math.min(c.bottom-c.top,r.bottom-r.top) : Math.min(c.right-c.left,r.right-r.left);
    const overlapRatio = Math.max(0,Math.min(1,overlap/Math.max(1,crossExtent)));
    // Finite alignment preference: a 1px overlap must not force a distant jump.
    const score = (primary + cross*2)*(1-.25*overlapRatio)+(candidate.penalty??0);
    if (!best || score < best.score || (score === best.score && candidate.id < best.id)) {
      best = { id: candidate.id, score };
    }
  }
  return best?.id ?? null;
}

export function boundedSeek(current: number, delta: number, ranges: readonly [number, number][]): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(delta) || !ranges.length) return null;
  const target = current + delta;
  let nearest: number | null = null;
  for (const [start, end] of ranges) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    const clamped = Math.max(start, Math.min(end, target));
    if (nearest === null || Math.abs(clamped - target) < Math.abs(nearest - target)) nearest = clamped;
  }
  return nearest;
}
