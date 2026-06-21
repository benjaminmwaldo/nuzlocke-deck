/* Service worker — offline support with network-first app shell,
   so updates always arrive when online. */
const CACHE = "nuzdeck-v17";
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./css/style.css",
  "./js/db.js", "./js/cheats.js", "./js/patcher.js", "./js/rules.js",
  "./js/calc.js", "./js/emulator.js", "./js/aiplay.js", "./js/app.js",
  "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  // everything: network-first, fall back to cache when offline
  e.respondWith(
    fetch(e.request).then(resp => {
      const cp = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request))
  );
});
