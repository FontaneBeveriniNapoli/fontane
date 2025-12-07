const CACHE_NAME = 'fontane-beverini-v2.0.3';
const STATIC_CACHE = 'static-v3';
const DYNAMIC_CACHE = 'dynamic-v3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './analytics.js',
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

// Install Service Worker - VERSIONE MIGLIORATA PER GESTIRE ASSET ASSENTI
self.addEventListener('install', event => {
  console.log('[Service Worker] Installazione in corso...');
  
  // Salta l'attesa immediatamente per attivazione più rapida
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[Service Worker] Cache asset statici');
        
        // Crea un array di promesse per il caching
        const cachePromises = STATIC_ASSETS.map(url => {
          return fetch(url, { 
            mode: 'no-cors',
            credentials: 'omit'
          })
          .then(response => {
            // Verifica se la risposta è valida
            if (response && (response.ok || response.type === 'opaque')) {
              return cache.put(url, response);
            }
            console.warn(`[Service Worker] Asset non trovato o non valido: ${url}`);
            return Promise.resolve();
          })
          .catch(error => {
            console.warn(`[Service Worker] Errore caching ${url}:`, error.message);
            // Non bloccare l'installazione per errori di singoli asset
            return Promise.resolve();
          });
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('[Service Worker] Installazione completata');
        // Pre-cache anche alcuni asset esterni importanti
        return preCacheExternalAssets();
      })
      .catch(error => {
        console.error('[Service Worker] Errore durante installazione:', error);
        // Salta comunque l'attesa anche in caso di errore
        return self.skipWaiting();
      })
  );
});

// Funzione per pre-cache asset esterni importanti
async function preCacheExternalAssets() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const externalPromises = EXTERNAL_ASSETS.slice(0, 3).map(url => {
      return fetch(url, { mode: 'cors' })
        .then(response => {
          if (response.ok) {
            return cache.put(url, response);
          }
          return Promise.resolve();
        })
        .catch(() => Promise.resolve());
    });
    
    await Promise.all(externalPromises);
    console.log('[Service Worker] Pre-cache esterni completato');
  } catch (error) {
    console.warn('[Service Worker] Errore pre-cache esterni:', error);
  }
}

// Activate Service Worker
self.addEventListener('activate', event => {
  console.log('[Service Worker] Attivazione...');
  
  event.waitUntil(
    Promise.all([
      // Pulisci vecchie cache
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('[Service Worker] Cancellazione vecchia cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Prendi il controllo immediato di tutti i client
      self.clients.claim(),
      // Aggiungi gestione per PWA standalone
      handlePWAStandaloneMode()
    ])
    .then(() => {
      console.log('[Service Worker] Attivazione completata');
      // Invia notifica a tutti i client che SW è attivo
      notifyClientsAboutActivation();
    })
    .catch(error => {
      console.error('[Service Worker] Errore durante attivazione:', error);
    })
  );
});

// Notifica a tutti i client che il Service Worker è attivo
async function notifyClientsAboutActivation() {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SERVICE_WORKER_ACTIVATED',
        version: '2.0.3',
        timestamp: new Date().toISOString()
      });
    });
  } catch (error) {
    console.warn('[Service Worker] Errore notifica attivazione:', error);
  }
}

// Gestione speciale per modalità PWA standalone
async function handlePWAStandaloneMode() {
  try {
    const clients = await self.clients.matchAll();
    const isStandalone = clients.some(client => 
      client.url.includes('?standalone=true') || 
      new URL(client.url).searchParams.get('standalone') === 'true'
    );
    
    if (isStandalone) {
      console.log('[Service Worker] Modalità PWA standalone rilevata');
      // Potremmo fare ottimizzazioni specifiche per standalone
    }
  } catch (error) {
    console.warn('[Service Worker] Errore rilevamento modalità standalone:', error);
  }
}

// Fetch Strategy: Cache First with Network Fallback - VERSIONE MIGLIORATA
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  const requestUrl = event.request.url;
  
  // Gestione speciale per le risorse di Firebase e API esterne
  if (requestUrl.includes('firebase') ||
      requestUrl.includes('nominatim') ||
      requestUrl.includes('gstatic.com') ||
      requestUrl.includes('googleapis.com') ||
      requestUrl.includes('/analytics/') ||
      requestUrl.includes('/firestore/') ||
      requestUrl.includes('/__/') ||
      url.protocol === 'chrome-extension:') {
    // Per queste richieste, usa solo la rete
    return fetch(event.request);
  }
  
  // Special handling for OSM tiles - Cache con aggiornamento in background
  if (requestUrl.includes('tile.openstreetmap.org') || 
      requestUrl.includes('cdn.rawgit.com') ||
      requestUrl.includes('unpkg.com')) {
    event.respondWith(
      handleOSMTiles(event)
    );
    return;
  }
  
  // Gestione speciale per la homepage e altre pagine HTML
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      handleHTMLRequest(event)
    );
    return;
  }
  
  // Gestione standard per altre risorse
  event.respondWith(
    handleStandardRequest(event)
  );
});

// Gestione richieste HTML (pagine)
async function handleHTMLRequest(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(event.request);
  
  // Se abbiamo una versione in cache, usala mentre aggiorniamo in background
  if (cachedResponse) {
    // Aggiorna in background
    event.waitUntil(
      updateCacheInBackground(event.request, cache)
    );
    return cachedResponse;
  }
  
  // Altrimenti, prova a recuperare dalla rete
  try {
    const networkResponse = await fetch(event.request);
    
    // Se la risposta è valida, mettila in cache
    if (networkResponse.ok) {
      const clone = networkResponse.clone();
      cache.put(event.request, clone);
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[Service Worker] Errore fetch HTML:', error);
    
    // Fallback: se stiamo cercando la homepage, usa index.html dalla cache
    if (event.request.url.includes('index.html') || 
        event.request.url.endsWith('/')) {
      const fallback = await cache.match('./index.html');
      if (fallback) return fallback;
    }
    
    // Fallback generico offline
    return new Response(
      `<html>
        <head>
          <title>Modalità Offline - ABC Napoli F&B</title>
          <style>
            body { font-family: sans-serif; padding: 20px; text-align: center; }
            h1 { color: #3b82f6; }
            .retry-btn { 
              background: #3b82f6; color: white; border: none; 
              padding: 10px 20px; border-radius: 5px; cursor: pointer; 
              margin-top: 20px; 
            }
          </style>
        </head>
        <body>
          <h1>📡 Connessione assente</h1>
          <p>L'app è in modalità offline. Riprova quando la connessione sarà disponibile.</p>
          <button class="retry-btn" onclick="window.location.reload()">Riprova</button>
        </body>
      </html>`,
      {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}

// Gestione standard per CSS, JS, immagini
async function handleStandardRequest(event) {
  try {
    // Prima cerca nella cache statica
    const staticCache = await caches.open(STATIC_CACHE);
    const cachedStatic = await staticCache.match(event.request);
    if (cachedStatic) return cachedStatic;
    
    // Poi nella cache dinamica
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const cachedDynamic = await dynamicCache.match(event.request);
    if (cachedDynamic) {
      // Aggiorna in background se online
      if (navigator.onLine) {
        event.waitUntil(
          updateCacheInBackground(event.request, dynamicCache)
        );
      }
      return cachedDynamic;
    }
    
    // Altrimenti, fetch dalla rete
    const networkResponse = await fetch(event.request);
    
    // Cache la risposta se valida
    if (networkResponse.ok) {
      const clone = networkResponse.clone();
      dynamicCache.put(event.request, clone);
    }
    
    return networkResponse;
  } catch (error) {
    console.warn('[Service Worker] Errore fetch standard:', error);
    
    // Fallback per immagini
    if (event.request.destination === 'image') {
      const cache = await caches.open(STATIC_CACHE);
      const fallbackImage = await cache.match('./images/sfondo-home.jpg');
      if (fallbackImage) return fallbackImage;
    }
    
    // Fallback per CSS
    if (event.request.destination === 'style') {
      return new Response('/* Offline placeholder CSS */', {
        headers: { 'Content-Type': 'text/css' }
      });
    }
    
    // Fallback per JS
    if (event.request.destination === 'script') {
      return new Response('// Offline placeholder JS', {
        headers: { 'Content-Type': 'application/javascript' }
      });
    }
    
    // Fallback generico
    return new Response('Risorsa non disponibile in modalità offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

// Gestione speciale per tile OSM
async function handleOSMTiles(event) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(event.request);
  
  // Se in cache, restituisci e aggiorna in background
  if (cachedResponse) {
    event.waitUntil(
      updateCacheInBackground(event.request, cache)
    );
    return cachedResponse;
  }
  
  // Altrimenti, fetch dalla rete
  try {
    const networkResponse = await fetch(event.request);
    if (networkResponse.ok) {
      const clone = networkResponse.clone();
      cache.put(event.request, clone);
    }
    return networkResponse;
  } catch (error) {
    console.warn('[Service Worker] Errore fetch tile OSM:', error);
    
    // Fallback: tile vuota
    return new Response('', {
      status: 404,
      headers: { 'Content-Type': 'image/png' }
    });
  }
}

// Aggiorna cache in background
async function updateCacheInBackground(request, cache) {
  if (!navigator.onLine) return;
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response);
    }
  } catch (error) {
    // Ignora errori di aggiornamento in background
    console.debug('[Service Worker] Aggiornamento background fallito:', error.message);
  }
}

// Background Sync for offline data - VERSIONE MIGLIORATA
self.addEventListener('sync', event => {
  console.log('[Service Worker] Sync event:', event.tag);
  
  if (event.tag === 'sync-analytics') {
    event.waitUntil(
      syncAnalyticsData().catch(error => {
        console.error('[Service Worker] Sync analytics error:', error);
        // Registra l'errore ma non fallisce
        return logSyncError(error);
      })
    );
  }
  
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      syncOfflineData().catch(error => {
        console.error('[Service Worker] Sync offline data error:', error);
        return logSyncError(error);
      })
    );
  }
});

// Sincronizza dati analytics offline
async function syncAnalyticsData() {
  console.log('[Service Worker] Tentativo sincronizzazione analytics...');
  
  try {
    const clients = await self.clients.matchAll();
    if (clients.length === 0) {
      console.log('[Service Worker] Nessun client attivo per sync analytics');
      return;
    }
    
    // Invia messaggio a tutti i client
    await Promise.all(clients.map(client => {
      return client.postMessage({
        type: 'SYNC_ANALYTICS_DATA',
        timestamp: new Date().toISOString(),
        retryCount: 0
      });
    }));
    
    console.log('[Service Worker] Sync analytics avviato per', clients.length, 'client(s)');
  } catch (error) {
    console.error('[Service Worker] Errore sync analytics:', error);
    throw error;
  }
}

// Sincronizza dati offline generici
async function syncOfflineData() {
  console.log('[Service Worker] Tentativo sincronizzazione dati offline...');
  
  try {
    const clients = await self.clients.matchAll();
    if (clients.length === 0) {
      console.log('[Service Worker] Nessun client attivo per sync dati');
      return;
    }
    
    await Promise.all(clients.map(client => {
      return client.postMessage({
        type: 'SYNC_OFFLINE_DATA',
        timestamp: new Date().toISOString(),
        force: true
      });
    }));
    
    console.log('[Service Worker] Sync dati avviato per', clients.length, 'client(s)');
  } catch (error) {
    console.error('[Service Worker] Errore sync dati:', error);
    throw error;
  }
}

// Registra errori di sync
async function logSyncError(error) {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    const errorData = {
      type: 'SYNC_ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
    
    // Potremmo salvare gli errori per debug
    const response = new Response(JSON.stringify(errorData), {
      headers: { 'Content-Type': 'application/json' }
    });
    
    await cache.put('/sync-errors/' + Date.now(), response);
  } catch (cacheError) {
    console.error('[Service Worker] Errore logging sync error:', cacheError);
  }
}

// Handle messages from the app - VERSIONE ESPANSA
self.addEventListener('message', event => {
  console.log('[Service Worker] Messaggio ricevuto:', event.data?.type);
  
  const { data, ports } = event;
  
  // Pulizia cache
  if (data.type === 'CLEAR_CACHE') {
    handleClearCache(data, ports);
  }
  
  // Informazioni cache
  else if (data.type === 'GET_CACHE_INFO') {
    handleGetCacheInfo(data, ports);
  }
  
  // Pre-cache risorse
  else if (data.type === 'PRE_CACHE') {
    handlePreCache(data, ports);
  }
  
  // Controllo aggiornamenti
  else if (data.type === 'CHECK_UPDATE') {
    handleCheckUpdate(data, ports);
  }
  
  // Verifica stato SW
  else if (data.type === 'PING') {
    handlePing(data, ports);
  }
  
  // Ottimizzazione cache
  else if (data.type === 'OPTIMIZE_CACHE') {
    handleOptimizeCache(data, ports);
  }
  
  // Gestione spazio storage
  else if (data.type === 'CLEANUP_STORAGE') {
    handleCleanupStorage(data, ports);
  }
});

// Gestione pulizia cache
async function handleClearCache(data, ports) {
  try {
    const cacheNames = await caches.keys();
    const deletions = cacheNames.map(name => caches.delete(name));
    
    await Promise.all(deletions);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: true, 
        message: 'Cache pulita completamente',
        deleted: cacheNames.length
      });
    }
    
    console.log('[Service Worker] Cache pulita:', cacheNames.length, 'cache eliminate');
  } catch (error) {
    console.error('[Service Worker] Errore pulizia cache:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: false, 
        error: error.message 
      });
    }
  }
}

// Gestione informazioni cache
async function handleGetCacheInfo(data, ports) {
  try {
    const cacheNames = await caches.keys();
    const cacheInfo = [];
    
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const requests = await cache.keys();
      cacheInfo.push({
        name: name,
        size: requests.length,
        items: requests.map(req => req.url)
      });
    }
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        caches: cacheInfo,
        totalCaches: cacheInfo.length
      });
    }
  } catch (error) {
    console.error('[Service Worker] Errore info cache:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ error: error.message });
    }
  }
}

// Gestione pre-cache
async function handlePreCache(data, ports) {
  try {
    const { urls, cacheName = DYNAMIC_CACHE } = data;
    const cache = await caches.open(cacheName);
    
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
    
    await Promise.all(cachePromises);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: true,
        cached: cachePromises.length
      });
    }
  } catch (error) {
    console.error('[Service Worker] Errore pre-cache:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: false, 
        error: error.message 
      });
    }
  }
}

// Gestione controllo aggiornamenti
async function handleCheckUpdate(data, ports) {
  try {
    await self.registration.update();
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        updateAvailable: true,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.warn('[Service Worker] Errore controllo aggiornamenti:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        updateAvailable: false, 
        error: error.message 
      });
    }
  }
}

// Gestione ping
async function handlePing(data, ports) {
  if (ports && ports[0]) {
    ports[0].postMessage({ 
      pong: true,
      version: '2.0.3',
      timestamp: new Date().toISOString(),
      scope: self.registration.scope
    });
  }
}

// Ottimizzazione cache
async function handleOptimizeCache(data, ports) {
  try {
    const { maxAge = 7 * 24 * 60 * 60 * 1000 } = data; // Default 7 giorni
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    const now = Date.now();
    const cleanupPromises = requests.map(async request => {
      const response = await cache.match(request);
      if (!response) return;
      
      const dateHeader = response.headers.get('date');
      if (!dateHeader) return;
      
      const responseDate = new Date(dateHeader).getTime();
      if (now - responseDate > maxAge) {
        await cache.delete(request);
        return true;
      }
      return false;
    });
    
    const results = await Promise.all(cleanupPromises);
    const deleted = results.filter(Boolean).length;
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: true,
        optimized: true,
        deleted: deleted,
        remaining: requests.length - deleted
      });
    }
    
    console.log('[Service Worker] Cache ottimizzata:', deleted, 'elementi rimossi');
  } catch (error) {
    console.error('[Service Worker] Errore ottimizzazione cache:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: false, 
        error: error.message 
      });
    }
  }
}

// Pulizia storage
async function handleCleanupStorage(data, ports) {
  try {
    const { maxSizeMB = 50 } = data;
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    const cache = await caches.open(DYNAMIC_CACHE);
    const requests = await cache.keys();
    
    // Stima dimensione (approssimativa)
    let totalSize = 0;
    const items = [];
    
    for (const request of requests) {
      const response = await cache.match(request);
      if (!response) continue;
      
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength) : 1024; // Default 1KB
      
      items.push({
        request,
        response,
        size,
        timestamp: new Date(response.headers.get('date') || Date.now()).getTime()
      });
      
      totalSize += size;
    }
    
    // Ordina per timestamp (più vecchi prima)
    items.sort((a, b) => a.timestamp - b.timestamp);
    
    // Rimuovi elementi più vecchi se superiamo la dimensione massima
    let deleted = 0;
    while (totalSize > maxSizeBytes && items.length > 0) {
      const item = items.shift();
      await cache.delete(item.request);
      totalSize -= item.size;
      deleted++;
    }
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: true,
        cleaned: true,
        deleted: deleted,
        remainingSizeMB: Math.round(totalSize / (1024 * 1024)),
        remainingItems: items.length
      });
    }
    
    console.log('[Service Worker] Storage pulito:', deleted, 'elementi rimossi');
  } catch (error) {
    console.error('[Service Worker] Errore pulizia storage:', error);
    
    if (ports && ports[0]) {
      ports[0].postMessage({ 
        success: false, 
        error: error.message 
      });
    }
  }
}

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
      icon: './images/icona-avvio-144.png',
      badge: './images/favicon-32x32.png',
      tag: 'fontane-notification'
    };
  }
  
  const options = {
    body: notificationData.body || 'Notifica',
    icon: notificationData.icon || './images/icona-avvio-144.png',
    badge: notificationData.badge || './images/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      url: notificationData.url || './',
      timestamp: new Date().toISOString(),
      tag: notificationData.tag || 'default'
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
    ],
    tag: notificationData.tag || 'fontane-notification',
    renotify: true,
    requireInteraction: false
  };
  
  event.waitUntil(
    self.registration.showNotification(
      notificationData.title || 'Fontane & Beverini Napoli',
      options
    ).then(() => {
      console.log('[Service Worker] Notifica mostrata con successo');
    }).catch(error => {
      console.error('[Service Worker] Errore mostra notifica:', error);
    })
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
      const urlToOpen = event.notification.data.url || './';
      
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    }).catch(error => {
      console.error('[Service Worker] Errore gestione click notifica:', error);
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('[Service Worker] Notifica chiusa:', event.notification.tag);
});

// Periodic sync for background updates (if supported)
if ('periodicSync' in self.registration) {
  self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-cache') {
      console.log('[Service Worker] Periodic sync per aggiornamento cache');
      event.waitUntil(
        updateCache().catch(error => {
          console.error('[Service Worker] Errore periodic sync:', error);
        })
      );
    }
  });
}

// Aggiornamento cache periodico
async function updateCache() {
  console.log('[Service Worker] Aggiornamento cache periodico in corso...');
  
  try {
    // Aggiorna cache statica
    const staticCache = await caches.open(STATIC_CACHE);
    const staticRequests = await staticCache.keys();
    
    const staticPromises = staticRequests.map(async request => {
      try {
        // Skip external URLs in static cache
        if (!request.url.startsWith(self.registration.scope)) {
          return;
        }
        
        const response = await fetch(request, { cache: 'reload' });
        if (response.ok) {
          await staticCache.put(request, response);
        }
      } catch (error) {
        console.debug(`[Service Worker] Skip aggiornamento ${request.url}:`, error.message);
      }
    });
    
    await Promise.all(staticPromises);
    console.log('[Service Worker] Cache statica aggiornata');
    
    // Aggiorna alcune risorse dinamiche importanti
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const importantUrls = [
      './app.js',
      './style.css',
      './analytics.js'
    ];
    
    const dynamicPromises = importantUrls.map(async url => {
      try {
        const fullUrl = new URL(url, self.registration.scope).href;
        const response = await fetch(fullUrl, { cache: 'reload' });
        if (response.ok) {
          await dynamicCache.put(fullUrl, response);
        }
      } catch (error) {
        console.debug(`[Service Worker] Skip aggiornamento ${url}:`, error.message);
      }
    });
    
    await Promise.all(dynamicPromises);
    console.log('[Service Worker] Cache dinamica aggiornata');
    
  } catch (error) {
    console.error('[Service Worker] Errore aggiornamento cache periodico:', error);
    throw error;
  }
}

// Error handling globale
self.addEventListener('error', event => {
  console.error('[Service Worker] Errore globale:', event.error);
});

self.addEventListener('unhandledrejection', event => {
  console.error('[Service Worker] Promise non gestita:', event.reason);
});

// Intercept per gestire caricamenti lenti
self.addEventListener('fetch', event => {
  // Solo per risorse locali importanti
  if (event.request.url.startsWith(self.registration.scope)) {
    const url = new URL(event.request.url);
    
    // Per risorse critiche, aggiungi timeout
    if (url.pathname.includes('.js') || url.pathname.includes('.css')) {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout fetch')), 10000);
      });
      
      event.respondWith(
        Promise.race([
          fetch(event.request),
          timeoutPromise
        ]).catch(error => {
          console.warn('[Service Worker] Timeout o errore fetch:', error.message);
          
          // Fallback alla cache
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            
            // Fallback generico
            if (url.pathname.includes('.js')) {
              return new Response('console.log("Risorsa temporaneamente non disponibile");', {
                headers: { 'Content-Type': 'application/javascript' }
              });
            }
            
            if (url.pathname.includes('.css')) {
              return new Response('/* CSS temporaneamente non disponibile */', {
                headers: { 'Content-Type': 'text/css' }
              });
            }
            
            throw error;
          });
        })
      );
    }
  }
});

// Funzione di utilità per verificare connessione
async function checkNetworkStatus() {
  try {
    const response = await fetch('./?ping=' + Date.now(), {
      method: 'HEAD',
      cache: 'no-store'
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Gestione cambio stato connessione
let isOnline = navigator.onLine;
self.addEventListener('online', () => {
  isOnline = true;
  console.log('[Service Worker] Connessione ripristinata');
  
  // Notifica i client
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: true,
        timestamp: new Date().toISOString()
      });
    });
  });
});

self.addEventListener('offline', () => {
  isOnline = false;
  console.log('[Service Worker] Connessione persa');
  
  // Notifica i client
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: false,
        timestamp: new Date().toISOString()
      });
    });
  });
});