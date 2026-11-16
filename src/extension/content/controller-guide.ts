import controllerArt from '../../../assets/controller/dualsense.svg?raw';

// AL2009man's MIT artwork; provenance and license are in assets/.
// This component describes the existing mapping and never dispatches input.
type Point = [number, number];
type Part = 'l2' | 'l1' | 'r2' | 'r1' | 'options' | 'dpad' | 'left-stick' | 'square' | 'triangle' | 'circle' | 'cross' | 'right-stick';
const anchors: Record<Part, Point> = {
  l2: [95,25], l1: [95,60], r2: [447,25], r1: [447,60], options: [409,112],
  dpad: [95,160], 'left-stick': [185,230], 'right-stick': [365,230],
  // Contact points on the button rim keep leaders out of neighboring buttons.
  square: [405,140], triangle: [449,122], circle: [500,167], cross: [447,204],
};
const words: Record<Part, string[]> = {
  l2: ['L2','后退 5 秒'], l1: ['L1','上一标签'], r2: ['R2','前进 5 秒'], r1: ['R1','下一标签'],
  options: ['Options','功能菜单'], dpad: ['方向键','选择元素'],
  'left-stick': ['左摇杆','推动：选择元素','按下：返回上一页'],
  square: ['□','播放 / 暂停'], triangle: ['△','全屏'], circle: ['○','取消 / 退出编辑'], cross: ['×','确认 / 点击'],
  'right-stick': ['右摇杆 ↑↓','推动：滚动网页','按下：静音'],
};

function diagram(mode: 'wide' | 'left' | 'right') {
  const compact = mode !== 'wide';
  const x = mode === 'wide' ? 200 : mode === 'left' ? 146 : 4;
  const y = mode === 'wide' ? 100 : mode === 'left' ? 48 : 80;
  const width = compact ? 200 : 360, scale = width / 544.70661;
  const prefix = `pad-${mode}-`;
  const art = controllerArt.replace(/id="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace('<svg ', `<svg class="guide-pad" aria-hidden="true" x="${x}" y="${y}" width="${width}" height="${302.91098 * scale}" `);
  const labels: string[] = [];
  function label(part: Part, side: 'left' | 'right', row: number) {
    const [a,b] = anchors[part], start: Point = [x+a*scale,y+b*scale];
    const end: Point = [compact ? side === 'left' ? 138 : 230 : side === 'left' ? 170 : 630,row];
    // Every leader: a 45-degree segment from the physical part, then horizontal.
    // Layout rows are chosen so this never doubles back toward the controller.
    const elbow: Point = [start[0]+(side === 'left' ? -1 : 1)*Math.abs(end[1]-start[1]),end[1]];
    const points = Math.abs(start[1]-end[1]) < .01 ? [start,end] : [start,elbow,end];
    const tx = end[0]+(side === 'left' ? -12 : 12), lines = words[part];
    const inline = lines.length === 2 && part !== 'dpad';
    const lineHeight = 20;
    const ty = row+5-(inline ? 0 : (lines.length-1)*lineHeight/2);
    const text = inline
      ? `<tspan class="guide-key">${lines[0]}</tspan><tspan dx="8">${lines[1]}</tspan>`
      : lines.map((line,i) => `<tspan${i === 0 ? ' class="guide-key"' : ''} x="${tx}"${i ? ` dy="${lineHeight}"` : ''}>${line}</tspan>`).join('');
    labels.push(`<g class="guide-callout" data-part="${part}" data-side="${side}"><polyline points="${points.map(p=>p.join(',')).join(' ')}"/><circle cx="${start[0]}" cy="${start[1]}" r="2.4"/><text x="${tx}" y="${ty}" text-anchor="${side === 'left' ? 'end' : 'start'}">${text}</text></g>`);
  }
  if (mode !== 'right') {
    label('l2','left',compact ? 24 : 30); label('l1','left',compact ? 74 : 70);
    label('dpad','left',compact ? 130 : 206); label('left-stick','left',compact ? 206 : 294);
  }
  if (mode !== 'left') {
    const parts: Part[] = ['r2','r1','options','square','triangle','circle','cross','right-stick'];
    const rows = compact ? [32,56,80,104,128,152,176,216] : [30,70,110,150,190,230,270,330];
    parts.forEach((part,i)=>label(part,'right',rows[i]!));
  }
  return `<svg class="guide-diagram guide-${mode}" viewBox="0 0 ${compact ? `368 ${mode === 'left' ? 244 : 260}` : '800 384'}" role="img" aria-label="${mode === 'wide' ? 'DualSense 按键功能' : mode === 'left' ? '左侧按键与左摇杆功能' : '右侧按键与右摇杆功能'}"><title>手柄按键指南</title>${art}${labels.join('')}</svg>`;
}

export const controllerGuideStyles = `
 .controller-guide{container-type:inline-size;margin:8px 0 14px}
 .controller-guide .guide-diagram{display:block;width:100%;height:auto;font:16.5px/1.4 ui-sans-serif,system-ui,"Microsoft YaHei",sans-serif}
 .controller-guide .guide-compact{display:none}
 .guide-callout polyline{fill:none;stroke:#949eac;stroke-width:1;stroke-linecap:round;stroke-linejoin:round}
 .guide-callout circle{fill:#2e56c9;stroke:#fff;stroke-width:1}
 .guide-callout text{fill:#596371}.guide-callout .guide-key{fill:#202833;font-weight:650}
 @container (max-width:430px){
   .controller-guide>.guide-wide{display:none}.controller-guide .guide-compact{display:grid;gap:8px}
   .controller-guide .guide-compact .guide-diagram{font-size:14px}
 }
`;

export const controllerGuide = () => `<div class="controller-guide">${diagram('wide')}<div class="guide-compact">${diagram('left')}${diagram('right')}</div></div>`;
