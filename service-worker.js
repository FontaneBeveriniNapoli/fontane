// service-worker.js - File vuoto per compatibilità
console.log('Service Worker vuoto per compatibilità');

// Evento install
self.addEventListener('install', function(event) {
    console.log('Service Worker installato (vuoto)');
    self.skipWaiting();
});

// Evento activate
self.addEventListener('activate', function(event) {
    console.log('Service Worker attivato (vuoto)');
    return self.clients.claim();
});

// Fetch - passa tutto senza caching
self.addEventListener('fetch', function(event) {
    event.respondWith(fetch(event.request));
});