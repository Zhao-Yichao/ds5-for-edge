import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'wxt/browser': decodeURIComponent(new URL('./node_modules/wxt/dist/browser.mjs', import.meta.url).pathname).replace(/^\/([a-z]:\/)/i, '$1') } },
  test: { root: '../..', include: ['tests/unit/**/*.test.ts'] },
});
