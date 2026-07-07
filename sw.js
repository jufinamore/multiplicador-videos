var CACHE_NAME = "multiplicador-videos-v5";
var SHELL_FILES = ["./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Cache-first for our own shell files, network-first (with cache fallback) for everything else
self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  var isOwnFile = url.origin === self.location.origin;

  if (isOwnFile) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        return cached || fetch(event.request);
      })
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .then(function (resp) {
          var copy = resp.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
          return resp;
        })
        .catch(function () {
          return caches.match(event.request);
        })
    );
  }
});
