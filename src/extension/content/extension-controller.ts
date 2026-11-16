import { browser } from 'wxt/browser';
import { createController } from './controller';
import { startDocumentTabInput } from './document-tab-input';
import { isAction } from '../core/actions';

export function createExtensionController(options: { keyboardDemo?: boolean } = {}) {
  let revision = 0, positionRevision = 0, disposed = false;
  const controller = createController({
    keyboardDemo: options.keyboardDemo === true,
    onEnabledChange(enabled) { revision++; void browser.storage.local.set({ controlEnabled: enabled }); },
    onOverlayPositionChange(position) { positionRevision++; void browser.storage.local.set({ overlayPosition: position }); },
    async onCloseTab() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([browser.runtime.sendMessage({ type: 'ds5-close-current-tab' }),
          new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1000); })]);
        return result?.ok === true;
      } catch { return false; }
      finally { clearTimeout(timer); }
    },
    onTab(direction) { void browser.runtime.sendMessage({ type: 'ds5-switch-keyboard', direction }); },
  });
  const initialRevision = revision;
  const initialPositionRevision = positionRevision;
  // The extension-origin frame is only created when the isolated top document
  // cannot read the Gamepad API. Creating it unconditionally made every press a
  // race between two readers for one window lock.
  let fallbackFrame: HTMLIFrameElement | null = null;
  const createFallbackFrame = () => {
    if (fallbackFrame || disposed) return;
    const frame = document.createElement('iframe');
    frame.dataset.ds5Input = 'true';
    frame.src = browser.runtime.getURL('/tab-input.html');
    frame.title = 'DS5 trusted tab input'; frame.setAttribute('aria-hidden', 'true'); frame.allow = 'gamepad'; frame.tabIndex = -1;
    // Fully active extension-origin document; never steals page focus or accepts page messages.
    frame.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;border:0;opacity:.01;pointer-events:none;z-index:1';
    document.documentElement.append(frame);
    fallbackFrame = frame;
  };
  const tabInput = startDocumentTabInput(() => controller.hasInputFocus(), createFallbackFrame,
    { active: () => controller.hasMenuInput(), execute: action => { void controller.execute(action, undefined, true); } });
  void browser.storage.local.get(['controlEnabled', 'overlayPosition']).then(state => {
    if (!disposed && revision === initialRevision) controller.setEnabled(state.controlEnabled === true, false);
    if (!disposed && positionRevision === initialPositionRevision) controller.setOverlayPosition(state.overlayPosition);
  });
  const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && changes.controlEnabled) { revision++; controller.setEnabled(changes.controlEnabled.newValue === true, false); }
    if (area === 'local' && changes.overlayPosition) { positionRevision++; controller.setOverlayPosition(changes.overlayPosition.newValue); }
  };
  const focus = (message: unknown, sender: { id?: string }, respond: (value: unknown) => void) => {
    const relay = message as { type?:string; action?:unknown; expiresAt?:number } | null;
    if (sender.id === browser.runtime.id && relay?.type === 'ds5-deliver-fallback-menu') {
      const allowed = !disposed && !tabInput.snapshot().available && controller.hasMenuInput()
        && typeof relay.expiresAt === 'number' && Date.now() <= relay.expiresAt
        && isAction(relay.action) && ['navigate','activate','cancel'].includes(relay.action.kind);
      if (allowed && isAction(relay.action)) void controller.execute(relay.action, undefined, true);
      respond({ handled:allowed });
    }
    if (sender.id === browser.runtime.id && (message as { type?: string } | null)?.type === 'ds5-close-focus') respond({ allowed: controller.canCloseCurrentTab() });
    if (sender.id === browser.runtime.id && (message as { type?: string } | null)?.type === 'ds5-tab-focus') respond({ active: controller.hasInputFocus(),documentReader:tabInput.snapshot().available });
  };
  browser.storage.onChanged.addListener(changed);
  browser.runtime.onMessage.addListener(focus);
  const destroy = controller.destroy;
  return {
    ...controller,
    get enabled() { return controller.enabled; },
    pageState(){return {...controller.pageState(),tabs:tabInput.snapshot()};},
    destroy() { disposed = true;tabInput.destroy(); fallbackFrame?.remove(); browser.storage.onChanged.removeListener(changed); browser.runtime.onMessage.removeListener(focus); destroy(); },
  };
}
