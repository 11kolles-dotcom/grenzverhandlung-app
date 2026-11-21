/* Offline-Cache der Büro-App „GV Paket“ (eigener Ordner, damit sie getrennt von der Außendienst-App installierbar ist) */
const CACHE = 'gv-buero-0.9.13';
const A = '../grenzverhandlung-app-0.1_v2/';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  A + 'styles.css', A + 'retro.css', A + 'paket.js', A + 'libs/jszip.min.js', A + 'libs/pdf.min.js', A + 'libs/pdf.worker.min.js', A + 'assets/logo.png',
  A + 'fonts/inter-latin-400-normal.woff2', A + 'fonts/inter-latin-600-normal.woff2', A + 'fonts/inter-latin-700-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('gv-buero-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })).then(r => r || fetch(e.request)));
});
