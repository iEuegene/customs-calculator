const CACHE_NAME = 'rozmytnennya-v2';
const APP_SHELL = [
  '/',
  '/favicon.svg',
  '/manifest.json'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_NAME; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  const url = new URL(event.request.url);

  // Exchange rate: always try the network first (rates change), fall back to
  // the last cached response if the user is offline.
  if (url.pathname === '/api/rate') {
    event.respondWith(
      fetch(event.request)
        .then(function (res) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
          return res;
        })
        .catch(function () { return caches.match(event.request); })
    );
    return;
  }

  // Everything else (the app shell itself): network-first, so a normal reload
  // always shows the latest deployed version. Cache is only used as a fallback
  // when the network is unavailable (offline), not as the default source.
  event.respondWith(
    fetch(event.request)
      .then(function (res) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        return res;
      })
      .catch(function () { return caches.match(event.request); })
  );
});
