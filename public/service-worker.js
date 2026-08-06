/**
 * Minimal offline application shell.
 * - Navigation requests: network-first, cached copy as offline fallback.
 * - Versioned static assets (/assets/): cache-first.
 * - Provider/API requests: never cached (network-only).
 */

const CACHE_NAME = 'vxpods-shell-v4';
const APP_ROOT_URL = self.registration.scope;
const APP_ROOT_PATH = new URL(APP_ROOT_URL).pathname;
const INDEX_URL = appUrl('index.html');
const SHELL_URLS = [
  appUrl(),
  INDEX_URL,
  appUrl('assets/img/logo.png'),
  appUrl('assets/img/favicon.png'),
  appUrl('assets/img/apple-touch-icon.png'),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(SHELL_URLS);
      // Precache the hashed build assets referenced by the shell document so
      // the first offline load has every runtime-critical file.
      const html = await (await cache.match(INDEX_URL, MATCH_OPTIONS)).text();
      const assets = [
        ...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g),
      ].map((m) => m[1]);
      for (const url of assets) {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, cleanForCache(response));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // provider traffic: network-only

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith(`${APP_ROOT_PATH}assets/`)) {
    event.respondWith(cacheFirst(request));
  }
});

/**
 * Some static hosts send `Vary: Origin`; same-origin module scripts send an
 * Origin header, which would otherwise make stored responses unmatchable.
 * @param {Response} response
 * @returns {Response}
 */
function cleanForCache(response) {
  const headers = new Headers(response.headers);
  headers.delete('vary');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const MATCH_OPTIONS = { ignoreVary: true };

/**
 * @param {Request} request
 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, cleanForCache(response.clone()));
    return response;
  } catch {
    const cached = await cache.match(request, MATCH_OPTIONS);
    return cached || (await cache.match(INDEX_URL, MATCH_OPTIONS)) || Response.error();
  }
}

/**
 * @param {string} [path]
 * @returns {string}
 */
function appUrl(path = '') {
  return new URL(path, APP_ROOT_URL).pathname;
}

/**
 * @param {Request} request
 */
async function cacheFirst(request) {
  const cached = await caches.match(request, MATCH_OPTIONS);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, cleanForCache(response.clone()));
  }
  return response;
}
