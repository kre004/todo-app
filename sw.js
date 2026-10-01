/**
 * Service worker — the part that makes this installable and lets the page
 * open without a connection.
 *
 * It is deliberately network-first: every request goes to the network, and
 * the cache is only used when the network fails. That is slightly slower
 * than cache-first, but it means you never get an old copy of the page
 * after you edit and redeploy it — which is the single most confusing
 * thing that can happen while you are building this.
 *
 * It also never touches requests to script.google.com. Your task list is
 * always fetched live, never served from cache.
 */

var CACHE = 'todo-v1';

var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          if (key !== CACHE) return caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;

  // Leave writes alone.
  if (request.method !== 'GET') return;

  // Leave Apps Script alone — task data is never cached.
  if (!request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        var copy = response.clone();
        caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
        return response;
      })
      .catch(function () {
        return caches.match(request).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
