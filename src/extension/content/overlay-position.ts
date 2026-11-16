export interface OverlayPosition { x: number; y: number }

// A viewport-relative preference, with no page or device information.
export function overlayPosition(value: unknown): OverlayPosition {
  const p = value as Partial<OverlayPosition> | null;
  return p && typeof p.x === 'number' && Number.isFinite(p.x) && p.x >= 0 && p.x <= 1
    && typeof p.y === 'number' && Number.isFinite(p.y) && p.y >= 0 && p.y <= 1
    ? { x: p.x, y: p.y } : { x: 1, y: 1 };
}

export function createOverlayPosition(options: {
  dock: HTMLElement; panel: HTMLElement; menu: HTMLElement;
  handle: HTMLElement; heading: HTMLElement;
  onCommit?: (position: OverlayPosition) => void;
}) {
  const { dock, panel, menu, handle, heading } = options;
  let position = overlayPosition(null), disposed = false;
  let drag: { id: number; target: HTMLElement; x: number; y: number; left: number; top: number; original: OverlayPosition; moved: boolean } | null = null;
  let suppressClick: HTMLElement | null = null, clickTimer: ReturnType<typeof setTimeout> | undefined;
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
  function bounds() {
    const width = Math.max(panel.offsetWidth, menu.offsetWidth, handle.offsetWidth);
    const height = Math.max(panel.offsetHeight, menu.offsetHeight) + 30;
    return { width, height, x: Math.max(0, innerWidth - 28 - width), y: Math.max(0, innerHeight - 28 - height) };
  }
  function refresh() {
    if (disposed) return;
    const b = bounds();
    Object.assign(dock.style, { right: 'auto', bottom: 'auto', width: `${b.width}px`, height: `${b.height}px`,
      left: `${14 + position.x * b.x}px`, top: `${14 + position.y * b.y}px` });
  }
  const suppress = (target: HTMLElement) => {
    suppressClick = target; clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { suppressClick = null; }, 0);
  };
  function finish(commit: boolean) {
    if (!drag) return;
    const ended = drag; drag = null;
    if (ended.moved) {
      suppress(ended.target);
      if (!commit) { position = ended.original; refresh(); }
      dock.removeAttribute('data-dragging');
      if (commit) options.onCommit?.({ ...position });
    }
    if (ended.target.hasPointerCapture(ended.id)) ended.target.releasePointerCapture(ended.id);
  }
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    refresh();
    const target = event.currentTarget as HTMLElement, rect = dock.getBoundingClientRect();
    drag = { id: event.pointerId, target, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, original: { ...position }, moved: false };
    target.setPointerCapture(event.pointerId);
    if (target === heading) event.preventDefault();
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    if (!drag.moved) { drag.moved = true; dock.dataset.dragging = 'true'; }
    const b = bounds();
    position = { x: b.x ? clamp(drag.left - 14 + dx, b.x) / b.x : position.x,
      y: b.y ? clamp(drag.top - 14 + dy, b.y) / b.y : position.y };
    refresh(); event.preventDefault();
  };
  const up = (event: PointerEvent) => { if (event.pointerId === drag?.id) finish(true); };
  const cancel = (event: PointerEvent) => { if (event.pointerId === drag?.id) finish(false); };
  const click = (event: MouseEvent) => {
    if (event.currentTarget === suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = null; }
  };
  const blur = () => finish(false);
  for (const target of [handle, heading]) {
    target.addEventListener('pointerdown', down); target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up); target.addEventListener('pointercancel', cancel);
    target.addEventListener('lostpointercapture', cancel); target.addEventListener('click', click, true);
  }
  const resize = new ResizeObserver(refresh);
  resize.observe(panel); resize.observe(menu);
  window.addEventListener('resize', refresh); window.addEventListener('blur', blur);
  window.visualViewport?.addEventListener('resize', refresh);
  refresh();
  return {
    refresh,
    set(value: unknown) { if (!drag) { position = overlayPosition(value); refresh(); } },
    destroy() {
      disposed = true; finish(false); clearTimeout(clickTimer); resize.disconnect();
      for (const target of [handle, heading]) {
        target.removeEventListener('pointerdown', down); target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', cancel);
        target.removeEventListener('lostpointercapture', cancel); target.removeEventListener('click', click, true);
      }
      window.removeEventListener('resize', refresh); window.removeEventListener('blur', blur);
      window.visualViewport?.removeEventListener('resize', refresh);
    },
  };
}
