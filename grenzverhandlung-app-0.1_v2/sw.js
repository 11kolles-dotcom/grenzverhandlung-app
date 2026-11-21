/* Offline-Cache (beim Installieren am Browser-Cache vorbei geladen, sonst landet eine alte Datei im neuen Cache): alle App-Dateien werden beim ersten Aufruf gespeichert, Demo-Dateien beim ersten Laden */
const CACHE = 'gv-0.9.12';
const FILES = ['./', 'index.html', 'styles.css', 'retro.css', 'app.js', 'paket.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png',
  'libs/pdf.min.js', 'libs/pdf.worker.min.js', 'libs/pdf-lib.min.js', 'libs/jszip.min.js', 'libs/qrcode.js',
  'assets/logo.png', 'assets/hintergrund.jpg',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-600-normal.woff2', 'fonts/inter-latin-700-normal.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && !k.startsWith('gv-buero-')).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).pathname.includes('/demo/')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  })));
});
