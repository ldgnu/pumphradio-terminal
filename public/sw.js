// PumphRadio Service Worker
// Cache-first for static assets; NEVER caches audio streams or news.json
const CACHE_NAME = 'pumphradio-sw-v1';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './favicon-32.png',
  './favicon-16.png',
];

// Patterns to NEVER cache
const NO_CACHE_PATTERNS = [
  /news\.json/,
  /\.(mp3|ogg|opus|aac|m3u8|pls|flac|wav)(\?|$)/i,
  /\/stream\//,
  /\/api\//,
  /\/live\//,
];

function shouldCache(request) {
  const url = request.url;
  if (NO_CACHE_PATTERNS.some(p => p.test(url))) return false;
  // Only cache GET requests for same-origin assets
  if (request.method !== 'GET') return false;
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!shouldCache(request)) {
    // Network-only for streams/news
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
