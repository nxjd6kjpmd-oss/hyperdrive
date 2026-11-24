// Hyperdrive offline cache: app shell + emulator core. Bump VERSION when files change.
const VERSION = 'hd-v1';
const FILES = ['./', 'index.html', 'app.js', 'manifest.webmanifest', 'core/genesis_plus_gx_libretro.js', 'core/genesis_plus_gx_libretro.wasm', 'icons/icon-180.png', 'icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => hit)));
});
