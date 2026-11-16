import { defineContentScript } from 'wxt/utils/define-content-script';
import { browser } from 'wxt/browser';
import { createExtensionController } from '../content/extension-controller';
import { isAction } from '../core/actions';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  main(ctx) {
    const controller = createExtensionController();
    let inputReady = false;
    ctx.addEventListener(window, 'message', (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'ds5-demo-v1') return;
      if (isAction(event.data.action)) void controller.execute(event.data.action,event.data.timing);
      if (typeof event.data.status === 'string' && event.data.status.length < 80) { inputReady = true; controller.setDeviceStatus(event.data.status,event.data.health); }
    });
    const listener = (message: unknown, sender: { id?: string }, sendResponse: (value: unknown) => void) => {
      if (sender.id !== browser.runtime.id || !message || typeof message !== 'object') return;
      const request = message as { type?: string };
      if (request.type === 'ds5-revoke') { ctx.notifyInvalidated(); return; }
      if (request.type === 'ds5-page-diagnostics') sendResponse(controller.diagnostics());
      if (request.type === 'ds5-page-state') sendResponse(controller.pageState());
      if (request.type === 'ds5-toggle') controller.setEnabled(!controller.enabled);
      if (request.type === 'ds5-status' || request.type === 'ds5-toggle') sendResponse({ enabled: controller.enabled, version: browser.runtime.getManifest().version, inputReady });
    };
    browser.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { browser.runtime.onMessage.removeListener(listener); controller.destroy(); window.dispatchEvent(new Event('ds5-input-dispose')); });
  },
});

