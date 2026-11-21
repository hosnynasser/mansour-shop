// MANSOUR POS service worker — cache للواجهة بس، طلبات الـ API دايماً live
const CACHE = 'mansour-pos-v2';
const ASSETS = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.includes('workers.dev')) return; // API live
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const cl = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cl)); }
      return r;
    }).catch(() => caches.match(e.request).then((m) => m || caches.match('./')))
  );
});
