// Service worker de CyoTools TV.
// Guarda una copia del lanzador para que se abra aunque el ordenador
// arranque antes de tener conexión (en modo quiosco, la alternativa sería
// la página de error de Chrome, sin forma cómoda de salir de ella).
// Siempre intenta primero la red, así que las actualizaciones se ven al
// momento; la copia solo se usa si la red no responde.

const CACHE = 'cyotools-tv-v3';
const SHELL = [
  './',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/services.js',
  './assets/js/storage.js',
  './assets/js/spatial-nav.js',
  './assets/js/news.js',
  './assets/js/screensaver.js',
  './assets/fonts/atkinson-hyperlegible-next-latin-wght-normal.woff2',
  './assets/fonts/atkinson-hyperlegible-next-latin-ext-wght-normal.woff2',
];
const NETWORK_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromNetwork(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL('./', self.location).pathname)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? './' : req;
    try {
      const res = await fromNetwork(req);
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch {
      const cached = await cache.match(key, { ignoreSearch: true });
      if (cached) return cached;
      return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
