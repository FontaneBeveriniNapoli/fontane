// Analytics Manager
class AnalyticsManager {
    constructor() {
        this.isInitialized = false;
        this.queue = [];
        this.config = {
            trackingEnabled: true,
            sessionTimeout: 30 * 60 * 1000,
            batchSize: 10,
            flushInterval: 10000
        };
        
        this.session = {
            id: this.generateSessionId(),
            startTime: Date.now(),
            pageViews: 0,
            events: 0,
            lastActivity: Date.now()
        };
        
        this.user = {
            id: this.getUserId(),
            device: this.getDeviceInfo(),
            preferences: {}
        };
        
        // Performance metrics
        this.metrics = {
            appStart: Date.now(),
            pageLoadTimes: [],
            imageLoadTimes: [],
            dataFetchTimes: []
        };
        
        // Initialize Service Worker for analytics
        this.initializeServiceWorkerSupport();
    }
    
    async initializeServiceWorkerSupport() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.ready;
                console.log('[Analytics] Service Worker pronto');
                
                // Send analytics config to Service Worker
                if (registration.active) {
                    registration.active.postMessage({
                        type: 'ANALYTICS_CONFIG',
                        config: {
                            enabled: this.config.trackingEnabled,
                            sessionId: this.session.id,
                            userId: this.user.id
                        }
                    });
                }
                
            } catch (error) {
                console.warn('[Analytics] Service Worker non disponibile:', error);
            }
        }
    }
    
    async initialize() {
        if (this.isInitialized) return;
        
        try {
            await this.initializeFirebaseAnalytics();
            await this.loadSavedData();
            this.startAutoFlush();
            this.trackSessionStart();
            this.setupEventListeners();
            
            this.isInitialized = true;
            console.log('[Analytics] Inizializzato con successo');
        } catch (error) {
            console.error('[Analytics] Errore inizializzazione:', error);
        }
    }
    
    async initializeFirebaseAnalytics() {
        if (typeof firebase !== 'undefined' && window.firebaseAnalytics) {
            console.log('[Analytics] Firebase Analytics già disponibile');
            return window.firebaseAnalytics;
        }
        
        try {
            const { getAnalytics, logEvent } = await import(
                "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js"
            );
            
            if (window.app) {
                window.firebaseAnalytics = getAnalytics(window.app);
                console.log('[Analytics] Firebase Analytics inizializzato');
                
                // Traccia prima pagina
                this.sendToFirebaseAnalytics({
                    type: 'APP_START',
                    timestamp: Date.now(),
                    session_id: this.session.id,
                    user_id: this.user.id,
                    device: this.user.device
                });
                
                return window.firebaseAnalytics;
            }
        } catch (error) {
            console.warn('[Analytics] Firebase Analytics non disponibile:', error);
        }
        
        return null;
    }
    
    trackEvent(category, action, label = null, value = null, customParams = {}) {
        if (!this.config.trackingEnabled) return;
        
        const event = {
            type: 'EVENT',
            timestamp: Date.now(),
            category,
            action,
            label,
            value,
            session_id: this.session.id,
            user_id: this.user.id,
            ...customParams
        };
        
        this.queue.push(event);
        this.session.events++;
        
        // Invia a Firebase Analytics
        this.sendToFirebaseAnalytics(event);
        
        // Gestione coda locale
        if (this.queue.length >= this.config.batchSize) {
            this.flushQueue();
        }
        
        // Log attività locale
        this.logActivity(`Evento: ${category}.${action}`, event);
        
        return event;
    }
    
    trackPageView(pageName, customParams = {}) {
        if (!this.config.trackingEnabled) return;
        
        const pageView = {
            type: 'PAGE_VIEW',
            timestamp: Date.now(),
            page: pageName,
            session_id: this.session.id,
            user_id: this.user.id,
            page_views: ++this.session.pageViews,
            ...customParams
        };
        
        this.queue.push(pageView);
        
        // Invia a Firebase Analytics
        this.sendToFirebaseAnalytics(pageView);
        
        this.session.lastActivity = Date.now();
        this.logActivity(`Pagina vista: ${pageName}`, pageView);
        
        return pageView;
    }
    
    trackError(error, context, severity = 'medium', customParams = {}) {
        const errorEvent = {
            type: 'ERROR',
            timestamp: Date.now(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error.code
            },
            context,
            severity,
            session_id: this.session.id,
            user_id: this.user.id,
            ...customParams
        };
        
        this.queue.push(errorEvent);
        
        // Invia a Firebase Analytics
        this.sendToFirebaseAnalytics(errorEvent);
        
        this.logActivity(`Errore: ${context} - ${error.message}`, errorEvent);
        
        return errorEvent;
    }
    
    trackPerformance(name, duration, customParams = {}) {
        const perfEvent = {
            type: 'PERFORMANCE',
            timestamp: Date.now(),
            metric_name: name,
            duration: duration,
            session_id: this.session.id,
            user_id: this.user.id,
            ...customParams
        };
        
        this.queue.push(perfEvent);
        
        // Salva in metrics
        if (name.includes('page_load')) {
            this.metrics.pageLoadTimes.push(duration);
        } else if (name.includes('image')) {
            this.metrics.imageLoadTimes.push(duration);
        } else if (name.includes('data')) {
            this.metrics.dataFetchTimes.push(duration);
        }
        
        this.logActivity(`Performance: ${name} - ${duration}ms`, perfEvent);
        
        return perfEvent;
    }
    
    async sendToFirebaseAnalytics(eventData) {
        if (!window.firebaseAnalytics) return;
        
        try {
            const { logEvent } = await import(
                "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js"
            );
            
            switch(eventData.type) {
                case 'PAGE_VIEW':
                    logEvent(window.firebaseAnalytics, 'page_view', {
                        page_title: eventData.page,
                        page_location: window.location.href,
                        page_path: window.location.pathname,
                        session_id: eventData.session_id,
                        user_id: eventData.user_id
                    });
                    break;
                    
                case 'EVENT':
                    logEvent(window.firebaseAnalytics, eventData.action, {
                        event_category: eventData.category,
                        event_label: eventData.label,
                        value: eventData.value,
                        session_id: eventData.session_id,
                        user_id: eventData.user_id,
                        ...eventData.customParams
                    });
                    break;
                    
                case 'ERROR':
                    logEvent(window.firebaseAnalytics, 'error_occurred', {
                        error_name: eventData.error?.name || 'Unknown',
                        error_message: eventData.error?.message?.substring(0, 100) || 'Unknown error',
                        error_context: eventData.context,
                        error_severity: eventData.severity,
                        session_id: eventData.session_id,
                        user_id: eventData.user_id
                    });
                    break;
                    
                case 'PERFORMANCE':
                    logEvent(window.firebaseAnalytics, 'performance_metric', {
                        metric_name: eventData.metric_name,
                        metric_duration: eventData.duration,
                        session_id: eventData.session_id,
                        user_id: eventData.user_id
                    });
                    break;
                    
                case 'SESSION_START':
                    logEvent(window.firebaseAnalytics, 'session_start', {
                        session_id: eventData.session_id,
                        user_id: eventData.user_id,
                        device_platform: eventData.device?.platform,
                        device_online: eventData.device?.online,
                        app_version: '2.0.0'
                    });
                    break;
                    
                case 'APP_START':
                    logEvent(window.firebaseAnalytics, 'app_start', {
                        session_id: eventData.session_id,
                        user_id: eventData.user_id,
                        device_type: eventData.device?.userAgent?.includes('Mobile') ? 'mobile' : 'desktop',
                        pwa_mode: window.matchMedia('(display-mode: standalone)').matches
                    });
                    break;
            }
        } catch (error) {
            console.warn('[Analytics] Errore invio a Firebase:', error);
        }
    }
    
    trackSessionStart() {
        const sessionEvent = {
            type: 'SESSION_START',
            timestamp: Date.now(),
            session_id: this.session.id,
            user_id: this.user.id,
            device: this.user.device,
            app_version: '2.0.0'
        };
        
        this.queue.push(sessionEvent);
        this.sendToFirebaseAnalytics(sessionEvent);
        
        this.logActivity('Sessione iniziata', sessionEvent);
    }
    
    trackSessionEnd() {
        const sessionDuration = Date.now() - this.session.startTime;
        const sessionEvent = {
            type: 'SESSION_END',
            timestamp: Date.now(),
            session_id: this.session.id,
            user_id: this.user.id,
            duration: sessionDuration,
            page_views: this.session.pageViews,
            events: this.session.events
        };
        
        this.queue.push(sessionEvent);
        this.sendToFirebaseAnalytics(sessionEvent);
        
        // Genera nuova sessione
        this.session = {
            id: this.generateSessionId(),
            startTime: Date.now(),
            pageViews: 0,
            events: 0,
            lastActivity: Date.now()
        };
        
        this.logActivity('Sessione terminata', sessionEvent);
    }
    
    async flushQueue(force = false) {
        if (this.queue.length === 0) return;
        
        if (!force && this.queue.length < this.config.batchSize) {
            return;
        }
        
        const eventsToSend = [...this.queue];
        this.queue = [];
        
        try {
            // Salva localmente
            this.saveEventsLocally(eventsToSend);
            
            // Invia a Firestore (se online)
            if (navigator.onLine && window.db) {
                await this.sendToFirestore(eventsToSend);
                this.cleanupOldLocalEvents();
            } else {
                this.saveForLater(eventsToSend);
            }
        } catch (error) {
            console.error('[Analytics] Errore flush queue:', error);
            this.queue.unshift(...eventsToSend);
            this.saveForLater(eventsToSend);
        }
    }
    
    async sendToFirestore(events) {
        try {
            const { collection, addDoc } = await import(
                "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js"
            );
            
            const batchData = {
                events: events,
                sent_at: new Date().toISOString(),
                session_id: this.session.id,
                user_id: this.user.id,
                device: this.user.device,
                source: 'analytics_js'
            };
            
            const analyticsRef = collection(window.db, 'analytics');
            await addDoc(analyticsRef, batchData);
            
            localStorage.setItem('analytics_last_sync', new Date().toISOString());
            console.log(`[Analytics] ${events.length} eventi inviati a Firestore`);
        } catch (error) {
            console.error('[Analytics] Errore invio a Firestore:', error);
            throw error;
        }
    }
    
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    getUserId() {
        let userId = localStorage.getItem('analytics_user_id');
        if (!userId) {
            userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('analytics_user_id', userId);
        }
        return userId;
    }
    
    getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screen: {
                width: window.screen.width,
                height: window.screen.height,
                colorDepth: window.screen.colorDepth
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            online: navigator.onLine,
            pwa: window.matchMedia('(display-mode: standalone)').matches,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }
    
    startAutoFlush() {
        setInterval(() => {
            this.flushQueue();
        }, this.config.flushInterval);
        
        setTimeout(() => {
            this.sendPendingEvents();
        }, 5000);
    }
    
    saveEventsLocally(events) {
        try {
            const localEvents = JSON.parse(localStorage.getItem('analytics_events') || '[]');
            localEvents.push(...events);
            
            if (localEvents.length > 1000) {
                localEvents.splice(0, localEvents.length - 1000);
            }
            
            localStorage.setItem('analytics_events', JSON.stringify(localEvents));
        } catch (error) {
            console.error('[Analytics] Errore salvataggio locale:', error);
        }
    }
    
    saveForLater(events) {
        try {
            const pendingEvents = JSON.parse(localStorage.getItem('analytics_pending') || '[]');
            pendingEvents.push(...events);
            localStorage.setItem('analytics_pending', JSON.stringify(pendingEvents));
        } catch (error) {
            console.error('[Analytics] Errore salvataggio pending:', error);
        }
    }
    
    async sendPendingEvents() {
        try {
            const pendingEvents = JSON.parse(localStorage.getItem('analytics_pending') || '[]');
            
            if (pendingEvents.length === 0) return;
            
            if (navigator.onLine && window.db) {
                await this.sendToFirestore(pendingEvents);
                localStorage.removeItem('analytics_pending');
                console.log(`[Analytics] ${pendingEvents.length} eventi pendenti inviati`);
            }
        } catch (error) {
            console.error('[Analytics] Errore invio eventi pendenti:', error);
        }
    }
    
    setupEventListeners() {
        // Monitora inattività sessione
        setInterval(() => {
            const inactiveTime = Date.now() - this.session.lastActivity;
            if (inactiveTime > this.config.sessionTimeout) {
                this.trackSessionEnd();
            }
        }, 60000);
        
        // Session end su visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                setTimeout(() => this.trackSessionEnd(), 1000);
            }
        });
        
        // Rileva connessione
        window.addEventListener('online', () => {
            this.trackEvent('network', 'online', null, null, { timestamp: Date.now() });
            this.sendPendingEvents();
        });
        
        window.addEventListener('offline', () => {
            this.trackEvent('network', 'offline', null, null, { timestamp: Date.now() });
        });
        
        // Performance observer
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    list.getEntries().forEach(entry => {
                        if (entry.entryType === 'navigation') {
                            this.trackPerformance('page_load', entry.duration);
                        } else if (entry.entryType === 'resource' && entry.initiatorType === 'img') {
                            this.trackPerformance('image_load', entry.duration, { 
                                url: entry.name 
                            });
                        }
                    });
                });
                
                observer.observe({ entryTypes: ['navigation', 'resource'] });
            } catch (e) {
                console.warn('[Analytics] PerformanceObserver non disponibile');
            }
        }
    }
    
    logActivity(description, data) {
        try {
            const activity = {
                timestamp: new Date().toISOString(),
                description: description,
                data: data,
                session_id: this.session.id
            };
            
            const activities = JSON.parse(localStorage.getItem('analytics_activities') || '[]');
            activities.unshift(activity);
            
            if (activities.length > 50) {
                activities.splice(50);
            }
            
            localStorage.setItem('analytics_activities', JSON.stringify(activities));
        } catch (error) {
            console.warn('[Analytics] Errore log attività:', error);
        }
    }
    
    getAnalyticsSummary() {
        const today = new Date().toDateString();
        const allEvents = JSON.parse(localStorage.getItem('analytics_events') || '[]');
        const allErrors = JSON.parse(localStorage.getItem('analytics_errors') || '[]');
        
        // Eventi di oggi
        const todayEvents = allEvents.filter(event => 
            new Date(event.timestamp).toDateString() === today
        );
        
        // Sessioni oggi
        const todaySessions = todayEvents.filter(event => event.type === 'SESSION_START');
        
        // Errori oggi
        const todayErrors = allErrors.filter(error => 
            new Date(error.timestamp).toDateString() === today
        );
        
        // Page views oggi
        const pageViews = todayEvents.filter(event => event.type === 'PAGE_VIEW').length;
        
        // Performance media
        const avgPageLoad = this.metrics.pageLoadTimes.length > 0 ? 
            this.metrics.pageLoadTimes.reduce((a, b) => a + b, 0) / this.metrics.pageLoadTimes.length : 0;
        
        const avgImageLoad = this.metrics.imageLoadTimes.length > 0 ? 
            this.metrics.imageLoadTimes.reduce((a, b) => a + b, 0) / this.metrics.imageLoadTimes.length : 0;
        
        return {
            sessions: {
                current: this.session,
                today: todaySessions.length,
                total: allEvents.filter(e => e.type === 'SESSION_START').length
            },
            events: {
                today: todayEvents.length,
                total: allEvents.length,
                queued: this.queue.length
            },
            pageViews: {
                today: pageViews,
                total: allEvents.filter(e => e.type === 'PAGE_VIEW').length,
                session: this.session.pageViews
            },
            errors: {
                today: todayErrors.length,
                total: allErrors.length,
                bySeverity: {
                    high: todayErrors.filter(e => e.severity === 'high').length,
                    medium: todayErrors.filter(e => e.severity === 'medium').length,
                    low: todayErrors.filter(e => e.severity === 'low').length
                }
            },
            metrics: {
                performance: {
                    average: avgPageLoad,
                    imageLoad: avgImageLoad
                },
                storage: {
                    eventsSize: new Blob([JSON.stringify(allEvents)]).size,
                    errorsSize: new Blob([JSON.stringify(allErrors)]).size
                }
            },
            user: {
                id: this.user.id,
                device: this.user.device
            }
        };
    }
    
    exportAnalyticsData() {
        const allData = {
            events: JSON.parse(localStorage.getItem('analytics_events') || '[]'),
            errors: JSON.parse(localStorage.getItem('analytics_errors') || '[]'),
            activities: JSON.parse(localStorage.getItem('analytics_activities') || '[]'),
            performance: this.metrics,
            summary: this.getAnalyticsSummary(),
            config: this.config,
            timestamp: new Date().toISOString(),
            user_id: this.user.id,
            session_id: this.session.id
        };
        
        const dataStr = JSON.stringify(allData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `analytics_export_${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        return exportFileDefaultName;
    }
    
    resetUserData() {
        const userId = this.user.id;
        
        // Reset locale ma mantieni user ID
        localStorage.removeItem('analytics_events');
        localStorage.removeItem('analytics_errors');
        localStorage.removeItem('analytics_activities');
        localStorage.removeItem('analytics_pending');
        localStorage.removeItem('analytics_last_sync');
        
        // Mantieni user ID
        localStorage.setItem('analytics_user_id', userId);
        
        // Reset session
        this.session = {
            id: this.generateSessionId(),
            startTime: Date.now(),
            pageViews: 0,
            events: 0,
            lastActivity: Date.now()
        };
        
        this.queue = [];
        this.metrics = {
            appStart: Date.now(),
            pageLoadTimes: [],
            imageLoadTimes: [],
            dataFetchTimes: []
        };
        
        this.trackEvent('analytics', 'data_reset', null, null, { manual: true });
        
        return { userId, newSessionId: this.session.id };
    }
    
    setTrackingEnabled(enabled) {
        this.config.trackingEnabled = enabled;
        localStorage.setItem('analytics_tracking_enabled', enabled.toString());
        this.trackEvent('analytics', 'tracking_toggled', null, null, { enabled: enabled });
        return enabled;
    }
    
    loadSavedData() {
        const savedTracking = localStorage.getItem('analytics_tracking_enabled');
        if (savedTracking !== null) {
            this.config.trackingEnabled = savedTracking === 'true';
        }
        
        const savedConfig = localStorage.getItem('analytics_config');
        if (savedConfig) {
            try {
                const config = JSON.parse(savedConfig);
                Object.assign(this.config, config);
            } catch (e) {
                console.warn('[Analytics] Configurazione salvata non valida');
            }
        }
        
        // Carica errori vecchi
        const oldErrors = localStorage.getItem('analytics_errors');
        if (!oldErrors) {
            // Migra errori vecchi se esistono
            const analyticsErrors = localStorage.getItem('analytics_errors') || '[]';
            localStorage.setItem('analytics_errors', analyticsErrors);
        }
    }
    
    cleanupOldLocalEvents() {
        try {
            const localEvents = JSON.parse(localStorage.getItem('analytics_events') || '[]');
            const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            
            const recentEvents = localEvents.filter(event => {
                return event.timestamp > oneWeekAgo;
            });
            
            if (recentEvents.length < localEvents.length) {
                localStorage.setItem('analytics_events', JSON.stringify(recentEvents));
                console.log(`[Analytics] Puliti ${localEvents.length - recentEvents.length} eventi vecchi`);
            }
        } catch (error) {
            console.error('[Analytics] Errore cleanup eventi:', error);
        }
    }
}

// Inizializza Analytics Manager
window.Analytics = new AnalyticsManager();

// Inizializzazione automatica MODIFICATA per attendere Firebase
document.addEventListener('DOMContentLoaded', async () => {
    // Funzione helper per attendere Firebase
    const waitForFirebase = (retries = 0) => {
        return new Promise((resolve) => {
            if (window.app && window.firebaseAnalytics) {
                resolve();
            } else if (retries > 20) { // Timeout dopo ~10 secondi
                console.warn('[Analytics] Firebase non disponibile dopo timeout. Avvio limitato.');
                resolve();
            } else {
                setTimeout(() => {
                    waitForFirebase(retries + 1).then(resolve);
                }, 500);
            }
        });
    };

    try {
        // Wait for Service Worker to be ready
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.ready;
                console.log('[Analytics] Service Worker pronto');
            } catch (error) {
                console.warn('[Analytics] Service Worker non disponibile:', error);
            }
        }
        
        // ATTESA ESPLICITA DI FIREBASE
        await waitForFirebase();
        
        // Initialize analytics
        await window.Analytics.initialize();
        
        // Traccia avvio app
        window.Analytics.trackEvent('app', 'loaded', null, null, {
            online: navigator.onLine,
            pwa: window.matchMedia('(display-mode: standalone)').matches,
            platform: navigator.platform,
            screen_size: `${window.screen.width}x${window.screen.height}`,
            viewport_size: `${window.innerWidth}x${window.innerHeight}`,
            service_worker: 'serviceWorker' in navigator
        });
        
        // Traccia prima pagina
        window.Analytics.trackPageView('app_start', {
            load_time: window.performance?.timing ? 
                window.performance.timing.loadEventEnd - window.performance.timing.navigationStart : 0
        });
        
        console.log('[Analytics] Inizializzazione completata');
    } catch (error) {
        console.error('[Analytics] Errore inizializzazione:', error);
    }
});

// Hook per tracciare cambio schermate
const originalShowScreen = window.showScreen;
if (originalShowScreen) {
    window.showScreen = function(screenId) {
        const currentScreen = window.screenHistory ? window.screenHistory[window.screenHistory.length - 1] : 'home-screen';
        
        // Traccia cambio schermata
        if (window.Analytics) {
            window.Analytics.trackEvent('navigation', 'screen_change', `${currentScreen}_to_${screenId}`, null, {
                from_screen: currentScreen,
                to_screen: screenId,
                history_length: window.screenHistory?.length || 0
            });
            
            window.Analytics.trackPageView(`screen_${screenId}`, {
                screen_name: screenId,
                screen_type: screenId.includes('detail') ? 'detail' : 
                          screenId.includes('list') ? 'list' : 
                          screenId === 'home-screen' ? 'home' : 'other'
            });
        }
        
        return originalShowScreen.call(this, screenId);
    };
}

// Hook per tracciare click importanti
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        // Traccia click su pulsanti home
        document.querySelectorAll('.home-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const btnType = this.className.includes('fontane') ? 'fontane' :
                              this.className.includes('beverini') ? 'beverini' :
                              this.className.includes('mappa') ? 'mappa' :
                              this.className.includes('news') ? 'news' : 'other';
                
                if (window.Analytics) {
                    window.Analytics.trackEvent('home', 'button_click', btnType, null, {
                        button_text: this.querySelector('.btn-text')?.textContent || 'N/A'
                    });
                }
            });
        });
        
        // Traccia click su elementi lista
        document.addEventListener('click', function(e) {
            const gridItem = e.target.closest('.grid-item');
            const compactItem = e.target.closest('.compact-item');
            const newsCard = e.target.closest('.news-card');
            
            if (gridItem && window.Analytics) {
                const name = gridItem.querySelector('.item-name')?.textContent;
                window.Analytics.trackEvent('list', 'item_click', 'grid_item', null, {
                    item_name: name || 'N/A',
                    item_type: 'fontana'
                });
            }
            
            if (compactItem && window.Analytics) {
                const name = compactItem.querySelector('.compact-item-name')?.textContent;
                window.Analytics.trackEvent('list', 'item_click', 'compact_item', null, {
                    item_name: name || 'N/A',
                    item_type: 'beverino'
                });
            }
            
            if (newsCard && window.Analytics) {
                const title = newsCard.querySelector('.news-title')?.textContent;
                window.Analytics.trackEvent('news', 'card_click', null, null, {
                    news_title: title || 'N/A'
                });
            }
        });
    }, 2000);
});

// Esporta funzioni globali per il pannello admin
window.analyticsFunctions = {
    refreshAnalytics: () => {
        if (window.Analytics) {
            return window.Analytics.getAnalyticsSummary();
        }
        return null;
    },
    exportAnalyticsData: () => {
        if (window.Analytics) {
            return window.Analytics.exportAnalyticsData();
        }
        return null;
    },
    resetAnalyticsData: () => {
        if (window.Analytics) {
            return window.Analytics.resetUserData();
        }
        return null;
    },
    toggleTracking: (enabled) => {
        if (window.Analytics) {
            return window.Analytics.setTrackingEnabled(enabled);
        }
        return false;
    },
    getConfig: () => {
        if (window.Analytics) {
            return { ...window.Analytics.config };
        }
        return null;
    }
};