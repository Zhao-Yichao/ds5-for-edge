import type { Action } from '../core/actions';

type Command = 'volume-up' | 'volume-down' | 'mute' | 'pause' | 'targets' | 'guide' | 'close';
const commands: readonly [Command, string][] = [
  ['volume-up', '音量 ＋ 5%'], ['volume-down', '音量 － 5%'], ['mute', '静音 / 恢复'],
  ['pause', '暂停控制'], ['targets','全部控件（试用切换）'],
  ['guide','返回按键指示'], ['close','关闭当前标签页'],
];

export function createMenu(parent: ShadowRoot | HTMLElement, command: (command: Command, trustedInput?: boolean) => void, changed: () => void, allControls = () => false) {
  const section = document.createElement('section');
  section.className = 'menu'; section.setAttribute('aria-label', '手柄功能菜单'); section.hidden = true;
  section.innerHTML = '<strong>功能菜单</strong><p>↑ ↓ 选择 · × 确认 · ○ 关闭</p>';
  const hint = section.querySelector('p')!;
  let index = 0, open = false;
  const buttons = commands.map(([id, label], n) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    if (id === 'close') { button.dataset.closeTab = 'true'; button.title = '关闭当前标签页；最后一个标签页会关闭所在窗口'; }
    if (id === 'guide') button.dataset.guide = 'true';
    button.addEventListener('click', event => { if (!event.isTrusted) return; index = n; render(); command(id, true); button.blur(); });
    section.append(button); return button;
  });
  parent.append(section);
  function render() {
    section.hidden = !open;
    const selected = commands[index]?.[0];
    hint.textContent = selected === 'close' ? '关闭当前标签页；最后一页会关闭窗口' : selected === 'guide' ? '返回按键指示，不离开当前网页' : '↑ ↓ 选择 · × 确认 · ○ 关闭';
    buttons[commands.findIndex(([id]) => id === 'targets')]!.textContent = allControls() ? '主要内容（试用切换）' : '全部控件（试用切换）';
    buttons.forEach((button, n) => { button.classList.toggle('chosen', n === index); button.setAttribute('aria-current', String(n === index)); });
    changed();
  }
  function close() { open = false; render(); }
  return {
    get open() { return open; }, close,
    get closeSelected() { return open && commands[index]?.[0] === 'close'; },
    toggle() { open = !open; index = 0; render(); },
    consume(action: Action, userInput = false) {
      if (!open) return false;
      if (action.kind === 'navigate') {
        const delta = action.direction === 'down' || action.direction === 'right' ? 1 : -1;
        index = (index + delta + commands.length) % commands.length; render();
      } else if (action.kind === 'activate') command(commands[index]![0], userInput);
      else if (action.kind === 'cancel' || action.kind === 'menu') close();
      return true;
    },
  };
}
