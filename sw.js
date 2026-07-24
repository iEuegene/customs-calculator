const CACHE_NAME = 'rozmytnennya-v1';
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

  // Everything else (the app shell itself): cache-first, so the calculator
  // opens instantly and works offline once it's been visited at least once.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
