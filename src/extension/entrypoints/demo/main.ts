import { createExtensionController } from '../../content/extension-controller';
import { startGamepad } from '../../core/input';
import './style.css';

const cards = [
  ['沿海公路，慢一点也没关系', 'TRAVEL / 旅途', 'coast', '06:24'],
  ['留一盏灯，给夜里的自己', 'LIFE / 日常', 'night', '12:08'],
  ['山在远处，风在身边', 'OUTDOORS / 户外', 'mountain', '08:42'],
  ['把今天调成喜欢的频率', 'MUSIC / 音乐', 'music', '15:36'],
  ['一杯咖啡的空白时间', 'SLOW LIVING / 慢生活', 'coffee', '04:52'],
  ['去一个没有去过的地方', 'EXPLORE / 探索', 'space', '10:18'],
];
const grid = document.querySelector('#cards')!;
for (const [index, [title, category, scene, duration]] of cards.entries()) {
  const anchor = document.createElement('a');
  anchor.href = '#watch'; anchor.dataset.ds5Target = 'card'; anchor.className = 'card';
  anchor.dataset.ds5Key = String(index);
  anchor.innerHTML = `<div class="cover ${scene}"><div class="scene"></div><span class="play">↗</span><span class="duration">${duration}</span></div><p class="category">${category}</p><h3>${title}</h3><p class="card-sub">演示卡片 · 打开同一个本地样片</p>`;
  anchor.addEventListener('click', () => { document.querySelector('#watch-title')!.textContent = title!; });
  grid.append(anchor);
}
const controller = createExtensionController({ keyboardDemo: true });
const start = document.querySelector<HTMLButtonElement>('#start')!;
start.addEventListener('click', () => { controller.setEnabled(true); start.blur(); });
let stopGamepad = () => {};
function restart() {
  stopGamepad();
  stopGamepad = startGamepad((action,timing) => { void controller.execute(action,timing); }, (text,health) => controller.setDeviceStatus(text,health));
}
window.addEventListener('ds5-control-reset', restart);
window.addEventListener('pagehide', () => { stopGamepad(); });
window.addEventListener('pageshow', restart);
restart();
const video = document.querySelector('video')!;
video.addEventListener('loadedmetadata', () => { document.querySelector('#media-status')!.textContent = '样片已就绪 · 使用空格播放，F 进入全屏'; });
video.addEventListener('error', () => { document.querySelector('#media-status')!.textContent = '样片未找到，请先运行媒体生成脚本后重新构建。'; });
