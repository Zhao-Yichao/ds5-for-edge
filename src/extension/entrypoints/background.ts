import { defineBackground } from 'wxt/utils/define-background';
import { browser } from 'wxt/browser';
import { attachExistingPages, enableSite, ensurePageController, forgetPageController, forgetPageGrants, permittedPage, preparePageForSwitch, syncSiteScripts } from '../content/site-access';
import { adjacentTab, supportedUrl } from '../core/browser-control';
import { createTabRouter } from '../content/tab-router';
import { createTabCloser } from '../content/close-tab';
import { relayFallbackMenu } from '../content/menu-input';

export default defineBackground(() => {
  // Attachment is scheduled by the router after the activation, never awaited by
  // the key press; a rejection here must not surface as an unhandled one.
  const router = createTabRouter({ prepare: tabId => { void preparePageForSwitch(tabId).catch(() => {}); } });
  const closeTab = createTabCloser();
  const fullReconcile = () => { void syncSiteScripts().then(attachExistingPages).catch(() => {}); };
  // A worker can wake for a single shoulder press. Attaching every open tab here
  // would compete with that press for the worker's API queue, so a wake only
  // repairs the focused tab; tab lifecycle events cover the rest.
  const repairActive = () => { void syncSiteScripts().then(async () => {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    if (tab?.id !== undefined) await ensurePageController(tab.id);
  }).catch(() => {}); };
  browser.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.type === 'ds5-fallback-menu-input') { void relayFallbackMenu(message,sender).then(respond); return true; }
    if (message?.type === 'ds5-close-current-tab') {
      void closeTab(sender).then(respond); return true;
    }
    const popup = sender.id === browser.runtime.id && sender.url === browser.runtime.getURL('/popup.html');
    if (message?.type === 'ds5-leave-restricted') {
      if (!popup || !Number.isInteger(message.tabId)) return;
      void (async () => {
        const source = await browser.tabs.get(message.tabId);
        if (!source.active || !(await browser.windows.get(source.windowId)).focused) return { ok: false };
        const tabs = await browser.tabs.query({ windowId: source.windowId });
        const eligible = tabs.filter(tab => tab.id === source.id || supportedUrl(tab.url, browser.runtime.getURL('/')));
        // The popup is a mouse/keyboard escape when the browser forbids a
        // gamepad reader in the current document. Never activate a dead target.
        for (let n = 1; n < eligible.length; n++) {
          const target = adjacentTab(eligible, source.id!, -1);
          if (target === null) break;
          if (await ensurePageController(target)) {
            if (!(await browser.tabs.get(source.id!)).active) return { ok: false };
            await browser.tabs.update(target, { active: true }); return { ok: true };
          }
          eligible.splice(eligible.findIndex(tab => tab.id === target), 1); n--;
        }
        return { ok: false };
      })().then(respond).catch(() => respond({ ok: false }));
      return true;
    }
    if (message?.type === 'ds5-tab-diagnostics') {
      if (popup) respond(router.snapshot());
      return;
    }
    if (message?.type === 'ds5-enable-site') {
      if (!popup || !Number.isInteger(message.tabId)) return;
      void enableSite(message.tabId).then(() => respond({ ok: true })).catch(() => respond({ ok: false }));
      return true;
    }
    if (!['ds5-switch-gamepad', 'ds5-switch-document-gamepad','ds5-switch-keyboard'].includes(message?.type)) return;
    void router.handle(message, sender).then(respond);
    return true;
  });
  browser.runtime.onInstalled.addListener(details => {
    fullReconcile();
    if (details.reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/demo.html') });
  });
  browser.runtime.onStartup.addListener(fullReconcile);
  browser.permissions.onAdded.addListener(() => { forgetPageGrants(); fullReconcile(); });
  browser.tabs.onActivated.addListener(info => { void ensurePageController(info.tabId); });
  browser.tabs.onUpdated.addListener((tabId, change) => {
    if (change.status === 'loading' || change.url !== undefined || change.discarded === true) forgetPageController(tabId);
    if (change.status === 'complete' || change.discarded === false || change.frozen === false) void ensurePageController(tabId);
  });
  browser.tabs.onRemoved.addListener(tabId => forgetPageController(tabId));
  browser.tabs.onReplaced.addListener((added, removed) => { forgetPageController(removed); forgetPageController(added); void ensurePageController(added); });
  browser.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.controlEnabled?.newValue === true) fullReconcile(); });
  browser.permissions.onRemoved.addListener(() => {
    forgetPageGrants();
    forgetPageController();
    void (async () => {
      await syncSiteScripts();
      for (const tab of await browser.tabs.query({})) {
        if (tab.id !== undefined && !await permittedPage(tab.url)) {
          await browser.tabs.sendMessage(tab.id, { type: 'ds5-revoke' }).catch(() => {});
        }
      }
    })().catch(() => {});
  });
  // A worker can wake without onStartup (e.g. extension reload or a late tab).
  repairActive();
});
