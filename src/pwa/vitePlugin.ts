import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/**
 * Writes dist/sw.js from src/pwa/sw-template.js with this build's files, so the service worker
 * changes (and updates the phone's copy) whenever the app does.
 */
export function serviceWorker(): Plugin {
  return {
    name: 'logistack-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && f !== 'index.html')
        .map((f) => `/${f}`);
      const statics = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
      const all = [...new Set([...files, ...statics])].sort();
      let h = 2166136261;
      for (const f of all) for (let i = 0; i < f.length; i++) h = Math.imul(h ^ f.charCodeAt(i), 16777619);
      const version = `${(h >>> 0).toString(36)}-${Date.now().toString(36)}`;
      const source = readFileSync(new URL('./sw-template.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('= __FILES__;', `= ${JSON.stringify(all)};`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
