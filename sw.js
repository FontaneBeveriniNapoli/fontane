const CACHE_NAME = 'fontane-beverini-v2.0.2';
const STATIC_CACHE = 'static-v2';
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
  './images/sfondo-home.jpg',
  './images/icona-avvio-144.png',
  './images/icona-avvio-192.png',
  './images/icona-avvio-512.png',
  './images/icona-avvio-splash.png',
  './images/apple-touch-icon.png',
  './images/favicon.ico',
  './images/favicon-16x16.png',
  './images/favicon-32x32.png',
  './images/screenshot-1.png'
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

// Install Service Worker - VERSIONE CORRETTA PER GITHUB PAGES
self.addEventListener('install', event => {
  console.log('[Service Worker] Installazione in corso...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Cache asset statici');
        // Cache solo i file che esistono realmente, gestendo errori singolarmente
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
              return Promise.resolve(); // Non bloccare l'installazione
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
        return self.skipWaiting(); // IMPORTANTE: Salta comunque l'attesa
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

// Fetch Strategy: Cache First with Network Fallback - VERSIONE ROBUSTA
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  
  // Skip external API calls
  if (url.href.includes('firebase') ||
      url.href.includes('nominatim') ||
      url.href.includes('gstatic.com') ||
      url.href.includes('googleapis.com') ||
      url.href.includes('/analytics') ||
      url.href.includes('/firestore')) {
    return fetch(event.request);
  }
  
  // Special handling for OSM tiles
  if (url.href.includes('tile.openstreetmap.org') || 
      url.href.includes('cdn.rawgit.com')) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // Return cached if available
          if (cachedResponse) {
            // Update cache in background
            fetch(event.request)
              .then(response => {
                if (response.ok) {
                  caches.open(DYNAMIC_CACHE)
                    .then(cache => cache.put(event.request, response));
                }
              })
              .catch(() => {}); // Ignore errors
            return cachedResponse;
          }
          
          // Otherwise fetch and cache
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
  
  // Per GitHub Pages, gestisci le richieste in modo più robusto
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // If cached, return it
        if (cachedResponse) {
          return cachedResponse;
        }
        
        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache error responses
            if (!response.ok) {
              // Se la richiesta fallisce e stiamo cercando index.html, serviamo una versione offline
              if (event.request.url.includes('index.html') || 
                  event.request.headers.get('accept')?.includes('text/html')) {
                return caches.match('./index.html');
              }
              return response;
            }
            
            // Clone and cache successful responses
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then(cache => cache.put(event.request, responseToCache));
            
            return response;
          })
          .catch(error => {
            console.warn('[Service Worker] Fetch fallback:', error.message);
            
            // Return offline page for HTML requests
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // Return placeholder for images
            if (event.request.destination === 'image') {
              return caches.match('./images/sfondo-home.jpg');
            }

            // MODIFICA: Per evitare SyntaxError sugli script
            if (event.request.destination === 'script') {
                 return new Response('/* Offline script placeholder */', {
                    headers: { 'Content-Type': 'application/javascript' }
                 });
            }
            
            // Return offline message for other requests
            return new Response('Modalità offline attiva. Riprova quando la connessione sarà disponibile.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
      })
  );
});

// Background Sync for offline data
self.addEventListener('sync', event => {
  console.log('[Service Worker] Sync event:', event.tag);
  
  if (event.tag === 'sync-data') {
    event.waitUntil(
      syncOfflineData().catch(error => {
        console.error('[Service Worker] Sync error:', error);
        return Promise.resolve(); // Always resolve to avoid retries
      })
    );
  }
});

async function syncOfflineData() {
  console.log('[Service Worker] Tentativo sincronizzazione dati offline...');
  
  try {
    // Notify all clients to sync their offline data
    const clients = await self.clients.matchAll();
    
    if (clients.length === 0) {
      console.log('[Service Worker] Nessun client attivo per la sincronizzazione');
      return Promise.resolve();
    }
    
    // Send sync message to all clients
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
    return Promise.resolve(); // Always resolve
  }
}

// Handle messages from the app
self.addEventListener('message', event => {
  console.log('[Service Worker] Messaggio ricevuto:', event.data?.type);
  
  const { data, ports } = event;
  
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
  
  if (data.type === 'GET_CACHE_INFO') {
    caches.keys()
      .then(cacheNames => {
        const cacheInfo = cacheNames.map(name => ({ name, size: 'unknown' }));
        if (ports && ports[0]) {
          ports[0].postMessage({ caches: cacheInfo });
        }
      })
      .catch(error => {
        if (ports && ports[0]) {
          ports[0].postMessage({ error: error.message });
        }
      });
  }
  
  if (data.type === 'PRE_CACHE') {
    const { urls } = data;
    caches.open(DYNAMIC_CACHE)
      .then(cache => {
        const cachePromises = urls.map(url => {
          return fetch(url)
            .then(response => {
              if (response.ok) {
                return cache.put(url, response);
              }
              return Promise.resolve();
            })
            .catch(() => Promise.resolve());
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        if (ports && ports[0]) {
          ports[0].postMessage({ success: true });
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
});

// Push notifications (if configured)
self.addEventListener('push', event => {
  console.log('[Service Worker] Push notification ricevuta');
  
  if (!event.data) return;
  
  let notificationData;
  try {
    notificationData = event.data.json();
  } catch {
    notificationData = {
      title: 'Fontane Napoli',
      body: event.data.text() || 'Nuova notifica',
      icon: './images/icona-avvio-144.png'
    };
  }
  
  const options = {
    body: notificationData.body || 'Notifica',
    icon: notificationData.icon || './images/icona-avvio-144.png',
    badge: './images/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      url: notificationData.url || './',
      timestamp: new Date().toISOString()
    },
    actions: [
      {
        action: 'open',
        title: 'Apri'
      },
      {
        action: 'close',
        title: 'Chiudi'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'Fontane & Beverini Napoli',
      options
    )
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notifica cliccata:', event.action);
  
  event.notification.close();
  
  if (event.action === 'close') {
    return;
  }
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(clientList => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(event.notification.data.url) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || './');
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('[Service Worker] Notifica chiusa');
});

// Periodic sync for background updates (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-cache') {
      console.log('[Service Worker] Periodic sync per aggiornamento cache');
      event.waitUntil(updateCache());
    }
  });
}

async function updateCache() {
  console.log('[Service Worker] Aggiornamento cache periodico');
  
  try {
    // Update static cache
    const cache = await caches.open(STATIC_CACHE);
    const requests = await cache.keys();
    
    const updatePromises = requests.map(async request => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          await cache.put(request, response);
        }
      } catch (error) {
        console.warn(`[Service Worker] Errore aggiornamento ${request.url}:`, error);
      }
    });
    
    await Promise.all(updatePromises);
    console.log('[Service Worker] Cache aggiornata');
  } catch (error) {
    console.error('[Service Worker] Errore aggiornamento cache:', error);
  }
}

// Error handling
self.addEventListener('error', event => {
  console.error('[Service Worker] Errore:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[Service Worker] Promise non gestita:', event.reason);
});