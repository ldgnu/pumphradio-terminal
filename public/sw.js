// PumphRadio Service Worker
// Estrategia: network-first para el shell (HTML/navegación) → nunca más ves una
// versión vieja del sitio; cache-first solo para assets con hash (inmutables).
// NUNCA cachea streams de audio. news.json va network-first con copia offline
// (caché NEWS_CACHE): fresco con red, legible sin conexión.
// IMPORTANTE: subir SW_VERSION en cada release que cambie assets sin hash.
const SW_VERSION = 'v10';
const CACHE_NAME = 'pumphradio-shell-' + SW_VERSION;
// Caché dedicada para news.json (fallback offline). NO se limpia en activate:
// si muere la red, la última lista de noticias conocida sigue legible.
const NEWS_CACHE = 'pumphradio-news-v1';
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

// news.json: NETWORK-FIRST con fallback a la última copia cacheada (offline).
// Antes era network-only: sin conexión la lista de noticias quedaba vacía.
// Siempre fresco con red; en offline sirve la copia anterior en vez de romper.
function isNewsJson(url) {
  try { return new URL(url).pathname.endsWith('/news.json') } catch { return false }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method === 'GET' && isNewsJson(request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(NEWS_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (!shouldCache(request)) {
    // Network-only for streams
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
