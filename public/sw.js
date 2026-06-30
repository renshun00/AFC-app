/**
 * AFC Management – Service Worker v4
 */
const CACHE_VER = 'v5';
const CACHE_NAME = `afc-mgmt-${CACHE_VER}`;
const FONT_CACHE = `afc-fonts-${CACHE_VER}`;

const PRECACHE_URLS = [
  '/', '/index.html', '/offline.html',
  '/favicon.png', '/afc_logo.jpg', '/tng_qr_placeholder.svg',
  '/icons/icon-192x192.png', '/icons/icon-512x512.png',
  '/icons/maskable-192x192.png', '/icons/maskable-512x512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== FONT_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) return;

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, FONT_CACHE)); return;
  }
  if (url.origin === self.location.origin && /\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, CACHE_NAME)); return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(res => { storeInCache(CACHE_NAME, request, res.clone()); return res; })
        .catch(() => caches.match('/index.html').then(r => r || caches.match('/offline.html')))
    ); return;
  }
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

async function cacheFirst(req, name) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try { const res = await fetch(req); if (res?.ok) storeInCache(name, req, res.clone()); return res; }
  catch { return new Response('Offline', { status: 503 }); }
}

function storeInCache(name, req, res) {
  if (res?.ok) caches.open(name).then(c => c.put(req, res));
}

self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
