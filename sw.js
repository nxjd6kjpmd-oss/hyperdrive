// Hyperdrive offline support: always try the network first so updates arrive,
// fall back to the cached copy when offline.
const VERSION = 'hd-v3';
const FILES = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'core/genesis_plus_gx_libretro.js', 'core/genesis_plus_gx_libretro.wasm', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-32.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'})))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
