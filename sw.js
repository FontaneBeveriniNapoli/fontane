const CACHE_NAME = 'fontane-beverini-v1.0';
const STATIC_CACHE = 'static-cache-v1';
const DYNAMIC_CACHE = 'dynamic-cache-v1';

const STATIC_ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './images/icona-avvio-192.png',
    './images/icona-avvio-512.png',
    './images/icona-avvio-splash.png',
    './images/sfondo-home.jpg',
    './images/logo-app.png',
    './images/logo-comune.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png'
];

// Install Event
self.addEventListener('install', event => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Event
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', event => {
    // Skip Firebase requests and OSM tiles
    if (event.request.url.includes('firebase') || 
        event.request.url.includes('openstreetmap') ||
        event.request.url.includes('nominatim')) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Return cached version if available
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Otherwise fetch from network
                return fetch(event.request)
                    .then(response => {
                        // Check if we received a valid response
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        // Cache dynamic content
                        caches.open(DYNAMIC_CACHE)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return response;
                    })
                    .catch(() => {
                        // If network fails, try to serve offline page
                        if (event.request.url.includes('.html')) {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// Sync Event for background sync
self.addEventListener('sync', event => {
    if (event.tag === 'sync-data') {
        console.log('Background sync triggered');
        event.waitUntil(syncData());
    }
});

// Periodic Sync for background updates
self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-data') {
        console.log('Periodic sync triggered');
        event.waitUntil(updateData());
    }
});

// Background sync function
async function syncData() {
    console.log('Syncing data in background...');
    // Implement background sync logic here
}

// Periodic update function
async function updateData() {
    console.log('Updating data periodically...');
    // Implement periodic update logic here
}

// Push Notification Event
self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'Nuova notifica dalle Fontane di Napoli',
        icon: './images/icona-avvio-192.png',
        badge: './images/icona-avvio-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 'fontane-notification'
        },
        actions: [
            {
                action: 'explore',
                title: 'Esplora',
                icon: './images/icona-avvio-192.png'
            },
            {
                action: 'close',
                title: 'Chiudi',
                icon: './images/icona-avvio-192.png'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Fontane & Beverini Napoli', options)
    );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
    console.log('Notification click received.');
    
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // Check if there's already a window/tab open with the target URL
                for (const client of clientList) {
                    if (client.url.includes('/index.html') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If not, open a new window/tab
                if (clients.openWindow) {
                    return clients.openWindow('./index.html');
                }
            })
    );
});