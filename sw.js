const CACHE_NAME = 'fontane-beverini-v3.6.2'; // VERSIONE AGGIORNATA
const STATIC_CACHE = 'static-v3';
const DYNAMIC_CACHE = 'dynamic-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './analytics.js',
  './firebase-init.js',
  './manifest.json',
  './images/logo-app.png',
  './images/logo-comune.png',
  './images/sfondo-home.jpg',         // Immagine Desktop
  './images/sfondo-home-mobile.jpg',  // NUOVA AGGIUNTA: Immagine Mobile
  './images/default-beverino.jpg',
  './images/icona-avvio-144.png',
  './images/icona-avvio-192.png',
  './images/icona-avvio-512.png',
  './images/icona-avvio-splash.png',
  './images/apple-touch-icon.png',
  './images/favicon.ico',
  './images/favicon-16x16.png',
  './images/favicon-32x32.png'  
];

const EXTERNAL_ASSETS = [
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
  'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
];

// Install Service Worker
self.addEventListener('install', event => {
  console.log('[Service Worker] Installazione in corso...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Cache asset statici');
        const cachePromises = STATIC_ASSETS.map(url => {
          return fetch(url, { mode: 'no-cors' })
            .then(response => {
              if (response.ok || response.type === 'opaque') {
                return cache.put(url, response.clone());
              }
              console.warn(`[Service Worker] Asset non trovato: ${url}`);
              return Promise.resolve();
            })
            .catch(error => {
              console.warn(`[Service Worker] Errore caching ${url}:`, error.message);
              return Promise.resolve(); 
            });
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('[Service Worker] Installazione completata');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[Service Worker] Errore installazione:', error);
        return self.skipWaiting(); 
      })
  );
});

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] Attivazione...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Pulisce le vecchie versioni
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[Service Worker] Cancellazione vecchia cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[Service Worker] Attivazione completata');
      return self.clients.claim();
    })
    .catch(error => {
      console.error('[Service Worker] Errore attivazione:', error);
    })
  );
});

// Fetch Strategy
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  if (url.protocol === 'chrome-extension:' || 
      url.protocol === 'chrome:' || 
      url.protocol === 'about:' ||
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      url.protocol === 'file:') {
    return;
  }
  
  if (url.href.includes('firebase') ||
      url.href.includes('nominatim') ||
      url.href.includes('gstatic.com') ||
      url.href.includes('googleapis.com') ||
      url.href.includes('/analytics') ||
      url.href.includes('/firestore')) {
    return fetch(event.request);
  }
  
  if (url.href.includes('tile.openstreetmap.org') || 
      url.href.includes('cdn.rawgit.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            fetch(event.request)
              .then(response => {
                if (response.ok) {
                  caches.open(DYNAMIC_CACHE)
                    .then(cache => cache.put(event.request, response));
                }
              })
              .catch(() => {}); 
            return cachedResponse;
          }
          
          return fetch(event.request)
            .then(response => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(DYNAMIC_CACHE)
                  .then(cache => cache.put(event.request, clone));
              }
              return response;
            });
        })
    );
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then(response => {
            if (!response.ok) {
              if (event.request.url.includes('index.html') || 
                  event.request.headers.get('accept')?.includes('text/html')) {
                return caches.match('./index.html');
              }
              return response;
            }
            
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => {
                if (event.request.url.startsWith('http')) {
                  return cache.put(event.request, responseToCache);
                }
              })
              .catch(err => console.warn('[SW] Cache put error:', err));
            
            return response;
          })
          .catch(error => {
            console.warn('[Service Worker] Fetch fallback:', error.message);
            
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            
            if (event.request.destination === 'image') {
              if (event.request.url.includes('default-beverino.jpg')) {
                return caches.match('./images/sfondo-home.jpg');
              }
              return caches.match('./images/sfondo-home.jpg');
            }

            if (event.request.destination === 'script') {
                 return new Response('/* Offline script placeholder */', {
                    headers: { 'Content-Type': 'application/javascript' }
                 });
            }
            
            return new Response('Modalità offline attiva. Riprova quando la connessione sarà disponibile.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});

// Background Sync
self.addEventListener('sync', event => {
  console.log('[Service Worker] Sync event:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      syncOfflineData().catch(error => {
        console.error('[Service Worker] Sync error:', error);
        return Promise.resolve();
      })
    );
  }
});

async function syncOfflineData() {
  console.log('[Service Worker] Tentativo sincronizzazione dati offline...');
  
  try {
    const clients = await self.clients.matchAll();
    
    if (clients.length === 0) {
      console.log('[Service Worker] Nessun client attivo per la sincronizzazione');
      return Promise.resolve();
    }
    
    const syncPromises = clients.map(client => {
      return client.postMessage({
        type: 'SYNC_OFFLINE_DATA',
        timestamp: new Date().toISOString()
      });
    });
    
    await Promise.all(syncPromises);
    console.log('[Service Worker] Messaggio sync inviato a', clients.length, 'client(s)');
    
    return Promise.resolve();
  } catch (error) {
    console.error('[Service Worker] Errore durante sync:', error);
    return Promise.resolve();
  }
}

// Handle messages
self.addEventListener('message', event => {
  const { data, ports } = event;
  
  if (data && data.type) {
    if (data.type === 'CLEAR_CACHE') {
      caches.keys()
        .then(cacheNames => {
          return Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
        })
        .then(() => {
          if (ports && ports[0]) {
            ports[0].postMessage({ success: true, message: 'Cache pulita' });
          }
        })
        .catch(error => {
          if (ports && ports[0]) {
            ports[0].postMessage({ success: false, error: error.message });
          }
        });
    }
    
    if (data.type === 'CHECK_UPDATE') {
      self.registration.update()
        .then(() => {
          if (ports && ports[0]) {
            ports[0].postMessage({ updateAvailable: true });
          }
        })
        .catch(error => {
          if (ports && ports[0]) {
            ports[0].postMessage({ updateAvailable: false, error: error.message });
          }
        });
    }
  }
});