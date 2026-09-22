'use strict';

const VERSION = 'v1.4.8';
const CACHE = `attendance-shell-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/vendor/zxing-reader.iife.js',
  'assets/vendor/zxing_reader.wasm',
  'css/base.css', 'css/components.css', 'css/setup.css', 'css/dashboard.css',
  'js/main.js', 'js/constants.js', 'js/state.js', 'js/utils.js', 'js/db.js',
  'js/config.js', 'js/roster.js', 'js/audio.js', 'js/ui.js', 'js/sync.js',
  'js/scanner.js', 'js/scan.js', 'js/dashboard.js', 'js/setup.js', 'js/history.js',
  'assets/icons/logo.png',
  'assets/icons/icon-512.png',
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
