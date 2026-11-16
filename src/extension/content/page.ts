export function visible(element: Element): boolean {
  const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  return rect.width > 2 && rect.height > 2 && style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

const opened = new WeakMap<Element,number>();
let sequence = 0;
export function noteLayerToggle(event: Event) {
  if(event.target instanceof Element && (event as ToggleEvent).newState==='open') opened.set(event.target,++sequence);
}
export function expandedOwner(root: Element): HTMLElement | null {
  if(!root.id)return null;
  return document.querySelector<HTMLElement>(`[aria-expanded="true"][aria-controls~="${CSS.escape(root.id)}"]`);
}

export function pageScope(additionalSelector = ''): Element {
  const selector = 'dialog[open],[aria-modal="true"],[role="dialog"],:popover-open,[role="menu"],[role="listbox"]' + (additionalSelector ? `,${additionalSelector}` : '');
  const dialogs = Array.from(document.querySelectorAll(selector)).filter(element=>{
    if(!visible(element)||element.matches('[role="tooltip"]')||element.closest('#ds5-demo-ui'))return false;
    if(element.matches('[role="menu"],[role="listbox"]')&&!element.matches(':popover-open')) {
      return !!expandedOwner(element)||element.contains(document.activeElement)||['absolute','fixed'].includes(getComputedStyle(element).position);
    }
    return true;
  });
  const exposed = dialogs.filter(element => {
    const rect = element.getBoundingClientRect();
    return [[.5,.5],[.1,.1],[.9,.9]].some(([x,y])=>{
      const hit = document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,rect.left+rect.width*x!)),Math.max(0,Math.min(innerHeight-1,rect.top+rect.height*y!)));
      return !!hit && element.contains(hit);
    });
  });
  return exposed.filter(element=>!exposed.some(child=>child!==element&&element.contains(child)))
    .sort((a,b)=>(opened.get(a)??0)-(opened.get(b)??0)).at(-1) ?? document.body;
}

export function unknownOverlay(): boolean {
  return Array.from(document.querySelectorAll('[class*="modal-mask"],[class*="dialog-mask"],[class*="login-mask"],[data-ds5-blocking]')).some(visible);
}
