// Firebase Collections
const COLLECTIONS = {
    FONTANE: 'fontane',
    BEVERINI: 'beverini',
    NEWS: 'news',
    USERS: 'users',
    ACTIVITY: 'activity'
};

// Variabili globali
let appData = {
    fontane: [],
    beverini: [],
    news: []
};
let currentLatLng = null;
let screenHistory = ['home-screen'];
let currentFilter = {
    fontane: 'all',
    beverini: 'all'
};
let activityLog = [];
let searchResults = [];
let searchMarker = null;
let map = null;
let clusterGroup = null;
let markers = new Map();
let searchTimeout;
let isAdminAuthenticated = false;
let adminAuthTimeout = null;

// Firebase Firestore functions
async function loadFirebaseData(type) {
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const dataRef = collection(window.db, COLLECTIONS[type.toUpperCase()]);
        const snapshot = await getDocs(dataRef);
        
        const data = [];
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });
        
        appData[type] = data;
        saveLocalData();
        
        showToast(`${data.length} ${type} caricati da Firebase`, 'success');
        logActivity(`${data.length} ${type} caricati da Firebase`);
        
        return data;
    } catch (error) {
        console.error(`Errore nel caricamento ${type}:`, error);
        loadLocalData(type);
        showToast(`Utilizzo dati locali per ${type}`, 'info');
        return appData[type];
    }
}

async function saveFirebaseData(type, item, isUpdate = false) {
    try {
        const { doc, setDoc, updateDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        
        if (isUpdate && item.id) {
            const docRef = doc(window.db, COLLECTIONS[type.toUpperCase()], item.id);
            await updateDoc(docRef, item);
            return item.id;
        } else {
            const dataRef = collection(window.db, COLLECTIONS[type.toUpperCase()]);
            const newDoc = await addDoc(dataRef, item);
            return newDoc.id;
        }
    } catch (error) {
        console.error(`Errore nel salvataggio ${type}:`, error);
        throw error;
    }
}

async function deleteFirebaseData(type, id) {
    try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
        const docRef = doc(window.db, COLLECTIONS[type.toUpperCase()], id);
        await deleteDoc(docRef);
        return true;
    } catch (error) {
        console.error(`Errore nell'eliminazione ${type}:`, error);
        throw error;
    }
}

// Local Storage functions
function saveLocalData() {
    try {
        localStorage.setItem('fontaneBeveriniData', JSON.stringify(appData));
        localStorage.setItem('fontaneBeveriniLastSync', new Date().toISOString());
    } catch (error) {
        console.error('Errore nel salvataggio locale:', error);
    }
}

function loadLocalData(type = null) {
    try {
        const savedData = localStorage.getItem('fontaneBeveriniData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (type) {
                return parsedData[type] || [];
            }
            appData = parsedData;
        }
    } catch (error) {
        console.error('Errore nel caricamento locale:', error);
    }
    return type ? [] : appData;
}

// Funzioni principali
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function getStatusText(stato) {
    const statusMap = {
        'funzionante': 'Funzionante',
        'non-funzionante': 'Non Funzionante',
        'manutenzione': 'In Manutenzione'
    };
    return statusMap[stato] || 'Stato sconosciuto';
}

function formatDate(dateString) {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('it-IT', options);
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    
    const typeConfig = {
        error: { background: 'var(--primary-red)', icon: 'fa-exclamation-triangle' },
        success: { background: 'var(--primary-green)', icon: 'fa-check-circle' },
        info: { background: 'var(--primary-blue)', icon: 'fa-info-circle' },
        warning: { background: 'var(--primary-orange)', icon: 'fa-exclamation-circle' }
    };
    
    const config = typeConfig[type] || typeConfig.info;
    
    toast.innerHTML = `<i class="fas ${config.icon}"></i> ${message}`;
    toast.style.background = config.background;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function logActivity(description) {
    const timestamp = new Date().toLocaleString('it-IT');
    activityLog.unshift({ description, timestamp });

    if (activityLog.length > 10) {
        activityLog = activityLog.slice(0, 10);
    }

    localStorage.setItem('activityLog', JSON.stringify(activityLog));
    updateActivityLog();
}

function updateActivityLog() {
    const activityList = document.getElementById('activity-list');
    if (!activityList) return;
    
    activityList.innerHTML = '';
    activityLog.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.innerHTML = `
            <div class="activity-desc">${activity.description}</div>
            <div class="activity-time">${activity.timestamp}</div>
        `;
        activityList.appendChild(activityItem);
    });
}

function clearActivityLog() {
    activityLog = [];
    localStorage.removeItem('activityLog');
    updateActivityLog();
    showToast('Log attività pulito', 'success');
}

function updateDashboardStats() {
    document.getElementById('total-fontane').textContent = appData.fontane.length;
    document.getElementById('fontane-funzionanti').textContent = appData.fontane.filter(f => f.stato === 'funzionante').length;
    document.getElementById('fontane-non-funzionanti').textContent = appData.fontane.filter(f => f.stato === 'non-funzionante').length;
    document.getElementById('fontane-manutenzione').textContent = appData.fontane.filter(f => f.stato === 'manutenzione').length;
    
    document.getElementById('total-beverini').textContent = appData.beverini.length;
    document.getElementById('beverini-funzionanti').textContent = appData.beverini.filter(b => b.stato === 'funzionante').length;
    document.getElementById('beverini-non-funzionanti').textContent = appData.beverini.filter(b => b.stato === 'non-funzionante').length;
    document.getElementById('beverini-manutenzione').textContent = appData.beverini.filter(b => b.stato === 'manutenzione').length;
    
    document.getElementById('total-news').textContent = appData.news.length;
}

// Admin Authentication
function openAdminPanel() {
    if (isAdminAuthenticated) {
        showAdminPanel();
    } else {
        showAdminAuth();
    }
}

function showAdminAuth() {
    document.getElementById('admin-auth').style.display = 'flex';
    document.getElementById('admin-password').focus();
}

function closeAdminAuth() {
    document.getElementById('admin-auth').style.display = 'none';
    document.getElementById('admin-password').value = '';
    document.getElementById('auth-error').style.display = 'none';
}

async function checkAdminAuth() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('auth-error');

    try {
        const userCredential = await window.firebaseSignIn(window.auth, email, password);
        isAdminAuthenticated = true;
        
        closeAdminAuth();
        showAdminPanel();
        
        if (adminAuthTimeout) {
            clearTimeout(adminAuthTimeout);
        }
        adminAuthTimeout = setTimeout(() => {
            isAdminAuthenticated = false;
            showToast('Sessione amministratore scaduta', 'info');
        }, 30 * 60 * 1000);
        
        showToast('Accesso amministratore effettuato', 'success');
        logActivity('Accesso amministratore effettuato');
        
    } catch (error) {
        errorElement.style.display = 'block';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-password').focus();
        console.error('Errore autenticazione:', error);
    }
}

function showAdminPanel() {
    document.getElementById('admin-panel').style.display = 'flex';
    
    loadAdminFontane();
    loadAdminBeverini();
    loadAdminNews();
    updateDashboardStats();
    
    const savedLog = localStorage.getItem('activityLog');
    if (savedLog) {
        activityLog = JSON.parse(savedLog);
        updateActivityLog();
    }
}

function closeAdminPanel() {
    document.getElementById('admin-panel').style.display = 'none';
}

function logoutAdmin() {
    isAdminAuthenticated = false;
    if (adminAuthTimeout) {
        clearTimeout(adminAuthTimeout);
        adminAuthTimeout = null;
    }
    closeAdminPanel();
    showToast('Logout amministratore effettuato', 'success');
    logActivity('Logout amministratore');
}

// Navigation and Screen Management
function showScreen(screenId) {
    if (screenHistory[screenHistory.length - 1] !== screenId) {
        screenHistory.push(screenId);
    }
    if (screenHistory.length > 10) {
        screenHistory = screenHistory.slice(-10);
    }
    
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
        window.scrollTo(0, 0);
        initializeScreenContent(screenId);
    }
    
    updateTabBar(screenId);
    document.getElementById('fixed-navigate-btn').classList.add('hidden');
}

function goBack() {
    if (screenHistory.length > 1) {
        screenHistory.pop();
        const previousScreen = screenHistory[screenHistory.length - 1];
        showScreen(previousScreen);
    } else {
        showScreen('home-screen');
    }
}

function updateTabBar(activeScreen) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeTab = document.querySelector(`.tab-btn[data-target="${activeScreen}"]`);
    if (activeTab) activeTab.classList.add('active');
}

function initializeScreenContent(screenId) {
    switch(screenId) {
        case 'fontane-screen':
            loadFontane();
            break;
        case 'beverini-screen':
            loadBeverini();
            break;
        case 'mappa-screen':
            initMappa();
            break;
        case 'news-screen':
            loadNews();
            break;
    }
}

// Data Loading Functions
async function loadFontane() {
    const fontaneList = document.getElementById('fontane-list');
    if (!fontaneList) return;
    
    showSkeletonLoader(fontaneList);
    
    try {
        await loadFirebaseData('fontane');
        renderGridItems(fontaneList, getFilteredItems('fontane'), 'fontana');
    } catch (error) {
        showToast('Errore nel caricamento fontane', 'error');
    }
}

async function loadBeverini() {
    const beveriniList = document.getElementById('beverini-list');
    if (!beveriniList) return;
    
    showSkeletonLoaderCompact(beveriniList);
    
    try {
        await loadFirebaseData('beverini');
        renderCompactItems(beveriniList, getFilteredItems('beverini'), 'beverino');
    } catch (error) {
        showToast('Errore nel caricamento beverini', 'error');
    }
}

async function loadNews() {
    const newsList = document.getElementById('news-list');
    if (!newsList) return;
    
    try {
        await loadFirebaseData('news');
        renderNewsItems(newsList, appData.news);
    } catch (error) {
        showToast('Errore nel caricamento news', 'error');
    }
}

function getFilteredItems(type) {
    const items = appData[type];
    const filter = currentFilter[type];

    if (!items || filter === 'all') {
        return items || [];
    }

    return items.filter(item => item.stato === filter);
}

function setFilter(type, stato) {
    currentFilter[type] = stato;

    document.querySelectorAll(`#${type}-screen .filter-btn`).forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`#${type}-screen .filter-btn.${stato}`).classList.add('active');

    if (type === 'fontane') {
        renderGridItems(document.getElementById('fontane-list'), getFilteredItems('fontane'), 'fontana');
    } else if (type === 'beverini') {
        renderCompactItems(document.getElementById('beverini-list'), getFilteredItems('beverini'), 'beverino');
    }
}

const debouncedFilter = debounce(function(type, query) {
    const container = document.getElementById(`${type}-list`);
    if (!container) return;
    
    let items;
    if (type === 'beverini') {
        items = container.getElementsByClassName('compact-item');
    } else {
        items = container.getElementsByClassName('grid-item');
    }

    let visibleCount = 0;
    for (let i = 0; i < items.length; i++) {
        let name, address;

        if (type === 'beverini') {
            name = items[i].getElementsByClassName('compact-item-name')[0].textContent;
            address = items[i].getElementsByClassName('compact-item-address')[0].textContent;
        } else {
            name = items[i].getElementsByClassName('item-name')[0].textContent;
            address = items[i].getElementsByClassName('item-address')[0].textContent;
        }

        const isVisible = name.toLowerCase().includes(query.toLowerCase()) ||
                         address.toLowerCase().includes(query.toLowerCase());
        items[i].style.display = isVisible ? 'flex' : 'none';
        if (isVisible) visibleCount++;
    }

    if (visibleCount === 0 && query) {
        const existingEmptyStates = container.getElementsByClassName('empty-state');
        for (let i = 0; i < existingEmptyStates.length; i++) {
            existingEmptyStates[i].remove();
        }
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-state-icon"><i class="fas fa-search"></i></div>
            <div class="empty-state-text">Nessun risultato trovato</div>
            <div class="empty-state-subtext">Prova a modificare i termini di ricerca</div>
        `;
        container.appendChild(emptyState);
    } else if (query === '') {
        const emptyStates = container.getElementsByClassName('empty-state');
        for (let i = 0; i < emptyStates.length; i++) {
            emptyStates[i].remove();
        }
    }
}, 300);

// Rendering Functions
function showSkeletonLoader(container, count = 6) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeletonItem = document.createElement('div');
        skeletonItem.className = 'grid-item';
        skeletonItem.innerHTML = `
            <div class="skeleton-loader skeleton-image"></div>
            <div class="item-content">
                <div class="skeleton-loader skeleton-text"></div>
                <div class="skeleton-loader skeleton-text short"></div>
                <div class="item-footer">
                    <div class="skeleton-loader skeleton-text" style="width: 80px;"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 40px;"></div>
                </div>
            </div>
        `;
        container.appendChild(skeletonItem);
    }
}

function showSkeletonLoaderCompact(container, count = 6) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const skeletonItem = document.createElement('div');
        skeletonItem.className = 'compact-item';
        skeletonItem.innerHTML = `
            <div class="skeleton-loader" style="width: 80px; height: 80px;"></div>
            <div class="compact-item-content">
                <div class="compact-item-header">
                    <div class="skeleton-loader skeleton-text" style="width: 70%;"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 20px; height: 20px;"></div>
                </div>
                <div class="skeleton-loader skeleton-text short" style="width: 90%;"></div>
                <div class="compact-item-footer">
                    <div class="skeleton-loader skeleton-text" style="width: 80px;"></div>
                    <div class="skeleton-loader skeleton-text" style="width: 40px;"></div>
                </div>
            </div>
        `;
        container.appendChild(skeletonItem);
    }
}

function renderGridItems(container, items, type) {
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-${type === 'fontana' ? 'monument' : 'faucet'}"></i></div>
                <div class="empty-state-text">Nessuna ${type} disponibile</div>
                <div class="empty-state-subtext">${currentFilter[type + 's'] !== 'all' ? 'Prova a cambiare filtro' : 'Aggiungi tramite il pannello di controllo'}</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    items.forEach(item => {
        const gridItem = document.createElement('div');
        gridItem.className = 'grid-item';
        gridItem.onclick = () => {
            showDetail(item.id, type);
            currentLatLng = { lat: item.latitudine, lng: item.longitudine };
            document.getElementById('fixed-navigate-btn').classList.remove('hidden');
        };
        
        const hasCustomImage = item.immagine && item.immagine.trim() !== '';
        gridItem.innerHTML = `
            <div class="item-image-container">
                <img src="${item.immagine || './images/sfondo-home.jpg'}" alt="${item.nome}" class="item-image" onerror="this.src='./images/sfondo-home.jpg'">
            </div>
            <div class="item-content">
                <div class="item-name">${item.nome}</div>
                <div class="item-address">${item.indirizzo}</div>
                <div class="item-footer">
                    <span class="item-status status-${item.stato}">${getStatusText(item.stato)}</span>
                    <span class="image-indicator ${hasCustomImage ? 'image-custom' : 'image-default'}">${hasCustomImage ? '<i class="fas fa-check"></i>' : '<i class="fas fa-image"></i>'}</span>
                </div>
            </div>
        `;
        container.appendChild(gridItem);
    });
}

function renderCompactItems(container, items, type) {
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-${type === 'beverino' ? 'faucet' : 'monument'}"></i></div>
                <div class="empty-state-text">Nessun ${type} disponibile</div>
                <div class="empty-state-subtext">${currentFilter[type + 's'] !== 'all' ? 'Prova a cambiare filtro' : 'Aggiungi tramite il pannello di controllo'}</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    items.forEach(item => {
        const compactItem = document.createElement('div');
        compactItem.className = 'compact-item';

        const totalLength = (item.nome || '').length + (item.indirizzo || '').length;
        let heightClass = '';

        if (totalLength > 100) {
            heightClass = 'very-long-content';
        } else if (totalLength > 60) {
            heightClass = 'long-content';
        }

        if (heightClass) {
            compactItem.classList.add(heightClass);
        }

        compactItem.onclick = () => {
            showDetail(item.id, type);
            currentLatLng = { lat: item.latitudine, lng: item.longitudine };
            document.getElementById('fixed-navigate-btn').classList.remove('hidden');
        };

        const hasCustomImage = item.immagine && item.immagine.trim() !== '';
        compactItem.innerHTML = `
            <img src="${item.immagine || './images/sfondo-home.jpg'}"
                 alt="${item.nome}"
                 class="compact-item-image"
                 onerror="this.src='./images/sfondo-home.jpg'">
            <div class="compact-item-content">
                <div class="compact-item-header">
                    <div class="compact-item-name">${item.nome}</div>
                    <span class="image-indicator ${hasCustomImage ? 'image-custom' : 'image-default'}">
                        ${hasCustomImage ? '<i class="fas fa-check"></i>' : '<i class="fas fa-image"></i>'}
                    </span>
                </div>
                <div class="compact-item-address">${item.indirizzo}</div>
                <div class="compact-item-footer">
                    <span class="compact-item-status status-${item.stato}">${getStatusText(item.stato)}</span>
                </div>
            </div>
        `;
        container.appendChild(compactItem);
    });
}

function renderNewsItems(container, news) {
    if (!news || news.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-newspaper"></i></div>
                <div class="empty-state-text">Nessuna news disponibile</div>
                <div class="empty-state-subtext">Torna presto per aggiornamenti</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = '';
    const sortedNews = [...news].sort((a, b) => new Date(b.data) - new Date(a.data));
    sortedNews.forEach(item => {
        const newsCard = document.createElement('div');
        newsCard.className = 'news-card';
        newsCard.innerHTML = `
            <div class="news-header">
                <div class="news-title">${item.titolo}</div>
                <div class="news-date">${formatDate(item.data)}</div>
            </div>
            <div class="news-content">${item.contenuto}</div>
            <div class="news-footer">
                <span class="news-category">${item.categoria}</span>
                <span class="news-source">Fonte: ${item.fonte}</span>
            </div>
        `;
        container.appendChild(newsCard);
    });
}

// Detail View
function showDetail(id, type) {
    let item, screenId, titleElement, contentElement;
    
    if (type === 'fontana') {
        item = appData.fontane.find(f => f.id == id);
        screenId = 'fontana-detail-screen';
        titleElement = document.getElementById('fontana-detail-title');
        contentElement = document.getElementById('fontana-detail-content');
    } else {
        item = appData.beverini.find(b => b.id == id);
        screenId = 'beverino-detail-screen';
        titleElement = document.getElementById('beverino-detail-title');
        contentElement = document.getElementById('beverino-detail-content');
    }
    
    if (!item) {
        showToast('Elemento non trovato', 'error');
        return;
    }
    
    titleElement.textContent = item.nome;
    contentElement.innerHTML = generateDetailHTML(item, type);
    currentLatLng = { lat: item.latitudine, lng: item.longitudine };
    document.getElementById('fixed-navigate-btn').classList.remove('hidden');
    showScreen(screenId);
}

function generateDetailHTML(item, type) {
    let specificFields = '';
    if (type === 'fontana') {
        specificFields = `
            ${item.anno ? `<div class="info-item"><span class="info-label">Anno:</span><span class="info-value">${item.anno}</span></div>` : ''}
            ${item.storico ? `<div class="info-item"><span class="info-label">Storico:</span><span class="info-value">${item.storico}</span></div>` : ''}
        `;
    }
    
    return `
        <img src="${item.immagine || './images/sfondo-home.jpg'}" class="detail-image" alt="${item.nome}" onerror="this.src='./images/sfondo-home.jpg'">
        <div class="detail-info">
            <div class="info-item">
                <span class="info-label">${type === 'fontana' ? 'Indirizzo:' : 'Posizione:'}</span>
                <span class="info-value">${item.indirizzo}</span>
            </div>
            <div class="info-item">
                <span class="info-label">Stato:</span>
                <span class="info-value">${getStatusText(item.stato)}</span>
            </div>
            ${specificFields}
            <div class="info-item">
                <span class="info-label">Descrizione:</span>
                <span class="info-value">${item.descrizione || 'Nessuna descrizione disponibile'}</span>
            </div>
        </div>
        <div class="detail-actions">
            <button class="detail-action-btn primary" onclick="navigateTo(${item.latitudine}, ${item.longitudine})">
                <i class="fas fa-map-marker-alt"></i> Naviga
            </button>
            <button class="detail-action-btn secondary" onclick="shareItem('${item.id}', '${type}')">
                <i class="fas fa-share-alt"></i> Condividi
            </button>
        </div>
    `;
}

// Navigation
function navigateTo(lat, lng) {
    currentLatLng = { lat, lng };
    document.getElementById('navigation-modal').style.display = 'flex';
}

function navigateToFixed() {
    if (!currentLatLng) return;
    navigateTo(currentLatLng.lat, currentLatLng.lng);
}

function openGoogleMaps() {
    if (!currentLatLng) return;
    const { lat, lng } = currentLatLng;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    window.open(url, '_blank');
    closeNavigationModal();
    showToast('Apertura Google Maps...', 'info');
}

function openAppleMaps() {
    if (!currentLatLng) return;
    const { lat, lng } = currentLatLng;
    const url = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;
    window.open(url, '_blank');
    closeNavigationModal();
    showToast('Apertura Apple Maps...', 'info');
}

function closeNavigationModal() {
    document.getElementById('navigation-modal').style.display = 'none';
    currentLatLng = null;
}

// Map Functions
function initMappa() {
    if (!map) {
        map = L.map('map').setView([40.8518, 14.2681], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        clusterGroup = L.markerClusterGroup();
        map.addLayer(clusterGroup);

        addMapControls();
        setupSearchAutocomplete();
    }

    clusterGroup.clearLayers();
    markers.clear();

    appData.fontane.forEach(fontana => {
        if (isValidCoordinate(fontana.latitudine, fontana.longitudine)) {
            const marker = createMarker(fontana, 'fontana');
            const markerId = `fontana-${fontana.id}`;

            markers.set(markerId, marker);
            clusterGroup.addLayer(marker);
        }
    });

    appData.beverini.forEach(beverino => {
        if (isValidCoordinate(beverino.latitudine, beverino.longitudine)) {
            const marker = createMarker(beverino, 'beverino');
            const markerId = `beverino-${beverino.id}`;

            markers.set(markerId, marker);
            clusterGroup.addLayer(marker);
        }
    });

    if (markers.size > 0) {
        const bounds = clusterGroup.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.1));
        }
    }

    requestUserLocation();
}

function createMarker(item, type) {
    const icon = getIconForType(type);
    const marker = L.marker([item.latitudine, item.longitudine], { icon });

    marker.bindPopup(`
        <div class="leaflet-popup-content">
            <div class="popup-title">${item.nome}</div>
            <p>${item.indirizzo}</p>
            <p>Stato: ${getStatusText(item.stato)}</p>
            <button class="popup-btn" onclick="showDetail('${item.id}', '${type}')">Dettagli</button>
            <button class="popup-btn" onclick="navigateTo(${item.latitudine}, ${item.longitudine})" style="margin-top: 5px; background: var(--primary-green);">Naviga</button>
        </div>
    `);

    return marker;
}

function isValidCoordinate(lat, lng) {
    return !isNaN(lat) && !isNaN(lng) &&
           lat >= -90 && lat <= 90 &&
           lng >= -180 && lng <= 180;
}

function getIconForType(type) {
    const iconConfigs = {
        fontana: {
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        },
        beverino: {
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34]
        }
    };

    return L.icon(iconConfigs[type] || iconConfigs.fontana);
}

function addMapControls() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'map-controls';
    
    const locateBtn = document.createElement('button');
    locateBtn.className = 'map-control-btn';
    locateBtn.innerHTML = '<i class="fas fa-location-arrow"></i>';
    locateBtn.title = 'Centra sulla mia posizione';
    locateBtn.onclick = requestUserLocation;
    
    const fitBoundsBtn = document.createElement('button');
    fitBoundsBtn.className = 'map-control-btn';
    fitBoundsBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fitBoundsBtn.title = 'Mostra tutti i punti';
    fitBoundsBtn.onclick = fitMapToMarkers;
    
    controlsContainer.appendChild(locateBtn);
    controlsContainer.appendChild(fitBoundsBtn);
    document.getElementById('mappa-screen').appendChild(controlsContainer);
}

function requestUserLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                if (window.userMarker) {
                    map.removeLayer(window.userMarker);
                }
                window.userMarker = L.marker([latitude, longitude], {
                    icon: L.icon({
                        iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                        iconSize: [25, 41],
                        iconAnchor: [12, 41],
                        popupAnchor: [1, -34]
                    })
                })
                .addTo(map)
                .bindPopup('La tua posizione');

                map.setView([latitude, longitude], 16);
                showToast('Posizione corrente visualizzata sulla mappa', 'success');
            },
            error => {
                handleGeolocationError(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        showToast('Geolocalizzazione non supportata dal browser', 'error');
    }
}

function handleGeolocationError(error) {
    let message = 'Errore nel rilevamento posizione';

    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Autorizzazione alla geolocalizzazione negata.';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Posizione non disponibile. Verifica che il GPS sia attivo.';
            break;
        case error.TIMEOUT:
            message = 'Timeout nel rilevamento. Riprova in zona con migliore ricezione.';
            break;
        default:
            message = `Errore: ${error.message}`;
    }

    showToast(message, 'error');
}

function fitMapToMarkers() {
    if (markers.size > 0) {
        const bounds = clusterGroup.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds.pad(0.1));
            showToast('Vista adattata a tutti i punti', 'success');
        }
    } else {
        showToast('Nessun punto da mostrare', 'info');
    }
}

// Share Function
function shareItem(id, type) {
    let item;
    if (type === 'fontana') {
        item = appData.fontane.find(f => f.id == id);
    } else {
        item = appData.beverini.find(b => b.id == id);
    }
    if (!item) {
        showToast('Elemento non trovato', 'error');
        return;
    }
    
    const text = `${item.nome} - ${item.indirizzo}`;
    const url = `${window.location.origin}${window.location.pathname}?${type}=${id}`;
    
    if (navigator.share) {
        navigator.share({
            title: item.nome,
            text: text,
            url: url
        })
        .then(() => showToast('Condivisione completata', 'success'))
        .catch(error => {
            if (error.name !== 'AbortError') {
                showToast('Errore nella condivisione', 'error');
            }
        });
    } else {
        navigator.clipboard.writeText(`${text} - ${url}`)
            .then(() => showToast('Link copiato negli appunti', 'success'))
            .catch(() => {
                const textArea = document.createElement('textarea');
                textArea.value = `${text} - ${url}`;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('Link copiato negli appunti', 'success');
            });
    }
}

// Search Functions
async function searchAddressOnMap(query) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=it&accept-language=it`,
            {
                headers: {
                    'User-Agent': 'FontaneBeveriniNapoli/1.0'
                }
            }
        );

        const results = await response.json();

        if (results.length > 0) {
            return results;
        } else {
            showToast('Nessun risultato trovato', 'warning');
            return [];
        }
    } catch (error) {
        showToast('Errore nella ricerca', 'error');
        return [];
    }
}

function handleMapSearch(event) {
    if (event.key === 'Enter') {
        performMapSearch();
    }
}

async function performMapSearch() {
    const query = document.getElementById('map-search-input').value.trim();
    if (!query) return;

    showToast('Ricerca in corso...', 'info');

    const results = await searchAddressOnMap(query);
    displaySearchResults(results);
}

function displaySearchResults(results) {
    searchResults = results;
    const container = document.getElementById('map-search-results');

    if (results.length === 0) {
        container.innerHTML = '<div class="search-result-item">Nessun risultato trovato</div>';
        container.style.display = 'block';
        return;
    }

    container.innerHTML = results.map((result, index) => `
        <div class="search-result-item" onclick="selectSearchResult(${index})">
            <div class="search-result-name">${result.display_name.split(',')[0]}</div>
            <div class="search-result-address">${result.display_name}</div>
        </div>
    `).join('');

    container.style.display = 'block';
}

function selectSearchResult(index) {
    const result = searchResults[index];

    if (searchMarker) {
        map.removeLayer(searchMarker);
    }

    searchMarker = L.marker([result.lat, result.lon])
        .addTo(map)
        .bindPopup(`
            <div class="leaflet-popup-content">
                <div class="popup-title">${result.display_name.split(',')[0]}</div>
                <p>${result.display_name}</p>
                <button class="popup-btn" onclick="centerOnSearchResult(${result.lat}, ${result.lon})">Centra qui</button>
                <button class="popup-btn" onclick="addAsNewPoint('${result.display_name}', ${result.lat}, ${result.lon})"
                        style="background: var(--primary-green); margin-top: 5px;">
                    Aggiungi come nuovo punto
                </button>
            </div>
        `)
        .openPopup();

    map.setView([result.lat, result.lon], 16);

    document.getElementById('map-search-results').style.display = 'none';
    document.getElementById('map-search-input').value = '';

    showToast('Risultato trovato!', 'success');
}

function centerOnSearchResult(lat, lng) {
    map.setView([lat, lng], 16);
}

function addAsNewPoint(name, lat, lng) {
    const type = name.toLowerCase().includes('fontana') ? 'fontana' : 'beverino';

    showAdminTab(`${type}-admin`);

    document.getElementById(`${type}-nome`).value = name.split(',')[0];
    document.getElementById(`${type}-indirizzo`).value = name;
    document.getElementById(`${type}-latitudine`).value = lat;
    document.getElementById(`${type}-longitudine`).value = lng;

    showToast(`Compila i campi mancanti e salva il nuovo ${type}`, 'info');
}

function setupSearchAutocomplete() {
    const searchInput = document.getElementById('map-search-input');

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();

        if (query.length < 3) {
            document.getElementById('map-search-results').style.display = 'none';
            return;
        }

        searchTimeout = setTimeout(async () => {
            const results = await searchAddressOnMap(query);
            displaySearchResults(results);
        }, 500);
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.map-search-container')) {
            document.getElementById('map-search-results').style.display = 'none';
        }
    });
}

// Location Functions
function getCurrentLocationCoordinatesOnly(type) {
    showToast('Rilevamento coordinate in corso...', 'info');

    if (!navigator.geolocation) {
        showToast('Geolocalizzazione non supportata dal browser', 'error');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            document.getElementById(`${type}-latitudine`).value = lat.toFixed(6);
            document.getElementById(`${type}-longitudine`).value = lng.toFixed(6);

            showToast('Coordinate rilevate con successo!', 'success');
            logActivity(`Coordinate rilevate per ${type}`);
        },
        handleGeolocationError,
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        }
    );
}

async function getCurrentLocationWithAddress(type) {
    showToast('Rilevamento posizione e indirizzo...', 'info');

    if (!navigator.geolocation) {
        showToast('Geolocalizzazione non supportata dal browser', 'error');
        return;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        document.getElementById(`${type}-latitudine`).value = lat.toFixed(6);
        document.getElementById(`${type}-longitudine`).value = lng.toFixed(6);

        try {
            const address = await reverseGeocode(lat, lng);
            if (address) {
                document.getElementById(`${type}-indirizzo`).value = address;
                showToast('Posizione e indirizzo rilevati!', 'success');
                logActivity(`Posizione e indirizzo rilevati per ${type}`);
            } else {
                document.getElementById(`${type}-indirizzo`).value = `Coordinate: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                showToast('Posizione rilevata (indirizzo non disponibile)', 'warning');
            }
        } catch (geocodeError) {
            document.getElementById(`${type}-indirizzo`).value = `Coordinate: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            showToast('Posizione rilevata - inserisci indirizzo manualmente', 'warning');
        }

    } catch (error) {
        handleGeolocationError(error);
    }
}

async function reverseGeocode(lat, lng) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            {
                headers: {
                    'Accept-Language': 'it-IT,it;q=0.9',
                    'User-Agent': 'FontaneBeveriniNapoli/1.0'
                }
            }
        );
        
        const data = await response.json();
        
        if (data && data.address) {
            const parts = [];
            if (data.address.road) parts.push(data.address.road);
            if (data.address.house_number) parts.push(data.address.house_number);
            
            if (parts.length > 0) {
                let formattedAddress = parts.join(', ');
                
                if (data.address.city || data.address.town || data.address.village) {
                    const city = data.address.city || data.address.town || data.address.village;
                    if (data.address.postcode) {
                        formattedAddress += `, ${data.address.postcode} ${city}`;
                    } else {
                        formattedAddress += `, ${city}`;
                    }
                }
                return formattedAddress;
            }
            
            return data.address.city || data.address.town || data.address.village || null;
        }
    } catch (error) {
        console.error('Errore reverse geocoding:', error);
    }
    
    return null;
}

// Admin Panel Functions
document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        const tabId = this.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

function showAdminTab(tabId) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector(`.admin-tab-btn[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// Fontane Admin
async function loadAdminFontane() {
    const tbody = document.getElementById('fontane-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    appData.fontane.forEach(fontana => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fontana.id}</td>
            <td>${fontana.nome}</td>
            <td>${fontana.indirizzo}</td>
            <td><span class="item-status status-${fontana.stato}">${getStatusText(fontana.stato)}</span></td>
            <td class="admin-item-actions">
                <button class="edit-btn" onclick="editFontana('${fontana.id}')">Modifica</button>
                <button class="delete-btn" onclick="deleteFontana('${fontana.id}')">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editFontana(id) {
    const fontana = appData.fontane.find(f => f.id == id);
    if (!fontana) return;
    
    document.getElementById('fontana-id').value = fontana.id;
    document.getElementById('fontana-nome').value = fontana.nome || '';
    document.getElementById('fontana-indirizzo').value = fontana.indirizzo || '';
    document.getElementById('fontana-stato').value = fontana.stato || 'funzionante';
    document.getElementById('fontana-anno').value = fontana.anno || '';
    document.getElementById('fontana-descrizione').value = fontana.descrizione || '';
    document.getElementById('fontana-storico').value = fontana.storico || '';
    document.getElementById('fontana-latitudine').value = fontana.latitudine || '';
    document.getElementById('fontana-longitudine').value = fontana.longitudine || '';
    document.getElementById('fontana-immagine').value = fontana.immagine || '';
    
    showAdminTab('fontane-admin');
}

async function saveFontana(e) {
    e.preventDefault();
    
    const id = document.getElementById('fontana-id').value;
    const nome = document.getElementById('fontana-nome').value;
    const indirizzo = document.getElementById('fontana-indirizzo').value;
    const stato = document.getElementById('fontana-stato').value;
    const anno = document.getElementById('fontana-anno').value;
    const descrizione = document.getElementById('fontana-descrizione').value;
    const storico = document.getElementById('fontana-storico').value;
    const latitudine = parseFloat(document.getElementById('fontana-latitudine').value);
    const longitudine = parseFloat(document.getElementById('fontana-longitudine').value);
    const immagine = document.getElementById('fontana-immagine').value;
    
    const fontanaData = {
        nome,
        indirizzo,
        stato,
        anno,
        descrizione,
        storico,
        latitudine,
        longitudine,
        immagine,
        last_modified: new Date().toISOString()
    };
    
    try {
        let savedId;
        if (id) {
            // Update existing
            savedId = await saveFirebaseData('fontane', { id, ...fontanaData }, true);
            const index = appData.fontane.findIndex(f => f.id == id);
            if (index !== -1) {
                appData.fontane[index] = { id, ...fontanaData };
            }
            showToast('Fontana modificata con successo', 'success');
        } else {
            // Create new
            savedId = await saveFirebaseData('fontane', fontanaData, false);
            appData.fontane.push({ id: savedId, ...fontanaData });
            showToast(`Fontana aggiunta con successo (ID: ${savedId})`, 'success');
        }
        
        saveLocalData();
        loadAdminFontane();
        resetFontanaForm();
        
        // Update UI
        loadFontane();
        updateDashboardStats();
        
    } catch (error) {
        showToast('Errore nel salvataggio della fontana', 'error');
    }
}

function resetFontanaForm() {
    document.getElementById('fontana-form').reset();
    document.getElementById('fontana-id').value = '';
}

async function deleteFontana(id) {
    if (!confirm('Sei sicuro di voler eliminare questa fontana?')) return;
    
    try {
        await deleteFirebaseData('fontane', id);
        appData.fontane = appData.fontane.filter(f => f.id != id);
        
        saveLocalData();
        loadAdminFontane();
        loadFontane();
        updateDashboardStats();
        
        showToast('Fontana eliminata con successo', 'success');
        logActivity('Fontana eliminata');
    } catch (error) {
        showToast('Errore nell\'eliminazione della fontana', 'error');
    }
}

// Beverini Admin
async function loadAdminBeverini() {
    const tbody = document.getElementById('beverini-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    appData.beverini.forEach(beverino => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${beverino.id}</td>
            <td>${beverino.nome}</td>
            <td>${beverino.indirizzo}</td>
            <td><span class="item-status status-${beverino.stato}">${getStatusText(beverino.stato)}</span></td>
            <td class="admin-item-actions">
                <button class="edit-btn" onclick="editBeverino('${beverino.id}')">Modifica</button>
                <button class="delete-btn" onclick="deleteBeverino('${beverino.id}')">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editBeverino(id) {
    const beverino = appData.beverini.find(b => b.id == id);
    if (!beverino) return;
    
    document.getElementById('beverino-id').value = beverino.id;
    document.getElementById('beverino-nome').value = beverino.nome || '';
    document.getElementById('beverino-indirizzo').value = beverino.indirizzo || '';
    document.getElementById('beverino-stato').value = beverino.stato || 'funzionante';
    document.getElementById('beverino-latitudine').value = beverino.latitudine || '';
    document.getElementById('beverino-longitudine').value = beverino.longitudine || '';
    document.getElementById('beverino-immagine').value = beverino.immagine || '';
    
    showAdminTab('beverini-admin');
}

async function saveBeverino(e) {
    e.preventDefault();
    
    const id = document.getElementById('beverino-id').value;
    const nome = document.getElementById('beverino-nome').value;
    const indirizzo = document.getElementById('beverino-indirizzo').value;
    const stato = document.getElementById('beverino-stato').value;
    const latitudine = parseFloat(document.getElementById('beverino-latitudine').value);
    const longitudine = parseFloat(document.getElementById('beverino-longitudine').value);
    const immagine = document.getElementById('beverino-immagine').value;
    
    const beverinoData = {
        nome,
        indirizzo,
        stato,
        latitudine,
        longitudine,
        immagine,
        last_modified: new Date().toISOString()
    };
    
    try {
        let savedId;
        if (id) {
            savedId = await saveFirebaseData('beverini', { id, ...beverinoData }, true);
            const index = appData.beverini.findIndex(b => b.id == id);
            if (index !== -1) {
                appData.beverini[index] = { id, ...beverinoData };
            }
            showToast('Beverino modificato con successo', 'success');
        } else {
            savedId = await saveFirebaseData('beverini', beverinoData, false);
            appData.beverini.push({ id: savedId, ...beverinoData });
            showToast(`Beverino aggiunto con successo (ID: ${savedId})`, 'success');
        }
        
        saveLocalData();
        loadAdminBeverini();
        resetBeverinoForm();
        
        loadBeverini();
        updateDashboardStats();
        
    } catch (error) {
        showToast('Errore nel salvataggio del beverino', 'error');
    }
}

function resetBeverinoForm() {
    document.getElementById('beverino-form').reset();
    document.getElementById('beverino-id').value = '';
}

async function deleteBeverino(id) {
    if (!confirm('Sei sicuro di voler eliminare questo beverino?')) return;
    
    try {
        await deleteFirebaseData('beverini', id);
        appData.beverini = appData.beverini.filter(b => b.id != id);
        
        saveLocalData();
        loadAdminBeverini();
        loadBeverini();
        updateDashboardStats();
        
        showToast('Beverino eliminato con successo', 'success');
        logActivity('Beverino eliminato');
    } catch (error) {
        showToast('Errore nell\'eliminazione del beverino', 'error');
    }
}

// News Admin
async function loadAdminNews() {
    const tbody = document.getElementById('news-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    appData.news.forEach(news => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${news.id}</td>
            <td>${news.titolo}</td>
            <td>${formatDate(news.data)}</td>
            <td>${news.categoria}</td>
            <td class="admin-item-actions">
                <button class="edit-btn" onclick="editNews('${news.id}')">Modifica</button>
                <button class="delete-btn" onclick="deleteNews('${news.id}')">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editNews(id) {
    const news = appData.news.find(n => n.id == id);
    if (!news) return;
    
    document.getElementById('news-id').value = news.id;
    document.getElementById('news-titolo').value = news.titolo || '';
    document.getElementById('news-contenuto').value = news.contenuto || '';
    document.getElementById('news-data').value = news.data || '';
    document.getElementById('news-categoria').value = news.categoria || '';
    document.getElementById('news-fonte').value = news.fonte || '';
    
    showAdminTab('news-admin');
}

async function saveNews(e) {
    e.preventDefault();
    
    const id = document.getElementById('news-id').value;
    const titolo = document.getElementById('news-titolo').value;
    const contenuto = document.getElementById('news-contenuto').value;
    const data = document.getElementById('news-data').value;
    const categoria = document.getElementById('news-categoria').value;
    const fonte = document.getElementById('news-fonte').value;
    
    const newsData = {
        titolo,
        contenuto,
        data,
        categoria,
        fonte,
        last_modified: new Date().toISOString()
    };
    
    try {
        let savedId;
        if (id) {
            savedId = await saveFirebaseData('news', { id, ...newsData }, true);
            const index = appData.news.findIndex(n => n.id == id);
            if (index !== -1) {
                appData.news[index] = { id, ...newsData };
            }
            showToast('News modificata con successo', 'success');
        } else {
            savedId = await saveFirebaseData('news', newsData, false);
            appData.news.push({ id: savedId, ...newsData });
            showToast(`News aggiunta con successo (ID: ${savedId})`, 'success');
        }
        
        saveLocalData();
        loadAdminNews();
        resetNewsForm();
        
        loadNews();
        updateDashboardStats();
        
    } catch (error) {
        showToast('Errore nel salvataggio della news', 'error');
    }
}

function resetNewsForm() {
    document.getElementById('news-form').reset();
    document.getElementById('news-id').value = '';
}

async function deleteNews(id) {
    if (!confirm('Sei sicuro di voler eliminare questa news?')) return;
    
    try {
        await deleteFirebaseData('news', id);
        appData.news = appData.news.filter(n => n.id != id);
        
        saveLocalData();
        loadAdminNews();
        loadNews();
        updateDashboardStats();
        
        showToast('News eliminata con successo', 'success');
        logActivity('News eliminata');
    } catch (error) {
        showToast('Errore nell\'eliminazione della news', 'error');
    }
}

// Import/Export Functions
function exportDataToExcel(type) {
    try {
        let data, filename, sheetName;

        switch(type) {
            case 'fontane':
                data = appData.fontane;
                filename = 'fontane_export.xlsx';
                sheetName = 'Fontane';
                break;
            case 'beverini':
                data = appData.beverini;
                filename = 'beverini_export.xlsx';
                sheetName = 'Beverini';
                break;
            case 'news':
                data = appData.news;
                filename = 'news_export.xlsx';
                sheetName = 'News';
                break;
        }

        const excelData = data.map(item => {
            const row = {};
            Object.keys(item).forEach(key => {
                if (key !== 'last_modified' && key !== 'id') {
                    row[key] = item[key];
                }
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        XLSX.writeFile(wb, filename);

        showToast(`Dati ${type} esportati in Excel con successo`, 'success');
        logActivity(`Dati ${type} esportati in Excel`);
    } catch (error) {
        showToast('Errore nell\'esportazione Excel', 'error');
    }
}

function exportAllDataToExcel() {
    try {
        const wb = XLSX.utils.book_new();

        const fontaneData = appData.fontane.map(item => {
            const row = {};
            Object.keys(item).forEach(key => {
                if (key !== 'last_modified' && key !== 'id') row[key] = item[key];
            });
            return row;
        });
        const fontaneWs = XLSX.utils.json_to_sheet(fontaneData);
        XLSX.utils.book_append_sheet(wb, fontaneWs, 'Fontane');

        const beveriniData = appData.beverini.map(item => {
            const row = {};
            Object.keys(item).forEach(key => {
                if (key !== 'last_modified' && key !== 'id') row[key] = item[key];
            });
            return row;
        });
        const beveriniWs = XLSX.utils.json_to_sheet(beveriniData);
        XLSX.utils.book_append_sheet(wb, beveriniWs, 'Beverini');

        const newsData = appData.news.map(item => {
            const row = {};
            Object.keys(item).forEach(key => {
                if (key !== 'last_modified' && key !== 'id') row[key] = item[key];
            });
            return row;
        });
        const newsWs = XLSX.utils.json_to_sheet(newsData);
        XLSX.utils.book_append_sheet(wb, newsWs, 'News');

        XLSX.writeFile(wb, 'fontane_beverini_complete_export.xlsx');

        showToast('Tutti i dati esportati in Excel con successo', 'success');
        logActivity('Tutti i dati esportati in Excel');
    } catch (error) {
        showToast('Errore nell\'esportazione Excel', 'error');
    }
}

function handleFileImport(type, files) {
    if (files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            if (type === 'all') {
                let importedCount = 0;

                if (workbook.SheetNames.includes('Fontane')) {
                    const fontaneSheet = workbook.Sheets['Fontane'];
                    const fontaneData = XLSX.utils.sheet_to_json(fontaneSheet);
                    importedCount += importFontane(fontaneData);
                }

                if (workbook.SheetNames.includes('Beverini')) {
                    const beveriniSheet = workbook.Sheets['Beverini'];
                    const beveriniData = XLSX.utils.sheet_to_json(beveriniSheet);
                    importedCount += importBeverini(beveriniData);
                }

                if (workbook.SheetNames.includes('News')) {
                    const newsSheet = workbook.Sheets['News'];
                    const newsData = XLSX.utils.sheet_to_json(newsSheet);
                    importedCount += importNews(newsData);
                }

                if (importedCount > 0) {
                    saveLocalData();
                    loadAdminFontane();
                    loadAdminBeverini();
                    loadAdminNews();
                    updateDashboardStats();
                    showToast(`${importedCount} elementi importati con successo`, 'success');
                    logActivity('Tutti i dati importati da Excel');
                } else {
                    showToast('Nessun dato valido trovato nel file', 'warning');
                }
            } else {
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);

                switch (type) {
                    case 'fontane':
                        importFontane(jsonData);
                        break;
                    case 'beverini':
                        importBeverini(jsonData);
                        break;
                    case 'news':
                        importNews(jsonData);
                        break;
                }
            }

            document.getElementById(`import-${type}-file`).value = '';
        } catch (error) {
            showToast('Errore nell\'importazione Excel', 'error');
        }
    };

    reader.readAsArrayBuffer(file);
}

function importFontane(data) {
    const newFontane = data.map((item, index) => ({
        nome: item.Nome || item.nome || '',
        indirizzo: item.Indirizzo || item.indirizzo || '',
        stato: item.Stato || item.stato || 'funzionante',
        anno: item.Anno || item.anno || '',
        descrizione: item.Descrizione || item.descrizione || '',
        storico: item.Storico || item.storico || '',
        latitudine: parseFloat(item.Latitudine) || parseFloat(item.latitudine) || 0,
        longitudine: parseFloat(item.Longitudine) || parseFloat(item.longitudine) || 0,
        immagine: item.Immagine || item.immagine || '',
        last_modified: new Date().toISOString()
    }));

    newFontane.forEach(async (fontana) => {
        try {
            const id = await saveFirebaseData('fontane', fontana, false);
            appData.fontane.push({ id, ...fontana });
        } catch (error) {
            console.error('Errore import fontana:', error);
        }
    });

    saveLocalData();
    loadAdminFontane();
    showToast(`${newFontane.length} fontane importate con successo!`, 'success');
    logActivity(`${newFontane.length} fontane importate da Excel`);

    return newFontane.length;
}

function importBeverini(data) {
    const newBeverini = data.map((item, index) => ({
        nome: item.Nome || item.nome || '',
        indirizzo: item.Indirizzo || item.indirizzo || '',
        stato: item.Stato || item.stato || 'funzionante',
        latitudine: parseFloat(item.Latitudine) || parseFloat(item.latitudine) || 0,
        longitudine: parseFloat(item.Longitudine) || parseFloat(item.longitudine) || 0,
        immagine: item.Immagine || item.immagine || '',
        last_modified: new Date().toISOString()
    }));

    newBeverini.forEach(async (beverino) => {
        try {
            const id = await saveFirebaseData('beverini', beverino, false);
            appData.beverini.push({ id, ...beverino });
        } catch (error) {
            console.error('Errore import beverino:', error);
        }
    });

    saveLocalData();
    loadAdminBeverini();
    showToast(`${newBeverini.length} beverini importati con successo!`, 'success');
    logActivity(`${newBeverini.length} beverini importati da Excel`);

    return newBeverini.length;
}

function importNews(data) {
    const newNews = data.map((item, index) => ({
        titolo: item.Titolo || item.titolo || '',
        contenuto: item.Contenuto || item.contenuto || '',
        data: item.Data || item.data || new Date().toISOString().split('T')[0],
        categoria: item.Categoria || item.categoria || '',
        fonte: item.Fonte || item.fonte || '',
        last_modified: new Date().toISOString()
    }));

    newNews.forEach(async (news) => {
        try {
            const id = await saveFirebaseData('news', news, false);
            appData.news.push({ id, ...news });
        } catch (error) {
            console.error('Errore import news:', error);
        }
    });

    saveLocalData();
    loadAdminNews();
    showToast(`${newNews.length} news importate con successo!`, 'success');
    logActivity(`${newNews.length} news importate da Excel`);

    return newNews.length;
}

function downloadTemplate(type) {
    let columns = [];
    let filename = '';
    let sheetName = '';

    switch (type) {
        case 'fontane':
            columns = [
                'Nome', 'Indirizzo', 'Stato', 'Anno', 'Descrizione',
                'Storico', 'Latitudine', 'Longitudine', 'Immagine'
            ];
            filename = 'template_fontane.xlsx';
            sheetName = 'Fontane';
            break;
        case 'beverini':
            columns = [
                'Nome', 'Indirizzo', 'Stato', 'Latitudine', 'Longitudine', 'Immagine'
            ];
            filename = 'template_beverini.xlsx';
            sheetName = 'Beverini';
            break;
        case 'news':
            columns = [
                'Titolo', 'Contenuto', 'Data', 'Categoria', 'Fonte'
            ];
            filename = 'template_news.xlsx';
            sheetName = 'News';
            break;
    }

    const ws = XLSX.utils.aoa_to_sheet([columns]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);

    showToast(`Template ${type} scaricato con successo`, 'success');
}

// Utility Functions
function showInfoModal(title, message) {
    document.getElementById('info-modal-title').textContent = title;
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'flex';
}

function closeInfoModal() {
    document.getElementById('info-modal').style.display = 'none';
}

function checkOnlineStatus() {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (!navigator.onLine) {
        offlineIndicator.style.display = 'block';
    } else {
        offlineIndicator.style.display = 'none';
    }
}

function handleUrlParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const fontanaId = urlParams.get('fontana');
    const beverinoId = urlParams.get('beverino');
    if (fontanaId) {
        showDetail(fontanaId, 'fontana');
    } else if (beverinoId) {
        showDetail(beverinoId, 'beverino');
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    // Load initial data
    loadLocalData();
    
    // Check online status
    checkOnlineStatus();
    
    // Show home screen
    showScreen('home-screen');
    
    // Handle URL parameters
    handleUrlParameters();
    
    // Load data from Firebase
    setTimeout(async () => {
        try {
            await loadFirebaseData('fontane');
            await loadFirebaseData('beverini');
            await loadFirebaseData('news');
            
            // Update UI if needed
            if (document.getElementById('fontane-list').innerHTML.includes('Caricamento')) {
                loadFontane();
            }
            if (document.getElementById('beverini-list').innerHTML.includes('Caricamento')) {
                loadBeverini();
            }
            if (document.getElementById('news-list').innerHTML.includes('Caricamento')) {
                loadNews();
            }
            
        } catch (error) {
            showToast('Utilizzo dati locali', 'info');
        }
    }, 1000);
    
    // Event listeners for authentication modal
    document.getElementById('admin-password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            checkAdminAuth();
        }
    });
    
    document.getElementById('admin-auth').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAdminAuth();
        }
    });
    
    // Online/offline events
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    
    // Image error handling
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            e.target.src = './images/sfondo-home.jpg';
        }
    }, true);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.getElementById('admin-panel').style.display === 'flex') {
            closeAdminPanel();
        }
    });
    
    // Close admin panel when clicking outside
    document.getElementById('admin-panel').addEventListener('click', function(e) {
        if (e.target === this) {
            closeAdminPanel();
        }
    });
    
    // Log app start
    logActivity('Applicazione avviata');
});