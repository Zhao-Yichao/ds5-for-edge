import { defineContentScript } from 'wxt/utils/define-content-script';
import { startGamepad } from '../core/input';

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  world: 'MAIN',
  main() {
    window.dispatchEvent(new Event('ds5-input-dispose'));
    let stop = () => {};
    const start = () => {
      stop();
      stop = startGamepad(
        (action,timing) => window.postMessage({ source: 'ds5-demo-v1', action,timing }, location.origin),
        (status,health) => window.postMessage({ source: 'ds5-demo-v1', status,health }, location.origin),
      );
    };
    start();
    // MAIN world has no privileged extension APIs. This channel only drives page actions.
    const hide = () => stop();
    const dispose = () => {
      stop();
      window.removeEventListener('ds5-control-reset', start);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', start);
      window.removeEventListener('ds5-input-dispose', dispose);
    };
    window.addEventListener('ds5-control-reset', start);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', start);
    window.addEventListener('ds5-input-dispose', dispose);
  },
});

