const CACHE_NAME = 'quraner-alo-static-v1';
const APP_BASE = new URL('./', self.location.href);
const PRECACHE = [
  new URL('assets/qas-pwa-192.png', APP_BASE).href,
  new URL('assets/qas-pwa-512.png', APP_BASE).href
];
const SAFE_STYLES = new Set(['styles.css', 'dashboard.css', 'portal.css', 'ui-design.css']);
const SAFE_IMAGES = new Set([
  new URL('assets/quraner-alo-logo.jpg', APP_BASE).pathname,
  new URL('assets/qas-pwa-192.png', APP_BASE).pathname,
  new URL('assets/qas-pwa-512.png', APP_BASE).pathname
]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(PRECACHE.map(async url => {
      try {
        const response = await fetch(url);
        if (response.ok && response.type === 'basic') await cache.put(url, response);
      } catch (_) {
        // An unavailable icon must not prevent the existing site from loading.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = await caches.keys();
    await Promise.all(oldCaches
      .filter(name => name.startsWith('quraner-alo-static-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate' || request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE.pathname)) return;
  const filename = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
  const safeStyle = request.destination === 'style' && SAFE_STYLES.has(filename);
  const safeImage = request.destination === 'image' && SAFE_IMAGES.has(url.pathname);
  if (!safeStyle && !safeImage) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
