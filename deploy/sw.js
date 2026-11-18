// OMECOnnect service worker — ONLINE-ONLY.
// The app always loads the newest version from the internet; nothing from the
// app is stored for offline use. The only saved page is a small "No internet"
// notice, shown if the app is opened without a connection.
const CACHE = 'omeconnect-online-v2';
const OFFLINE_PAGE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: 'reload' })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Delete everything older versions saved (the earlier offline copy of the app).
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Only page loads are handled; every file and all data go straight to the network.
  if (request.mode !== 'navigate') return;
  event.respondWith(
    fetch(request, { cache: 'no-store' }).catch(() =>
      caches.match(OFFLINE_PAGE).then((page) => page || Response.error())
    )
  );
});
