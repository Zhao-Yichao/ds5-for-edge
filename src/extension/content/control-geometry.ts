import type { PageTiming } from '../core/diagnostics';

export interface GeometryOptions {
  viewport?: boolean;
  scrollDestinations?: boolean;
  style?: (element: Element) => CSSStyleDeclaration;
  rawRect?: (element: HTMLElement) => DOMRect;
  timing?: PageTiming;
}

export function parentElement(element: Element): Element | null {
  const root = element.getRootNode();
  return element.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
}
const box = (r: DOMRectReadOnly) => new DOMRect(r.left, r.top, r.width, r.height);
const valid = (r: DOMRectReadOnly) => r.width > 2 && r.height > 2;
function intersect(r: DOMRect, clip: DOMRectReadOnly, x = true, y = true): DOMRect {
  const left = x ? Math.max(r.left, clip.left) : r.left, top = y ? Math.max(r.top, clip.top) : r.top;
  const right = x ? Math.min(r.right, clip.right) : r.right, bottom = y ? Math.min(r.bottom, clip.bottom) : r.bottom;
  return new DOMRect(left, top, Math.max(0, right-left), Math.max(0, bottom-top));
}

// The operation owner stays the original element. Geometry may consist of
// multiple visible inline fragments, or children of a display:contents owner.
export function controlRegions(element: HTMLElement, options: GeometryOptions = {}): DOMRect[] {
  const style = options.style ?? getComputedStyle;
  const raw = options.rawRect ?? (node => { if (options.timing) options.timing.rectReads++; return node.getBoundingClientRect(); });
  function containingBlock(node: HTMLElement): Element | null | undefined {
    const position=style(node).position;
    if(position!=='absolute'&&position!=='fixed')return undefined;
    for(let parent=parentElement(node);parent;parent=parentElement(parent)) {
      const css=style(parent);
      if(css.display==='contents')continue;
      if((position==='absolute'&&css.position!=='static')||css.transform!=='none'||css.perspective!=='none'||css.filter!=='none'||/(?:layout|paint|strict|content)/.test(css.contain)||/(?:transform|perspective|filter)/.test(css.willChange))return parent;
      if(parent.matches(':popover-open,:modal'))return null;
    }
    return null;
  }
  function fragments(node: HTMLElement, depth = 0): DOMRect[] {
    const display = style(node).display;
    if (display === 'contents' && depth < 8) return Array.from(node.children).slice(0,64).flatMap(child =>
      child instanceof HTMLElement && style(child).display !== 'none' && style(child).visibility === 'visible' && style(child).opacity !== '0' ? fragments(child,depth+1) : []);
    if (display === 'inline') { if(options.timing)options.timing.rectReads++; return Array.from(node.getClientRects(),box).filter(valid); }
    return [box(raw(node))].filter(valid);
  }
  let regions = fragments(element);
  let escapeUntil=containingBlock(element);
  for (let ancestor = parentElement(element); ancestor && regions.length; ancestor = parentElement(ancestor)) {
    if (!(ancestor instanceof HTMLElement)) continue;
    if(element.matches(':popover-open,:modal'))break;
    if(escapeUntil===ancestor)escapeUntil=undefined;
    // Top-layer boxes escape ancestor overflow. Their own scrolling still clips
    // descendants because the ancestor itself is processed before this break.
    const css = style(ancestor), paint = /(?:paint|strict|content)/.test(css.contain);
    const x = paint || /hidden|clip|auto|scroll/.test(css.overflowX), y = paint || /hidden|clip|auto|scroll/.test(css.overflowY);
    if ((x || y) && escapeUntil===undefined) {
      const rect = raw(ancestor), sx = ancestor.offsetWidth ? rect.width/ancestor.offsetWidth : 1, sy = ancestor.offsetHeight ? rect.height/ancestor.offsetHeight : 1;
      const clip = new DOMRect(rect.left+ancestor.clientLeft*sx,rect.top+ancestor.clientTop*sy,ancestor.clientWidth*sx,ancestor.clientHeight*sy);
      const clipped = regions.map(r=>intersect(r,clip,x,y)).filter(valid);
      const revealX = /auto|scroll/.test(css.overflowX) && ancestor.scrollWidth>ancestor.clientWidth;
      const revealY = /auto|scroll/.test(css.overflowY) && ancestor.scrollHeight>ancestor.clientHeight;
      regions = clipped.length || !options.scrollDestinations ? clipped
        : regions.map(r=>intersect(r,clip,x&&!revealX,y&&!revealY)).filter(valid);
    }
    if (ancestor.matches(':popover-open,:modal')) break;
    const context=containingBlock(ancestor);
    if(context!==undefined)escapeUntil=context;
  }
  if (options.viewport) {
    const v = window.visualViewport;
    const viewport = new DOMRect(v?.offsetLeft??0,v?.offsetTop??0,v?.width??innerWidth,v?.height??innerHeight);
    regions = regions.map(r=>intersect(r,viewport)).filter(valid);
  }
  // Ellipsis engines can return both the full inline fragment and smaller
  // text/ellipsis fragments. Keep the maximal non-duplicate visible pieces.
  return regions.filter((r,i)=>!regions.some((other,j)=>j!==i && other.left<=r.left && other.right>=r.right && other.top<=r.top && other.bottom>=r.bottom && (other.width*other.height>r.width*r.height || j<i)));
}

export function controlRect(element: HTMLElement, options: GeometryOptions = {}): DOMRect {
  return controlRegions(element,options).reduce((best,r)=>r.width*r.height>best.width*best.height?r:best,new DOMRect());
}
