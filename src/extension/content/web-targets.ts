import type { PageTiming } from '../core/diagnostics';
import { controlRect, controlRegions } from './control-geometry';
// Site independent discovery. Re-scan on direction input so lazy loaded controls
// and opened menus are included; do not inspect text or retain page content.
const semantic = 'a[href],button,input:not([type="hidden"]),select,textarea,summary,[contenteditable="true"],[role="button"],[role="link"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="option"],[onclick]';
const ownUi = '#ds5-demo-ui,iframe[data-ds5-input]';

function* ancestors(element: Element): Generator<Element> {
  let node: Element | null = element;
  while (node) {
    const root: Node = node.getRootNode();
    node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    if (node) yield node;
  }
}

export function composedContains(parent: Node, child: Node): boolean {
  for (let node: Node | null = child; node; ) {
    if (node === parent) return true;
    node = node.parentNode ?? (node instanceof ShadowRoot ? node.host : null);
  }
  return false;
}

export function focusedControl(): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

export function editing(element: Element | null): boolean {
  return !!element && (element.matches('input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]),textarea,select') || (element instanceof HTMLElement && element.isContentEditable));
}

function inspection(timing?: PageTiming, rects = new Map<HTMLElement, DOMRect>()) {
  const rawRects = new Map<HTMLElement,DOMRect>();
  const styles = new WeakMap<Element, CSSStyleDeclaration>(), visibility = new WeakMap<Element, boolean>();
  const style = (node: Element) => {
    let value = styles.get(node);
    if (!value) { value = getComputedStyle(node); styles.set(node,value); if (timing) timing.styleReads++; }
    return value;
  };
  const visible = (node: Element): boolean => {
    const cached = visibility.get(node); if (cached !== undefined) return cached;
    const own = style(node), root = node.getRootNode();
    const parent = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    const value = !node.matches(':disabled,[inert],[hidden],[aria-hidden="true"],[aria-disabled="true"]')
      && own.display !== 'none' && own.visibility !== 'hidden' && own.visibility !== 'collapse' && own.opacity !== '0'
      && (!parent || visible(parent));
    visibility.set(node,value); return value;
  };
  const rawRect = (element: HTMLElement) => {
    let value=rawRects.get(element);
    if(!value){value=element.getBoundingClientRect();rawRects.set(element,value);if(timing)timing.rectReads++;}
    return value;
  };
  const rect = (element: HTMLElement) => {
    let value = rects.get(element);
    if (!value) { value = controlRect(element,{style,rawRect,timing,scrollDestinations:true}); rects.set(element,value); }
    return value;
  };
  return {style,rect,regions:(element:HTMLElement)=>controlRegions(element,{style,rawRect,timing,viewport:true}),usable(element: HTMLElement) { const r = visible(element) ? rect(element) : null; return !!r && r.width > 2 && r.height > 2 && style(element).pointerEvents !== 'none'; } };
}

export function usable(element: HTMLElement): boolean { return inspection().usable(element); }

function uncovered(element: HTMLElement, rect = controlRect(element,{scrollDestinations:true}), timing?: PageTiming, destinations = true, regions = controlRegions(element,{viewport:true,timing})): boolean {
  if (!regions.length) return destinations && rect.width>2 && rect.height>2;
  return regions.some(rect=>{
  const left = Math.max(0, rect.left), right = Math.min(innerWidth - 1, rect.right);
  const top = Math.max(0, rect.top), bottom = Math.min(innerHeight - 1, rect.bottom);
  for (const [x, y] of [[(left + right) / 2, (top + bottom) / 2], [left + 2, top + 2], [right - 2, bottom - 2]]) {
    if (timing) timing.hitReads++;
    let hit = document.elementFromPoint(x!, y!);
    while (hit?.shadowRoot) {
      if (timing) timing.hitReads++;
      const inner = hit.shadowRoot.elementFromPoint(x!, y!);
      if (!inner || inner === hit) break;
      hit = inner;
    }
    if (hit && (composedContains(element, hit) || !!hit.closest(ownUi))) return true;
  }
  return false;
  });
}

export interface ControlMembers { strong: HTMLElement[]; pointers: HTMLElement[]; truncated: boolean; shadow: boolean }
export interface ControlScan { raw: number; unavailable: number; nested: number; occluded: number; policyFiltered: number; scanCandidates: number }
export function discoverControls(root: Element, options: { timing?: PageTiming; rects?: Map<HTMLElement, DOMRect>; members?: ControlMembers; remember?: (members: ControlMembers)=>void; report?: (scan:ControlScan)=>void } = {}): HTMLElement[] {
  const started = performance.now(), check = inspection(options.timing,options.rects);
  const strong: HTMLElement[] = [], pointers: HTMLElement[] = [];
  const stack: Element[] = Array.from(root.children).reverse();
  let visited = 0, shadow = false;
  if(options.members){strong.push(...options.members.strong);pointers.push(...options.members.pointers);if(options.timing)options.timing.membershipHit=true;}
  while (!options.members && stack.length && visited < 12000) {
    visited++;
    const element = stack.pop()!;
    if (element.matches(ownUi + ',script,style,template,svg')) continue;
    stack.push(...Array.from(element.children).reverse());
    if (element.shadowRoot) {shadow=true;stack.push(...Array.from(element.shadowRoot.children).reverse());}
    if (!(element instanceof HTMLElement)) continue;
    if (element.matches(semantic) || element.tabIndex >= 0) strong.push(element);
    else if (check.style(element).cursor === 'pointer') pointers.push(element);
  }
  if (options.timing) options.timing.visited += visited;
  const truncated=options.members?.truncated??stack.length>0;
  if (options.timing) options.timing.truncated ||= truncated;
  if(!options.members)options.remember?.({strong,pointers,truncated,shadow});
  const available = strong.filter(element=>element.isConnected&&composedContains(root,element)&&check.usable(element));
  // A wrapper containing real actions is not itself another action merely
  // because it is focusable or labelled role=button. Retain native controls and
  // explicit own inline actions; leave their descendants independently usable.
  const actionParents=new Set<Element>();
  for(const child of available)if(child.matches(semantic))for(const parent of ancestors(child))actionParents.add(parent);
  const valid = available.filter(element=>element.matches('a[href],button,input,select,textarea,summary,[contenteditable="true"],[onclick]')||!actionParents.has(element));
  // Native controls retain their own activation bounds, even within a genuine
  // outer action. Do not expand their bounds to a site-specific card wrapper.
  const strongSet = new Set<Element>(valid), strongParents = new Set<Element>();
  for (const element of valid) for (const parent of ancestors(element)) strongParents.add(parent);
  const candidates = valid.filter(element => element.matches('a[href],button,input,select,textarea,summary') || !Array.from(ancestors(element)).some(parent => strongSet.has(parent) && parent.matches('a[href],button,summary,[role="button"],[role="link"]')));
  const compact = new Set(pointers.filter(element => {
    if (!element.isConnected||!composedContains(root,element)||check.style(element).cursor!=='pointer'||strongParents.has(element) || Array.from(ancestors(element)).some(parent => strongSet.has(parent)) || !check.usable(element)) return false;
    const parent=Array.from(ancestors(element))[0];
    if(parent&&check.style(parent).cursor==='pointer')return false;
    const r = check.rect(element);
    // Keep a compact icon + caption together; avoid selecting an entire toolbar.
    return r.width <= 360 && r.height <= 180;
  }));
  const weak = [...compact].filter(element => !Array.from(ancestors(element)).some(parent => compact.has(parent as HTMLElement)));
  const eligible=[...candidates,...weak];
  const result = eligible.filter(element => uncovered(element,check.rect(element),options.timing,true,check.regions(element)));
  const raw=strong.length+pointers.length,unavailable=strong.length-available.length,nested=available.length-valid.length+valid.length-candidates.length+compact.size-weak.length,occluded=eligible.length-result.length;
  options.report?.({raw,unavailable,nested,occluded,policyFiltered:Math.max(0,raw-unavailable-nested-occluded-result.length),scanCandidates:result.length});
  if (options.timing) options.timing.discoveryMs += performance.now()-started;
  return result;
}

export function availableControl(element: HTMLElement): boolean { return usable(element) && uncovered(element,undefined,undefined,false); }

export function activateControl(element: HTMLElement) {
  if (!usable(element)) return;
  if (editing(element)) { element.focus({ preventScroll: true }); return; }
  // click() bubbles to delegated handlers and preserves native checkbox, form,
  // link and custom element behavior. Never synthesize a second fallback click.
  element.focus({ preventScroll: true });
  element.click();
}
