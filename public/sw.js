// PumphRadio Service Worker
// Estrategia: network-first para el shell (HTML/navegación) → nunca más ves una
// versión vieja del sitio; cache-first solo para assets con hash (inmutables).
// NUNCA cachea streams de audio ni news.json.
// IMPORTANTE: subir SW_VERSION en cada release que cambie assets sin hash.
const SW_VERSION = 'v2';
const CACHE_NAME = 'pumphradio-shell-' + SW_VERSION;
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

// ¿Es una navegación (HTML) o un asset SIN hash? Eso va network-first para que
// un deploy nuevo se vea al instante. Los bundles de Vite llevan hash en el
// nombre (index-AbC123.js) y son inmutables → cache-first ahí es seguro.
function isShellRequest(request, url) {
  if (request.mode === 'navigate') return true;
  if (request.destination === 'document') return true;
  try {
    const p = new URL(url).pathname;
    if (p === '/' || p.endsWith('/index.html')) return true;
    // assets versionados por content-hash de Vite: index-C0QiVXkK.js (8+ chars alfanuméricos)
    if (/-[A-Za-z0-9_]{8,}\.(js|css|woff2?)$/i.test(p)) return false;
    return true;
  } catch {
    return true;
  }
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

  // Shell (HTML / assets sin hash): NETWORK-FIRST con fallback a cache offline.
  if (isShellRequest(request, request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Assets inmutables (con hash): cache-first.
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
