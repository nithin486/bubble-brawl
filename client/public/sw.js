// Offline play and instant repeat visits. The build writes a new cache name whenever any file changes.
const CACHE = 'bb-__BUILD__';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'manifest.webmanifest'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bb-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (key, res) => {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(key, copy));
  }
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // the page: newest when online, the saved one when not
  if (req.mode === 'navigate') {
    if (url.pathname.endsWith('privacy.html')) return;
    e.respondWith(
      fetch(req)
        .then((res) => put('./', res))
        .catch(() => caches.match('./', { cacheName: CACHE })),
    );
    return;
  }
  // everything else: the saved copy first (each build has its own cache)
  e.respondWith(caches.match(req, { cacheName: CACHE }).then((hit) => hit || fetch(req).then((res) => put(req, res))));
});
