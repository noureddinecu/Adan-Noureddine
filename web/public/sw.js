// Service worker: caches the app shell so the dashboard opens instantly and installs as a PWA.
// API calls and the live event stream are never cached.
const CACHE = 'lqg-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/logo.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/events' || url.pathname.startsWith('/uploads/')) return;
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/media/') || url.pathname.startsWith('/icons/')) {
    // immutable build assets: cache first
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  // pages: network first, fall back to the cached shell when offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && e.request.mode === 'navigate' && url.pathname === '/') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('/', copy)); }
    return res;
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('/'))));
});
