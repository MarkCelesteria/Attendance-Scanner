/* ==========================================================================
   Attendance Scanner — service worker
   Strategy: stale-while-revalidate for the app shell + the QR library.
   - First visit (online) caches everything; afterwards the app opens offline.
   - Updates download in the background and apply on the NEXT launch.
   - Google Apps Script requests are never touched (they must always hit the network).
   To force an update after you change any file: bump VERSION below.
   ========================================================================== */
'use strict';

const VERSION = 'v3';
const CACHE = `attendance-shell-${VERSION}`;

// Relative URLs so this works from a GitHub Pages sub-path (/repo-name/).
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/vendor/html5-qrcode.min.js',
  'css/base.css', 'css/components.css', 'css/setup.css', 'css/dashboard.css',
  'js/main.js', 'js/constants.js', 'js/state.js', 'js/utils.js', 'js/db.js',
  'js/config.js', 'js/roster.js', 'js/audio.js', 'js/ui.js', 'js/sync.js',
  'js/scanner.js', 'js/scan.js', 'js/dashboard.js', 'js/setup.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
];
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try { await cache.add(QR_LIB); } catch (e) { /* cached later on first successful fetch */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isShell = url.origin === self.location.origin;
  const isQrLib = url.href === QR_LIB;
  if (!isShell && !isQrLib) return;   // Apps Script, fonts, etc.: let the browser handle it

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    if (cached) { event.waitUntil(network); return cached; }

    const fresh = await network;
    if (fresh) return fresh;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
