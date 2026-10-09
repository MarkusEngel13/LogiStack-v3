/*
 * LogiStack's service worker: the app opens and works without a connection (the home game's
 * wifi). Written into dist/sw.js at build time with this build's version and file list (vitePlugin.ts),
 * so every file of the app - also the pages that load later - is on the phone after one visit.
 * - the app's files: from the cache (their names change with every build);
 * - the page itself: from the network when there is one (to get new versions), else the cache;
 * - /api (sync): never cached, always the network.
 */
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = `logistack-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/', ...FILES].map((f) => new Request(f, { credentials: 'same-origin' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('logistack-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/cdn-cgi/')) return;

  if (req.mode === 'navigate') {
    // network first; offline (or the network fails) -> the cached app
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/', { cacheName: CACHE, ignoreVary: true }).then((r) => r || caches.match('/', { ignoreVary: true }))),
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true, ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic' && url.pathname.startsWith('/assets/')) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
