import { keyAction, type Action } from '../core/actions';
import { boundedSeek, contentNeighbor, initialCandidate } from '../core/navigation';
import { newTiming, type InputTiming, type PageTiming } from '../core/diagnostics';
import { adjustedVolume, cancelStep, ViewMemory } from '../core/view-memory';
import { activationDestination, activationTarget, closeControl, fullscreenTarget, mainPlayer, navigationTarget, pageScope, preferredInitial } from './page-adapter';
import { expandedOwner, noteLayerToggle, unknownOverlay, visible } from './page';
import { controlRect, controlRegions, parentElement } from './control-geometry';
import { cleanGamepadHealth, type GamepadHealth } from '../core/gamepad-device';
import { createMenu } from './menu';
import { controllerGuide, controllerGuideStyles } from './controller-guide';
import { createOverlayPosition, type OverlayPosition } from './overlay-position';
import { activateControl, availableControl, composedContains, discoverControls, editing, focusedControl, usable, type ControlMembers, type ControlScan } from './web-targets';

interface Target { id: string; element: HTMLElement; rect: DOMRect; group?: Element; primary?: boolean; content?: boolean }

export function createController(options: { keyboardDemo?: boolean; onEnabledChange?: (enabled: boolean) => void; onTab?: (direction: -1 | 1) => void; onOverlayPositionChange?: (position: OverlayPosition) => void; onCloseTab?: () => Promise<boolean> } = {}) {
  let enabled = false, selected: HTMLElement | null = null, busy = false, destroyed = false;
  let route = location.href;
  const views = new ViewMemory();
  let pendingNavigation: { url: string; length: number; expires: number } | null = null;
  let knownReturn: string | null = null, routeEpoch = 0, restoreFrame = 0;
  let menu: ReturnType<typeof createMenu> | null = null;
  let menuEpoch = 0, menuWasOpen = false;
  let placement: ReturnType<typeof createOverlayPosition> | null = null;
  let initialFrame = 0, renderFrame = 0, autoSuppressed = false, allControls = false;
  let lastScope: Element = document.body;
  const scopeReturns: {scope:Element;selected:HTMLElement|null}[] = [];
  const motion = new Map<Element,number>();
  let lastAction = 0;
  let resumeInitial = false;
  let restoring = false;
  let membership: {root:Element;expires:number;members:ControlMembers}|null=null;
  const invalidateMembers=()=>{membership=null;};
  const timings: PageTiming[] = [];
  const record = (row: PageTiming, start: number) => {
    row.totalMs = performance.now()-start;
    timings.push(row); if (timings.length>80) timings.shift();
    requestAnimationFrame(() => { row.nextFrameMs = performance.now()-start; });
  };
  let deviceStatus = '未检测到手柄';
  let inputHealth: GamepadHealth | null = null;
  let discovery: ({candidates:number;visited:number;truncated:boolean} & Partial<ControlScan>) | null = null;
  let actionState: {kind:string;outcome:string} | null = null;
  const ids = new WeakMap<Element, string>(); let nextId = 0;
  const host = document.createElement('div');
  host.id = 'ds5-demo-ui';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>
    :host{font:12.5px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#191b1e}
    .ring-layer{position:fixed;inset:0;margin:0;padding:0;border:0;width:100vw;height:100vh;background:transparent;overflow:visible;pointer-events:none}
    .ring-layer::backdrop{background:transparent;pointer-events:none}
    .ring{position:fixed;box-sizing:border-box;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,.92),0 0 0 3px #2e56c9,0 0 0 4px rgba(255,255,255,.42);pointer-events:none;display:none}
    .handle{position:fixed;right:14px;bottom:14px;width:22px;height:22px;margin:0;padding:0;border:1px solid rgba(25,27,30,.14);border-radius:50%;background:rgba(250,250,249,.62);backdrop-filter:blur(8px);display:grid;place-items:center;cursor:pointer;pointer-events:auto;opacity:.42;transition:opacity .14s ease}
    .handle:hover,.handle:focus-visible,.handle[data-open="true"]{opacity:1}
    .handle svg{width:13px;height:13px;stroke:#191b1e;fill:none;stroke-width:1.6}
    .panel{position:fixed;right:14px;bottom:44px;width:640px;box-sizing:border-box;padding:16px 18px 14px;border:1px solid rgba(25,27,30,.10);border-radius:11px;background:rgba(250,251,253,.97);backdrop-filter:blur(14px) saturate(1.05);box-shadow:0 14px 30px -20px rgba(15,20,25,.5);color:#191b1e;opacity:0;visibility:hidden;transform:translateY(4px);pointer-events:none;transition:opacity .14s ease,transform .14s ease,visibility 0s linear .14s}
    .panel[data-open="true"]{opacity:1;visibility:visible;transform:none;pointer-events:auto;transition:opacity .14s ease,transform .14s ease}
    .dock{position:fixed;right:14px;bottom:14px;pointer-events:none}
    .dock .handle{position:absolute;right:0;bottom:0;touch-action:none}
    .dock .panel,.dock .menu{position:absolute;right:0;bottom:30px;max-width:calc(100vw - 28px);max-height:calc(100vh - 58px);overflow:auto}
    .panel-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;cursor:grab;touch-action:none;user-select:none}
    .dock[data-dragging] .panel-head,.dock[data-dragging] .handle{cursor:grabbing}
    .brand{font-size:14px;font-weight:650}
    .status{color:#5c636d;font-size:11.5px;text-align:right}
    .hint{margin:6px 0 11px;color:#5c636d;font-size:11.5px;line-height:1.55}
    .actions{display:flex;gap:8px}
    .panel button{border:1px solid rgba(25,27,30,.12);background:rgba(255,255,255,.6);color:#191b1e;border-radius:7px;padding:5px 10px;font:inherit;font-size:11.5px;font-weight:550;cursor:pointer;min-height:28px}
    .panel button:hover{background:#fff;border-color:rgba(25,27,30,.2)}
    .panel button:focus-visible{outline:2px solid #2e56c9;outline-offset:1px}
    .toast{position:fixed;left:50%;bottom:72px;max-width:min(320px,calc(100vw - 40px));padding:7px 12px;border:1px solid rgba(25,27,30,.10);border-radius:8px;background:rgba(250,250,249,.94);backdrop-filter:blur(10px);color:#191b1e;font-size:12px;text-align:center;opacity:0;visibility:hidden;transform:translate(-50%,6px);pointer-events:none;transition:opacity .16s ease,transform .16s ease,visibility 0s linear .16s}
    .toast[data-open="true"]{opacity:1;visibility:visible;transform:translate(-50%,0);transition:opacity .16s ease,transform .16s ease}
    .menu{position:fixed;right:14px;bottom:180px;width:248px;box-sizing:border-box;padding:12px;border:1px solid rgba(25,27,30,.10);border-radius:11px;background:rgba(250,250,249,.95);backdrop-filter:blur(14px);box-shadow:0 16px 32px -22px rgba(15,20,25,.55);color:#191b1e;max-height:calc(100vh - 210px);overflow:auto;pointer-events:auto}
    .menu[hidden]{display:none}
    .menu strong{display:block;font-size:12px;font-weight:650}
    .menu p{margin:2px 0 8px;font-size:11px;color:#5c636d}
    .menu button{display:block;width:100%;margin:1px 0;padding:6px 8px;border:0;border-radius:6px;background:transparent;color:#191b1e;font:inherit;font-size:11.5px;text-align:left;cursor:pointer}
    .menu button:hover{background:rgba(25,27,30,.05)}
    .menu button.chosen{background:rgba(46,86,201,.10);box-shadow:inset 2px 0 0 #2e56c9}
    .menu button[data-close-tab]{margin-top:8px;color:#9b3333}
    .menu button:focus-visible{outline:2px solid #2e56c9;outline-offset:-2px}
    ${controllerGuideStyles}
    @media (prefers-reduced-motion:reduce){.panel,.toast,.handle{transition:none!important}}
  </style><div class="ring-layer" aria-hidden="true"><div class="ring"></div></div><button type="button" class="handle" data-handle aria-label="显示手柄状态" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8.5h10a4 4 0 0 1 4 4v1a3 3 0 0 1-3 3h-1.7l-1.3-2H9l-1.3 2H6a3 3 0 0 1-3-3v-1a4 4 0 0 1 4-4Z"/><circle cx="9.2" cy="12" r="1"/><circle cx="14.8" cy="12" r="1"/></svg></button><section class="panel" data-panel aria-label="手柄控制状态"><div class="panel-head"><span class="brand">DS5</span><span class="status"></span></div>${controllerGuide()}${options.keyboardDemo ? '<p class="hint">Demo 键盘：方向键选择 · Enter 确认 · Esc 取消<br>空格播放 · [ ] 跳转 · F 全屏 · M 静音 · ? 菜单</p>' : ''}<div class="actions"><button type="button" data-toggle></button><button type="button" class="menu-launch">功能菜单</button></div></section><div class="toast result" role="status" data-toast></div>`;
  document.documentElement.append(host);
  const dock = document.createElement('div'); dock.className = 'dock';
  shadow.append(dock);
  dock.append(shadow.querySelector('[data-handle]')!, shadow.querySelector('[data-panel]')!);
  const ring = shadow.querySelector<HTMLElement>('.ring')!;
  const ringLayer = ring.parentElement!;
  let layerScope: Element | null = null;
  const resize = new ResizeObserver(()=>scheduleRender());
  let watched: HTMLElement | null = null;
  function watchGeometry() {
    if(watched===selected)return;
    watched=selected;resize.disconnect();
    if(selected){resize.observe(selected);for(let p=parentElement(selected);p;p=parentElement(p))resize.observe(p);if(getComputedStyle(selected).display==='contents')for(const child of Array.from(selected.children).slice(0,64))resize.observe(child);}
  }
  function hideRing() {
    for(const node of ringLayer.querySelectorAll<HTMLElement>('.ring'))node.style.display='none';
    if(ringLayer.matches(':popover-open'))ringLayer.hidePopover();
    ringLayer.removeAttribute('popover');layerScope=null;
  }
  const statusNode = shadow.querySelector<HTMLElement>('.status')!;
  const toastNode = shadow.querySelector<HTMLElement>('[data-toast]')!;
  const toggle = shadow.querySelector<HTMLButtonElement>('[data-toggle]')!;
  const menuLaunch = shadow.querySelector<HTMLButtonElement>('.menu-launch')!;
  const panel = shadow.querySelector<HTMLElement>('[data-panel]')!;
  const handle = shadow.querySelector<HTMLButtonElement>('[data-handle]')!;
  let panelOpen = false, toastTimer: ReturnType<typeof setTimeout> | undefined;
  // Only explicit actions switch the dock view; moving around the webpage
  // (including the bottom-right corner) never summons or closes the guide.
  function setPanel(open: boolean) {
    if (open && menu?.open) menu.close();
    if (panelOpen === open) return;
    panelOpen = open; panel.dataset.open = String(open); handle.dataset.open = String(open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? '收起手柄状态' : '显示手柄状态');
  }
  function toggleMenu() {
    if (!menu?.open) setPanel(false);
    menu?.toggle();
  }
  handle.addEventListener('click', () => { setPanel(!panelOpen); });
  // Feedback is transient: a single quiet line that leaves on its own.
  const say = (text: string) => {
    if (destroyed || !text) return;
    toastNode.textContent = text; toastNode.dataset.open = 'true';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { if (!destroyed) toastNode.dataset.open = 'false'; }, 2600);
  };
  const active = () => enabled && !document.hidden && document.hasFocus();
  function render() {
    const menuOpen = menu?.open === true;
    if(menuWasOpen && !menuOpen)window.dispatchEvent(new CustomEvent('ds5-menu-session',{detail:{epoch:++menuEpoch}}));
    menuWasOpen = menuOpen;
    const root = pageScope();
    syncScope(root);
    watchGeometry();
    // Explicit transitions choose the dock view; rendering must not dismiss it.
    const parent = root.closest('dialog[open]') ?? document.fullscreenElement ?? document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
    const editingNow = editing(focusedControl());
    const waiting = /未检测到手柄|浏览器限制|没有手柄读取|读取失败|映射未支持/.test(deviceStatus);
    const status = !enabled ? '已暂停' : editingNow ? '输入框编辑中' : waiting ? '手柄未就绪' : '已启用';
    const label = enabled ? '暂停控制' : '启用控制';
    if (statusNode.textContent !== status) statusNode.textContent = status;
    if (statusNode.title !== deviceStatus) statusNode.title = deviceStatus;
    if (toggle.textContent !== label) toggle.textContent = label;
    if (!active() || menu?.open || editing(focusedControl()) || !selected?.isConnected || !composedContains(root, selected)) { hideRing(); return; }
    const regions = controlRegions(selected,{viewport:true});
    if(!regions.length){hideRing();return;}
    if(root!==document.body&&typeof ringLayer.showPopover==='function') {
      if(layerScope!==root&&ringLayer.matches(':popover-open'))ringLayer.hidePopover();
      ringLayer.setAttribute('popover','manual');
      if(!ringLayer.matches(':popover-open')){try{ringLayer.showPopover();}catch{/* fallback remains in the current dialog */}}
      layerScope=root;
    }else if(layerScope)hideRing();
    while(ringLayer.children.length>regions.length)ringLayer.lastElementChild!.remove();
    while(ringLayer.children.length<regions.length)ringLayer.append(ring.cloneNode() as HTMLElement);
    regions.forEach((rect,i)=>Object.assign((ringLayer.children[i] as HTMLElement).style,{display:'block',left:`${rect.left-4}px`,top:`${rect.top-4}px`,width:`${rect.width+8}px`,height:`${rect.height+8}px`}));
    for(const element of motion.keys())if(!element.isConnected||!composedContains(element,selected))motion.delete(element);
    if(motion.size)scheduleRender();
  }
  function targets(timing?: PageTiming): Target[] {
    if(mutations.takeRecords().some(relevantMutation))invalidateMembers();
    const root = pageScope(), seen = new Set<Element>(), list: Target[] = [];
    syncScope(root);
    const demo = document.documentElement.dataset.ds5Demo === 'true';
    const rects = new Map<HTMLElement, DOMRect>();
    const members=membership?.root===root&&performance.now()<membership.expires?membership.members:undefined;
    let scan:ControlScan|undefined;
    const items = demo && root === document.body ? Array.from(root.querySelectorAll<HTMLElement>('[data-ds5-target]')) : discoverControls(root,{timing,rects,members,
      remember(data){membership=data.shadow?null:{root,expires:performance.now()+250,members:data};},
      report(data){scan=data;},
    });
    const layoutStart = performance.now();
    for (const item of items) {
      const element = navigationTarget(item);
      if (seen.has(element) || element.closest('#ds5-demo-ui')) continue;
      if (item.matches(':disabled') || item.getAttribute('aria-disabled') === 'true') continue;
      seen.add(element);
      if (!ids.has(element)) ids.set(element, `target-${String(++nextId).padStart(6, '0')}`);
      let rect = rects.get(element);
      if (!rect) { rect = controlRect(element,{scrollDestinations:true,timing}); }
      if (rect.width <= 2 || rect.height <= 2) continue;
      list.push({ id: ids.get(element)!, element, rect, content: !!element.closest('main,[role="main"],article') });
    }
    const groups = new Map<Element,Target[]>();
    for (const target of list) {
      const group = target.element.closest('article,li,[role="listitem"]');
      if (group && composedContains(root,group)) { const members=groups.get(group)??[]; members.push(target); groups.set(group,members); }
    }
    for (const [group,members] of groups) {
      const area = (t:Target) => t.rect.width*t.rect.height;
      const sorted = members.map(area).sort((a,b)=>a-b), maximum=sorted.at(-1)!;
      if (members.length<2 || maximum < 4*sorted[Math.floor((sorted.length-1)/2)]!) continue;
      for (const member of members) { member.group=group; member.primary=area(member)>=maximum/2; }
    }
    if (timing) {timing.layoutMs += performance.now()-layoutStart;timing.candidates=list.length;}
    discovery={...scan,candidates:list.length,visited:timing?.visited??0,truncated:timing?.truncated??false};
    return list;
  }
  function choose(element: HTMLElement, timing?: PageTiming) {
    selected = element;
    const r=controlRect(element,{scrollDestinations:true});
    if(!controlRegions(element,{viewport:true}).length||r.top<0||r.bottom>innerHeight||r.left<0||r.right>innerWidth) element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const started=performance.now();render();if(timing)timing.renderMs+=performance.now()-started;
  }
  function initial(all: Target[]) {
    all=all.filter(t=>controlRegions(t.element,{viewport:true}).length>0);
    if (pageScope() !== document.body) {
      const focus=focusedControl(), target=all.find(t=>t.element===focus);
      if(target)return target;
    }
    if (document.documentElement.dataset.ds5Demo === 'true') return all.find(t=>preferredInitial(t.element)&&t.rect.bottom>0&&t.rect.top<innerHeight)??null;
    return initialCandidate(all,{left:0,right:innerWidth,top:0,bottom:innerHeight});
  }
  function syncScope(scope: Element) {
    if(scope===lastScope)return;
    const previous=scopeReturns.findIndex(item=>item.scope===scope);
    if(previous>=0){const target=scopeReturns[previous]!.selected;selected=!autoSuppressed&&target?.isConnected&&availableControl(target)?target:null;scopeReturns.splice(previous);}
    else {scopeReturns.push({scope:lastScope,selected});if(scopeReturns.length>16)scopeReturns.shift();selected=null;}
    lastScope=scope;
  }
  function scheduleInitial() {
    if (destroyed || initialFrame || !enabled || autoSuppressed) return;
    initialFrame=requestAnimationFrame(()=>{
      initialFrame=0;
      if(restoring){scheduleInitial();return;}
      if (!active() || destroyed || autoSuppressed || menu?.open) return;
      if(editing(focusedControl())){render();return;}
      const scope=pageScope();
      const requireVisible=resumeInitial;resumeInitial=false;
      syncScope(scope);
      const rect=selected?.isConnected?controlRect(selected,{viewport:true}):null;
      const inView=!!rect&&rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth;
      if (selected?.isConnected && (!requireVisible||inView) && composedContains(scope,selected) && availableControl(selected)) { render(); return; }
      const start=performance.now(), timing=newTiming('initial'), all=targets(timing);
      selected=initial(all)?.element??null;
      if(!selected&&(!lastAction||performance.now()-lastAction>1000))say(timing.truncated?'扫描已达上限，尚未找到可操作目标':'当前可视区域没有可操作目标');
      const rendered=performance.now();render();timing.renderMs=performance.now()-rendered;record(timing,start);
    });
  }
  function scheduleRender() {
    if (renderFrame) return;
    renderFrame=requestAnimationFrame(()=>{renderFrame=0;render();});
  }
  function relevantMutation(record:MutationRecord){return !(record.target instanceof Element && record.target.closest('#ds5-demo-ui'))
    && !(record.type==='childList' && [...record.addedNodes,...record.removedNodes].every(node=>node instanceof Element && node.matches('#ds5-demo-ui,iframe[data-ds5-input]')));}
  const mutations = new MutationObserver(records=>{
    if(records.some(relevantMutation)){invalidateMembers();watched=null;scheduleInitial();scheduleRender();}
  });
  mutations.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
  const invalidationEvents=['focusin','focusout','pointerover','pointerout','change','input','load','animationstart','animationend','transitionrun','transitionend'];
  for(const name of invalidationEvents)document.addEventListener(name,invalidateMembers,true);
  window.addEventListener('resize',invalidateMembers);
  const onMotion=(event:Event)=>{
    if(!(event.target instanceof Element)||!selected||!composedContains(event.target,selected))return;
    const starting=event.type==='animationstart'||event.type==='transitionrun', count=motion.get(event.target)??0;
    if(starting)motion.set(event.target,count+1);else if(count>1)motion.set(event.target,count-1);else motion.delete(event.target);
    invalidateMembers();scheduleRender();
  };
  const motionEvents=['animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel'];
  for(const name of motionEvents)document.addEventListener(name,onMotion,true);
  document.fonts?.addEventListener('loadingdone',scheduleRender);
  function targetKey(element: HTMLElement): string {
    if (element.dataset.ds5Key) return `demo:${element.dataset.ds5Key}`;
    const target = activationTarget(element);
    return target instanceof HTMLAnchorElement ? `link:${new URL(target.href, location.href).pathname}` : ids.get(element) ?? element.id;
  }
  function remember() {
    views.save(route, { target: selected?.isConnected ? targetKey(selected) : null, x: scrollX, y: scrollY });
  }
  function restore() {
    const snapshot = views.get(route), epoch = routeEpoch;
    cancelAnimationFrame(restoreFrame);
    restoring=false;
    if (!snapshot) return;
    restoring=true;
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = requestAnimationFrame(() => {
        restoring=false;restoreFrame=0;
        if (destroyed || epoch !== routeEpoch || !active()) return;
        window.scrollTo({ left: snapshot.x, top: snapshot.y, behavior: 'instant' });
        const all = targets();
        selected = all.find(t => targetKey(t.element) === snapshot.target)?.element
          ?? all.find(t => t.rect.top >= 0 && t.rect.bottom <= innerHeight)?.element ?? null;
        render();
      });
    });
  }
  function onRoute() {
    if (route === location.href) return;
    const previous = route;
    route = location.href; routeEpoch++; selected = null;scopeReturns.length=0;lastScope=document.body;
    knownReturn = pendingNavigation?.url === route && performance.now() <= pendingNavigation.expires && history.length > pendingNavigation.length ? previous : null;
    pendingNavigation = null; menu?.close();
    window.dispatchEvent(new CustomEvent('ds5-control-reset'));
    autoSuppressed=false;invalidateMembers();render(); restore();scheduleInitial();
  }
  async function waitUntil(predicate: () => boolean) {
    for (let i = 0; i < 8; i++) { if (predicate()) return true; await new Promise(resolve => setTimeout(resolve, 40)); }
    return predicate();
  }
  async function cancel(explicitBack = false) {
    const root = pageScope();
    syncScope(root);
    const step = cancelStep({ menu: menu?.open ?? false, dialog: root !== document.body, unknownOverlay: unknownOverlay(), fullscreen: !!document.fullscreenElement, canBack: history.length > 1 && (explicitBack || knownReturn !== null) });
    if (step === 'menu') { menu?.close(); return; }
    if (step === 'dialog') {
      if (root instanceof HTMLElement && root.matches(':popover-open')) root.hidePopover();
      else if (root instanceof HTMLDialogElement) root.close();
      else {
        const close = expandedOwner(root) ?? closeControl(root);
        if (close) close.click(); else { say('无法确认弹层关闭方式，请用鼠标关闭'); return; }
      }
      const closed = await waitUntil(() => !root.isConnected || !visible(root) || (root instanceof HTMLDialogElement && !root.open));
      say(closed ? '已关闭弹层' : '弹层尚未关闭，已停止返回');
      render();scheduleInitial();return;
    }
    if (step === 'fullscreen') { await document.exitFullscreen(); say('已退出全屏'); return; }
    if (step === 'history') {
      remember(); const before = location.href; knownReturn = null; history.back();
      if (!await waitUntil(() => location.href !== before)) say('返回尚未确认，请勿连续按键');
      return;
    }
    say(unknownOverlay() ? '存在未知弹层，已停止返回' : explicitBack ? '没有可返回的上一页' : '没有已确认的返回入口；可按 L3 返回上一页');
  }
  async function execute(action: Action, input?: InputTiming, trustedMenu = false) {
    const hadMenu = menu?.open === true;
    onRoute();
    actionState={kind:action.kind,outcome:'handled'};
    if(hadMenu && !menu?.open && action.kind!=='back'){actionState.outcome='menu-route-changed';return;}
    if(!trustedMenu && input?.menuEpoch!==undefined && input.menuEpoch!==menuEpoch){actionState.outcome='menu-consumed';return;}
    if (!active() || busy || destroyed) {actionState.outcome=destroyed?'disposed':!enabled?'paused':busy?'busy':'unfocused';return;}
    if (editing(focusedControl()) && action.kind !== 'cancel') {actionState.outcome='editing';return;}
    const started=performance.now(), timing=newTiming(action.kind,input);
    lastAction=started;
    let ownsBusy = false;
    try {
      if (action.kind === 'back') { menu?.close(); busy = true; ownsBusy = true; await cancel(true); return; }
      if (action.kind === 'menu') { toggleMenu(); return; }
      if (menu?.open) { if (trustedMenu) menu.consume(action, true); return; }
      if (action.kind === 'navigate') {
        autoSuppressed=false;
        cancelAnimationFrame(restoreFrame);restoring=false; routeEpoch++;
        const all = targets(timing), selecting=performance.now();
        const current = all.find(t => t.element === selected);
        if (!current || current.rect.bottom < 0 || current.rect.top > innerHeight) {
          const first=initial(all);
          if (first) choose(first.element,timing); else {actionState.outcome='no-target';say('未找到可导航目标');}
        } else {
          const id = contentNeighbor(current, action.direction, all, allControls);
          const next = all.find(t => t.id === id);
          if (next) choose(next.element,timing); else {actionState.outcome='no-neighbor';say('已到当前列表边缘');}
        }
        timing.selectionMs=performance.now()-selecting-timing.renderMs;
        return;
      }
      if (action.kind === 'scroll') { window.scrollBy({ top: action.amount, behavior: 'instant' }); const start=performance.now();render();timing.renderMs=performance.now()-start; return; }
      if (action.kind === 'activate') {
        if (!selected?.isConnected || !composedContains(pageScope(), selected) || !usable(selected)) { actionState.outcome='no-target';say('请先用手柄方向选择目标'); return; }
        if (!availableControl(selected)) {actionState.outcome='blocked-target';selected = null; render();scheduleInitial(); say('目标已隐藏、被遮挡或不可用，请重新选择'); return; }
        const link = activationTarget(selected);
        if(!link||!usable(link)||!composedContains(pageScope(),link)){actionState.outcome='blocked-target';say('当前目标不可用，请重新选择实际链接或按钮');return;}
        remember();
        pendingNavigation = link instanceof HTMLAnchorElement ? { url: link.href, length: history.length, expires: performance.now() + 2000 } : null;
        const destination = activationDestination(selected);
        if (destination) { location.assign(destination); return; }
        activateControl(link);
        actionState.outcome=editing(link)?'native-control':'activation-dispatched';
        if(link instanceof HTMLSelectElement)say('原生选择框交给键盘方向/Enter/Esc；手柄 ○ 返回网页导航');
        else if (editing(link)) say(options.keyboardDemo ? '已聚焦输入控件；文字交给键盘，○ / Esc 返回导航' : '已聚焦输入控件；键盘正常编辑，手柄 ○ 返回导航');
        return;
      }
      if (action.kind === 'cancel') {
        const focused = focusedControl();
        if (editing(focused) && focused instanceof HTMLElement) { autoSuppressed=false;focused.blur();say('已返回高亮导航');render();scheduleInitial();return; }
        busy = true; ownsBusy = true; await cancel(); return;
      }
      const video = mainPlayer();
      if (!video) {actionState.outcome='no-player';say('当前页面未发现主视频'); return; }
      if (action.kind === 'play') {
        busy = true; ownsBusy = true;
        if (video.paused) await video.play(); else video.pause();
        say(video.paused ? '已暂停' : '播放中');
      } else if (action.kind === 'seek') {
        const ranges: [number, number][] = Array.from({ length: video.seekable.length }, (_, i) => [video.seekable.start(i), video.seekable.end(i)]);
        const next = boundedSeek(video.currentTime, action.seconds, ranges);
        if (next === null) say('视频尚不可跳转');
        else { video.currentTime = next; say(action.seconds > 0 ? '前进 5 秒' : '后退 5 秒'); }
      } else if (action.kind === 'mute') { video.muted = !video.muted; say(video.muted ? '已静音' : '已恢复声音'); }
      else if (action.kind === 'volume') {
        video.volume = adjustedVolume(video.volume, action.delta);
        say(`视频音量 ${Math.round(video.volume * 100)}%${video.muted ? ' · 当前静音' : ''}`);
      }
      else if (action.kind === 'fullscreen') {
        busy = true; ownsBusy = true;
        if (document.fullscreenElement) await document.exitFullscreen();
        else await fullscreenTarget(video).requestFullscreen();
      }
    } catch {actionState.outcome='unavailable';say('浏览器未允许此操作，请先点击播放器后重试'); }
    finally { if (ownsBusy) busy = false; record(timing,started); }
  }
  function setEnabled(value: boolean, persist = true) {
    if (enabled === value) return;
    enabled = value; selected = null;autoSuppressed=false; menu?.close(); cancelAnimationFrame(restoreFrame);restoring=false; routeEpoch++;
    say(value ? options.keyboardDemo ? 'Demo：键盘方向选择 · 点击手柄入口查看状态' : '手柄控制已启用 · 点击手柄入口查看状态' : '控制已暂停'); render();
    window.dispatchEvent(new CustomEvent('ds5-control-reset'));
    if (persist) options.onEnabledChange?.(value);
    scheduleInitial();
  }
  const onKey = (event: KeyboardEvent) => {
    if (!enabled || event.altKey || event.metaKey || event.ctrlKey || !event.isTrusted) return;
    const target = event.composedPath()[0];
    if (target instanceof Element && editing(target) && event.key !== 'Escape') return;
    if (event.composedPath().includes(host) && !menu?.open) return;
    if ((event.key === 'PageUp' || event.key === 'PageDown') && active() && !document.fullscreenElement) {
      event.preventDefault(); event.stopPropagation();
      if (!event.repeat) options.onTab?.(event.key === 'PageUp' ? -1 : 1);
      return;
    }
    const action = keyAction(event.key);
    if (!action) return;
    event.preventDefault(); event.stopPropagation();
    if (event.repeat && !['navigate', 'seek', 'volume'].includes(action.kind)) return;
    void execute(action,{sampledAt:performance.timeOrigin+event.timeStamp},true);
  };
  const onMouse = (event: MouseEvent) => {
    if (event.isTrusted) { cancelAnimationFrame(restoreFrame);restoring=false; routeEpoch++; selected = null;autoSuppressed=true; render(); }
  };
  const onToggle = (event: MouseEvent) => { if (event.isTrusted) { setEnabled(!enabled); toggle.blur(); } };
  const onMenu = () => { onRoute(); if (enabled) { toggleMenu(); menuLaunch.blur(); } else say('请先启用控制'); };
  function canCloseCurrentTab() { return !destroyed && active() && !editing(focusedControl()) && menu?.closeSelected === true; }
  async function closeCurrentTab() {
    if (!canCloseCurrentTab() || busy || !options.onCloseTab) return;
    busy = true;
    try { if (!await options.onCloseTab()) say('未能关闭当前标签页，请重试或使用浏览器关闭按钮'); }
    catch { say('关闭失败，请使用浏览器关闭按钮'); }
    finally { busy = false; }
  }
  menu = createMenu(dock, (command, trustedInput) => {
    if (command === 'guide') { setPanel(true); return; }
    // MAIN-world actions may operate the webpage; browser tab closure needs a
    // native click here or a fresh press sampled by a trusted extension reader.
    if (command === 'close') { if (trustedInput) void closeCurrentTab(); return; }
    if (command === 'targets') { allControls=!allControls;menu?.close();say(allControls?'试用：全部控件方向浏览':'试用：优先主要内容，上下跨卡片');return; }
    if (command === 'pause') { setEnabled(false); return; }
    if (!active() || busy) return;
    const video = mainPlayer();
    if (!video) { say('当前页面未发现主视频'); return; }
    if (command === 'mute') { video.muted = !video.muted; say(video.muted ? '已静音' : '已恢复声音'); }
    else { video.volume = adjustedVolume(video.volume, command === 'volume-up' ? 0.05 : -0.05); say(`视频音量 ${Math.round(video.volume * 100)}%${video.muted ? ' · 当前静音' : ''}`); }
  }, render,()=>allControls);
  const heading = shadow.querySelector<HTMLElement>('.panel-head')!;
  heading.title = '拖动以移动控制窗'; handle.title = '点击展开或收起 · 拖动以移动';
  placement = createOverlayPosition({ dock, panel, handle, heading, menu: dock.querySelector<HTMLElement>('.menu')!,
    onCommit: options.onOverlayPositionChange,
  });
  menuLaunch.addEventListener('click', onMenu);
  toggle.addEventListener('click', onToggle);
  // Keyboard simulation is an explicit capability of our extension Demo only.
  // Ordinary sites never install a keyboard interceptor, even with a live pad.
  if (options.keyboardDemo) window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointermove', onMouse);
  window.addEventListener('scroll', scheduleRender, true);
  window.addEventListener('resize', render);
  window.addEventListener('blur', render);
  const onResume=()=>{autoSuppressed=false;resumeInitial=true;invalidateMembers();render();scheduleInitial();};
  window.addEventListener('focus', onResume);
  document.addEventListener('visibilitychange', onResume);
  document.addEventListener('focusin', scheduleInitial);
  document.addEventListener('focusout', scheduleInitial);
  document.addEventListener('fullscreenchange', render);
  const onLayer=(event:Event)=>{noteLayerToggle(event);scheduleRender();scheduleInitial();};
  document.addEventListener('toggle',onLayer,true);
  window.visualViewport?.addEventListener('resize',scheduleRender);
  window.visualViewport?.addEventListener('scroll',scheduleRender);
  window.addEventListener('popstate', onRoute);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('pagehide', remember);
  const onShow = () => { onRoute(); restore();scheduleInitial(); };
  window.addEventListener('pageshow', onShow);
  render();
  window.dispatchEvent(new CustomEvent('ds5-menu-session',{detail:{epoch:menuEpoch}}));
  return {
    execute, setEnabled, canCloseCurrentTab, closeCurrentTab,
    hasMenuInput() { return !destroyed && active() && !editing(focusedControl()) && menu?.open === true; },
    setOverlayPosition(value: unknown) { placement?.set(value); },
    get enabled() { return enabled; },
    diagnostics() { return timings.map(row=>({...row})); },
    pageState() {
      const scope=pageScope();
      return {loaded:true,enabled,foreground:!document.hidden&&document.hasFocus(),input:inputHealth?{...inputHealth}:null,
        scope:scope===document.body?'page':scope.matches('[role="menu"],[role="listbox"],:popover-open')?'menu':'dialog',
        discovery:discovery?{state:discovery.candidates?'found':discovery.truncated?'truncated':'empty',...discovery}:{state:'not-scanned',candidates:0,visited:0,truncated:false},
        action:actionState?{...actionState}:null};
    },
    hasInputFocus() {
      return active() && !document.fullscreenElement && !editing(focusedControl());
    },
    setDeviceStatus(text: string, health?: unknown) { deviceStatus = text;const value=cleanGamepadHealth(health);if(value)inputHealth=value;render(); },
    destroy() {
      destroyed = true;placement?.destroy();hideRing();resize.disconnect();host.remove();clearTimeout(toastTimer);
      motion.clear();for(const name of motionEvents)document.removeEventListener(name,onMotion,true);document.fonts?.removeEventListener('loadingdone',scheduleRender);
      document.removeEventListener('toggle',onLayer,true);
      window.visualViewport?.removeEventListener('resize',scheduleRender);window.visualViewport?.removeEventListener('scroll',scheduleRender);
      mutations.disconnect();cancelAnimationFrame(initialFrame);cancelAnimationFrame(renderFrame);
      membership=null;for(const name of invalidationEvents)document.removeEventListener(name,invalidateMembers,true);window.removeEventListener('resize',invalidateMembers);
      cancelAnimationFrame(restoreFrame); routeEpoch++;
      menuLaunch.removeEventListener('click', onMenu);
      window.removeEventListener('popstate', onRoute); window.removeEventListener('hashchange', onRoute);
      window.removeEventListener('pagehide', remember); window.removeEventListener('pageshow', onShow);
      toggle.removeEventListener('click', onToggle); window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointermove', onMouse); window.removeEventListener('scroll', scheduleRender, true);
      window.removeEventListener('resize', render); window.removeEventListener('blur', render); window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume); document.removeEventListener('fullscreenchange', render);
      document.removeEventListener('focusin',scheduleInitial);document.removeEventListener('focusout',scheduleInitial);
    },
  };
}



