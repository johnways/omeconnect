// OMECOnnect service worker — ONLINE-ONLY.
// The app always loads the newest version from the internet; nothing from the
// app is stored for offline use. The only saved page is a small "No internet"
// notice, shown if the app is opened without a connection.
const CACHE = 'omeconnect-online-v11';
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

// ---------------------------------------------------------------- Pop-up notifications
// Sent by the "send-push" server function when OMECO posts an announcement,
// a bill, a verification result or a concern update for this user.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'OMECOnnect';
  const url = data.url || '/customer-mobile-app/index.html';
  // Always a full phone notification: sound + vibration, like any other app.
  // (Some phones report the app as "on screen" even when it is in the
  // background, so the notification is never made silent here. The app's own
  // pop-up stays quiet on phones that get these notifications.)
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'You have a new update from OMECO.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      renotify: Boolean(data.tag),
      silent: false,
      vibrate: [250, 120, 250, 120, 400],
      data: { url },
      timestamp: Date.now()
    })
  );
});

// Android sometimes renews a phone's push registration. Make the new one right
// away; the app links it to the customer the next time it is opened.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => {})
  );
});

// Tapping the pop-up opens (or focuses) the app.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/customer-mobile-app/index.html', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.split('#')[0].split('?')[0] === target);
      if (open) return open.focus();
      return self.clients.openWindow(target);
    })
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
