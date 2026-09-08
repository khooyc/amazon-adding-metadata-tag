const CACHE = 'amazon-metadata-tag-web-v4';
const ASSETS = [
  './', './index.html', './styles.css', './app.mjs', './xmp.mjs', './people-detector.js', './platform-adapter.js',
  './manifest.webmanifest', './assets/logo.png', './assets/icon-192.png', './assets/icon-512.png', './vendor/human.js',
  './models/blazeface.json', './models/blazeface.bin',
  './models/movenet-lightning.json', './models/movenet-lightning.bin',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  })));
});
