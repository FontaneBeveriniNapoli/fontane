const CACHE_NAME = 'fontane-na-v3';
const ASSETS = [
  './', './index.html', './style.css', './app.js',
  './images/sfondo-home.jpg', './images/logo-app.png', './images/logo-comune.png'
];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener('fetch', e => e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))));