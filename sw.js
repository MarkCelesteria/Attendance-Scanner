'use strict';

const VERSION = 'v1.9.8';
const CACHE = `attendance-shell-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/vendor/zxing-reader.iife.js',
  'assets/vendor/zxing_reader.wasm',
  'assets/vendor/qrcode.js',
  'assets/vendor/jspdf.umd.min.js',
  'css/base.css', 'css/components.css', 'css/setup.css', 'css/dashboard.css',
  'js/main.js', 'js/constants.js', 'js/state.js', 'js/utils.js', 'js/db.js',
  'js/config.js', 'js/roster.js', 'js/audio.js', 'js/ui.js', 'js/sync.js',
  'js/scanner.js', 'js/scan.js', 'js/barcode.js', 'js/dashboard.js', 'js/setup.js',
  'js/history.js', 'js/admin.js', 'js/qrpdf.js', 'js/theme.js', 'js/designs.js', 
  'js/display.js', 'js/animations.js',
  'assets/fonts/ibm-plex-sans-latin-400-normal.woff2',
  'assets/fonts/ibm-plex-sans-latin-600-normal.woff2',
  'assets/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2',
  'assets/fonts/ibm-plex-sans-condensed-latin-700-normal.woff2',
  'assets/fonts/ibm-plex-mono-latin-400-normal.woff2',
  'assets/fonts/ibm-plex-mono-latin-600-normal.woff2',
  'assets/fonts/chakra-petch-latin-600-normal.woff2',
  'assets/fonts/chakra-petch-latin-700-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-400-normal.woff2',
  'assets/fonts/jetbrains-mono-latin-600-normal.woff2',
  'assets/fonts/exo-2-latin-600-normal.woff2',
  'assets/fonts/exo-2-latin-700-normal.woff2',
  'assets/fonts/orbitron-latin-600-normal.woff2',
  'assets/fonts/press-start-2p-latin-400-normal.woff2',
  'assets/fonts/vt323-latin-400-normal.woff2',
  'assets/icons/logo.png', 'assets/icons/logo-pwa.png',
  'assets/icons/Settings.svg', 'assets/icons/Admin.svg', 'assets/icons/Refresh.svg',
  'css/ledger/base.css', 'css/ledger/components.css', 'css/ledger/setup.css', 'css/ledger/dashboard.css',
  'css/paper/base.css', 'css/paper/components.css', 'css/paper/setup.css', 'css/paper/dashboard.css',
  'css/clay/base.css', 'css/clay/components.css', 'css/clay/setup.css', 'css/clay/dashboard.css',
  'css/mono/base.css', 'css/mono/components.css', 'css/mono/setup.css', 'css/mono/dashboard.css',
  'css/space/base.css', 'css/space/components.css', 'css/space/setup.css', 'css/space/dashboard.css',
  'css/tech/base.css', 'css/tech/components.css', 'css/tech/setup.css', 'css/tech/dashboard.css',
  'css/nature/base.css', 'css/nature/components.css', 'css/nature/setup.css', 'css/nature/dashboard.css',
  'css/retro/base.css', 'css/retro/components.css', 'css/retro/setup.css', 'css/retro/dashboard.css',
  'css/storm/base.css', 'css/storm/components.css', 'css/storm/setup.css', 'css/storm/dashboard.css',
];
const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map((u) => cache.add(new Request(u, { cache: 'reload' }))));
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
  if (!isShell && !isQrLib) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const network = fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    if (cached) { event.waitUntil(network); return cached; }

    const fresh = await network;
    if (fresh) return fresh;
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
