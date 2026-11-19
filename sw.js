/* La Cesta — service worker */
'use strict';

const VERSION = 'lacesta-v1.0.1';
const SHELL_CACHE = `${VERSION}-shell`;
const IMAGE_CACHE = `${VERSION}-images`;
const MAX_IMAGES = 320;

const SHELL_ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/utils.js',
  './js/db.js',
  './js/app.js',
  './data/catalog.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((error) => console.warn('[SW] No se pudo precachear todo', error))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== IMAGE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.pathname.includes('/api/')) return;
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'));
    return;
  }

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/data/catalog.js')) {
      event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
      return;
    }
    if (['document', 'script', 'style', 'manifest'].includes(request.destination)) {
      event.respondWith(networkFirst(request, null));
      return;
    }
    if (request.destination === 'image' || url.pathname.startsWith('/icons/')) {
      event.respondWith(cacheFirst(request, SHELL_CACHE));
      return;
    }
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstImage(request));
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('Sin conexión', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || network || new Response('Sin conexión', { status: 503 });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return new Response('Sin conexión', { status: 503 });
  }
}

async function cacheFirstImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request, { mode: 'no-cors' });
    if (response && (response.ok || response.type === 'opaque')) {
      await cache.put(request, response.clone());
      trimImageCache(cache);
    }
    return response;
  } catch (error) {
    return new Response('', { status: 504 });
  }
}

async function trimImageCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= MAX_IMAGES) return;
    const excess = keys.length - MAX_IMAGES;
    for (let i = 0; i < excess; i += 1) {
      await cache.delete(keys[i]);
    }
  } catch (error) {
    /* la limpieza es best-effort */
  }
}
