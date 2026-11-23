/* EnviroOS service worker — offline app shell, cache-first with network fallback.
 * NOTE (Vite build): js/css are bundled into hashed assets/*.js|css whose
 * names change every build, so they are NOT listed here. The fetch handler
 * below caches them at runtime on first load; offline works from then on.
 * Bump CACHE whenever SHELL changes. */
const CACHE = 'enviroos-v94-agri-tab-style';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './rover/index.html',
  './rover/app.js',
  './rover/history.js',
  './rover/style.css',
  './rover/enviroos-theme.css',
  './rover/theme.js',
  './rover/qr.html',
  './rover/qr.js',
  './rover/setup.html',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Never store authenticated telemetry, camera frames, QR cards or API failures.
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/qr/') || url.pathname.startsWith('/history/')) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const live = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || live;
    })
  );
});
