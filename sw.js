const CACHE_NAME = 'fontane-beverini-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  './images/logo-app.png',
  './images/logo-comune.png',
  './images/sfondo-home.jpg',
  './images/icona-avvio-192.png',
  './images/icona-avvio-512.png',
  './images/icona-avvio-splash.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aperto');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Cancellazione vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Strategy: Cache First, then Network
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip Chrome extensions
  if (event.request.url.startsWith('chrome-extension://')) return;

  // Skip Firebase requests (always go to network)
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // For map tiles, use cache-first strategy
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).then(networkResponse => {
          // Don't cache map tiles
          return networkResponse;
        });
      })
    );
    return;
  }

  // For other requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        
        return fetch(event.request).then(networkResponse => {
          // Don't cache if not a success response
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          // Clone the response
          const responseToCache = networkResponse.clone();

          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });

          return networkResponse;
        });
      })
      .catch(() => {
        // If both cache and network fail, show offline page
        if (event.request.url.includes('.html')) {
          return caches.match('/index.html');
        }
        return new Response('Connessione assente', {
          status: 408,
          headers: { 'Content-Type': 'text/plain' }
        });
      })
  );
});

// Background Sync for offline data
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  console.log('Sincronizzazione dati in background...');
  // Implementa la logica per sincronizzare i dati offline qui
}