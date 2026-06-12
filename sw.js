/* Service worker — cache app shell for offline use.
   EmulatorJS CDN + PokéAPI go network-first with cache fallback. */
const CACHE = "nuzdeck-v1";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/style.css",
  "./js/db.js", "./js/cheats.js", "./js/patcher.js", "./js/rules.js",
  "./js/calc.js", "./js/emulator.js", "./js/app.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // app shell: cache-first
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp));
      return resp;
    })));
    return;
  }
  // external (EmulatorJS CDN, PokéAPI, sprites): network-first, fallback cache
  e.respondWith(fetch(e.request).then(resp => {
    const cp = resp.clone();
    caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
    return resp;
  }).catch(() => caches.match(e.request)));
});
