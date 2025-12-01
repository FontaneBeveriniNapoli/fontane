const CACHE_NAME = 'fontane-beverini-v1.0';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './images/icona-avvio-192.png',
    './images/icona-avvio-512.png',
    './images/icona-avvio-splash.png',
    './images/logo-app.png',
    './images/logo-comune.png',
    './images/sfondo-home.jpg',
    './images/fontana-cariati.jpg',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Installazione del Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache aperta');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// Attivazione del Service Worker
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
        }).then(() => self.clients.claim())
    );
});

// Intercettazione delle richieste
self.addEventListener('fetch', event => {
    // Escludi le richieste a Firebase e Google Sheets
    if (event.request.url.includes('firebase') || 
        event.request.url.includes('googleapis') ||
        event.request.url.includes('google.com') ||
        event.request.url.includes('gstatic.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Cache hit - ritorna la risposta dalla cache
                if (response) {
                    return response;
                }

                // Clone della richiesta perché è un stream e può essere consumato una sola volta
                const fetchRequest = event.request.clone();

                return fetch(fetchRequest)
                    .then(response => {
                        // Controlla se abbiamo ricevuto una risposta valida
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // Clone della risposta perché è un stream e può essere consumato una sola volta
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // Fallback per le immagini
                        if (event.request.destination === 'image') {
                            return caches.match('./images/sfondo-home.jpg');
                        }
                        
                        // Fallback per le pagine HTML
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// Gestione delle notifiche push (se necessario in futuro)
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: './images/icona-avvio-192.png',
        badge: './images/icona-avvio-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        }
    };

    event.waitUntil(
        self.registration.showNotification('Fontane & Beverini Napoli', options)
    );
});

// Gestione dei click sulle notifiche
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url === '/' && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});