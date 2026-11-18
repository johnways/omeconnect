// OMECOnnect service worker: lets the app install on phones and open its
// screens without internet. Always tries the network first so customers get
// the newest version; the saved copy is used only when offline.
// Supabase (account data) is never cached.
const CACHE = 'omeconnect-v1';
const SHELL = [
  '/customer-mobile-app/index.html',
  '/customer-mobile-app/styles.css',
  '/customer-mobile-app/config.js',
  '/customer-mobile-app/supabase-client.js',
  '/customer-mobile-app/script.js',
  '/icons/icon-192.png',
  '/manifest.webmanifest'
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
  const request = event.request;
  const url = new URL(request.url);
  // Only this site's own files; never Supabase or other sites, never non-GET.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Large downloads (the Android app file) go straight to the network.
  if (url.pathname.startsWith('/downloads/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request, { ignoreSearch: true }).then((cached) =>
          cached || (request.mode === 'navigate'
            ? caches.match('/customer-mobile-app/index.html')
            : Response.error())
        )
      )
  );
});
