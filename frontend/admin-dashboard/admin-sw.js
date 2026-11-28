// OMECO Staff Console service worker (desktop app).
// It exists so the console can be installed as a computer app. It never
// stores customer data: every request goes to the network as before (the
// site also sends Cache-Control: no-store). Only when the computer is offline
// is a short "you are offline" page shown instead of the browser's error.
const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>OMECO Staff Console</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 Arial,sans-serif;background:#0b2e6b;color:#fff;text-align:center}
main{max-width:420px;padding:24px}h1{font-size:1.4rem;margin:0 0 8px}a{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:#fff;color:#0b2e6b;font-weight:700;text-decoration:none}</style>
</head><body><main><h1>No internet connection</h1><p>The staff console needs the internet to show live OMECO data. Check the connection, then try again.</p>
<a href="">Try again</a></main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else: the browser as usual
  event.respondWith(fetch(event.request).catch(() =>
    new Response(OFFLINE_PAGE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
