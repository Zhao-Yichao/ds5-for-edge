import { browser } from 'wxt/browser';
import './style.css';
import { sitePattern, supportedUrl } from '../../core/browser-control';

const status = document.querySelector<HTMLElement>('#status')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle')!;
const leave = document.querySelector<HTMLButtonElement>('#leave')!;
let tabId: number | undefined;
let pattern: string | null = null, needsAccess = false;
let newTab=false,replaceRestricted=false;
async function update(type: string) {
  try {
    if (tabId === undefined) throw new Error('No tab');
    const response = await browser.tabs.sendMessage(tabId, { type }) as { enabled: boolean };
    status.textContent = response.enabled ? '控制已启用 · 新页面自动延续' : '控制已暂停 · 所有受支持页面同步';
    toggle.textContent = response.enabled ? '暂停控制' : '启用控制';
    leave.hidden = true;
    needsAccess = false; toggle.disabled = false;
  } catch {
    needsAccess = true;
    leave.hidden = false;
    replaceRestricted=!pattern;
    if(replaceRestricted)document.querySelector('#demo')!.textContent='在此标签打开控制 Demo';
    status.textContent = newTab ? 'Edge默认新建标签页不能注入普通网页脚本。可在此标签打开控制Demo，再用肩键切页；默认新建页设置保持不变。' : pattern ? '此页尚未接管。允许网站访问后启用，将自动补入控制；也可返回可控标签。' : '受保护页面（包括默认新建页）无法加载界面或读取手柄。可在此标签打开控制Demo，或返回可控标签；默认新建页设置保持不变。';
    toggle.textContent = '在此网站启用'; toggle.disabled = !pattern;
  }
}
document.querySelector('#demo')!.addEventListener('click', () => { if((newTab||replaceRestricted)&&tabId!==undefined)void browser.tabs.update(tabId,{url:browser.runtime.getURL('/demo.html')});else void browser.tabs.create({ url: browser.runtime.getURL('/demo.html') }); });
leave.addEventListener('click', () => {
  void browser.runtime.sendMessage({ type: 'ds5-leave-restricted', tabId }).then(result => {
    if (result?.ok) window.close(); else status.textContent = '没有可返回的普通网页。可打开 Demo，或用 Ctrl+Shift+Tab 切换。';
  });
});
document.querySelector('#diagnostics')!.addEventListener('click', () => {
  void Promise.all([browser.runtime.sendMessage({ type: 'ds5-tab-diagnostics' }),
    tabId===undefined?Promise.resolve([]):browser.tabs.sendMessage(tabId,{type:'ds5-page-diagnostics'}).catch(()=>[]),
    tabId===undefined?Promise.resolve(null):browser.tabs.sendMessage(tabId,{type:'ds5-page-state'}).catch(()=>({loaded:false})),
  ]).then(([tabs,page,state])=>{document.querySelector('#timings')!.textContent=JSON.stringify({tabs,page,state,directionRepeat:{delayMs:420,intervalMs:160}},null,2);});
});
toggle.addEventListener('click', () => {
  if (!needsAccess || !pattern) { void update('ds5-toggle'); return; }
  // Start permission request directly in the click handler to retain user gesture.
  const request = browser.permissions.request({ origins: [pattern] });
  toggle.disabled = true;
  void request.then(async granted => {
    if (!granted) { status.textContent = '未授权此网站；可以稍后重试。'; return; }
    const response = await browser.runtime.sendMessage({ type: 'ds5-enable-site', tabId });
    if (!response?.ok) throw new Error('Injection failed');
    await update('ds5-status');
  }).catch(() => { leave.hidden = false; status.textContent = '此页暂时无法接管；请检查网站访问权限，或返回可控标签。'; })
    .finally(() => { toggle.disabled = !pattern; });
});
void browser.tabs.query({ active: true, currentWindow: true }).then(tabs => { tabId = tabs[0]?.id;newTab=/^(?:edge|chrome):\/\/newtab\/?(?:[?#].*)?$|^about:newtab$/.test(tabs[0]?.url??'');if(newTab)document.querySelector('#demo')!.textContent='在此标签打开控制 Demo'; pattern = supportedUrl(tabs[0]?.url, browser.runtime.getURL('/')) ? sitePattern(tabs[0]?.url) : null; return update('ds5-status'); });
