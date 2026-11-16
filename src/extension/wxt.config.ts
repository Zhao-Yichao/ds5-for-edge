import { defineConfig } from 'wxt';

export default defineConfig({
  outDir: '../../artifacts/build/extension',
  imports: false,
  publicDir: '../../assets/demo',
  manifest: {
    name: 'DS5 for Edge · Demo',
    description: '手柄控制网页按钮、链接与视频。跨站切换、方向选择与确认点击，视频控制作为增强。',
    version: '0.9.14',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['http://*/*', 'https://*/*'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    web_accessible_resources: [{ resources: ['tab-input.html', 'chunks/*'], matches: ['http://*/*', 'https://*/*'] }],
  },
});



