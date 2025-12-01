// App State
let appData = {
    fontane: [],
    beverini: [],
    news: []
};

let currentLatLng = null;
let currentDestination = null;
let screenHistory = ['home-screen'];
let userMarker = null;
let currentFilter = {
    fontane: 'all',
    beverini: 'all'
};
let map = null;
let clusterGroup = null;
let markers = new Map();
let searchResults = [];
let searchMarker = null;
let isAdminAuthenticated = false;
let adminAuthTimeout = null;

// Firebase Collections
const COLLECTIONS = {
    FONTANE: 'fontane',
    BEVERINI: 'beverini',
    NEWS: 'news'
};

// Firebase Initialization Check
function checkFirebase() {
    if (!window.firebase) {
        showToast('Firebase non inizializzato', 'error');
        return false;
    }
    return true;
}

// Firebase Data Operations
async function loadDataFromFirebase(type) {
    if (!checkFirebase()) return [];
    
    try {
        const collection = window.firebase.collection(window.firebase.db, COLLECTIONS[type.toUpperCase()]);
        const snapshot = await window.firebase.getDocs(collection);
        const data = [];
        
        snapshot.forEach(doc => {
            data.push({ id: doc.id, ...doc.data() });
        });
        
        appData[type] = data;
        saveDataToLocalStorage();
        
        return data;
    } catch (error) {
        console.error(`Errore nel caricamento ${type}:`, error);
        showToast(`Errore nel caricamento ${type}`, 'error');
        return loadDataFromLocalStorage(type);
    }
}

async function saveDataToFirebase(type, item) {
    if (!checkFirebase()) return null;
    
    try {
        const collection = window.firebase.collection(window.firebase.db, COLLECTIONS[type.toUpperCase()]);
        
        if (item.id) {
            // Update existing
            const docRef = window.firebase.doc(window.firebase.db, COLLECTIONS[type.toUpperCase()], item.id);
            await window.firebase.updateDoc(docRef, item);
            return item.id;
        } else {
            // Add new
            const docRef = await window.firebase.addDoc(collection, item);
            return docRef.id;
        }
    } catch (error) {
        console.error(`Errore nel salvataggio ${type}:`, error);
        showToast(`Errore nel salvataggio ${type}`, 'error');
        throw error;
    }
}

async function deleteDataFromFirebase(type, id) {
    if (!checkFirebase()) return false;
    
    try {
        const docRef = window.firebase.doc(window.firebase.db, COLLECTIONS[type.toUpperCase()], id);
        await window.firebase.deleteDoc(docRef);
        return true;
    } catch (error) {
        console.error(`Errore nell'eliminazione ${type}:`, error);
        showToast(`Errore nell'eliminazione ${type}`, 'error');
        return false;
    }
}

// Local Storage Fallback
function saveDataToLocalStorage() {
    try {
        localStorage.setItem('fontaneBeveriniData', JSON.stringify(appData));
    } catch (error) {
        console.error('Errore nel salvataggio locale:', error);
    }
}

function loadDataFromLocalStorage(type) {
    try {
        const savedData = localStorage.getItem('fontaneBeveriniData');
        if (savedData) {
            const data = JSON.parse(savedData);
            appData[type] = data[type] || [];
            return appData[type];
        }
    } catch (error) {
        console.error('Errore nel caricamento locale:', error);
    }
    return [];
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
    document.getElementById('admin-email').focus();
}

function closeAdminAuth() {
    document.getElementById('admin-auth').style.display = 'none';
    document.getElementById('auth-error').style.display = 'none';
}

async function checkAdminAuth() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('auth-error');

    try {
        await window.firebase.signInWithEmailAndPassword(window.firebase.auth, email, password);
        
        isAdminAuthenticated = true;
        closeAdminAuth();
        showAdminPanel();
        
        if (adminAuthTimeout) {
            clearTimeout(adminAuthTimeout);
        }
        adminAuthTimeout = setTimeout(() => {
            isAdminAuthenticated = false;
            showToast('Sessione amministratore scaduta', 'info');
            closeAdminPanel();
        }, 30 * 60 * 1000);
        
        showToast('Accesso amministratore riuscito', 'success');
        logActivity('Accesso amministratore effettuato');
    } catch (error) {
        errorElement.textContent = error.message;
        errorElement.style.display = 'block';
        showToast('Accesso fallito', 'error');
    }
}

function showAdminPanel() {
    document.getElementById('admin-panel').style.display = 'flex';
    document.querySelector('.admin-fab').style.display = 'flex';
    
    loadAdminFontane();
    loadAdminBeverini();
    loadAdminNews();
    updateDashboardStats();
}

function closeAdminPanel() {
    document.getElementById('admin-panel').style.display = 'none';
    document.querySelector('.admin-fab').style.display = 'none';
}

function logoutAdmin() {
    window.firebase.signOut(window.firebase.auth)
        .then(() => {
            isAdminAuthenticated = false;
            if (adminAuthTimeout) {
                clearTimeout(adminAuthTimeout);
                adminAuthTimeout = null;
            }
            closeAdminPanel();
            showToast('Logout effettuato', 'success');
            logActivity('Logout amministratore');
        })
        .catch(error => {
            showToast('Errore nel logout', 'error');
        });
}

// Screen Navigation
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
    hideAllNavigateButtons();
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
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeTab = document.querySelector(`.tab-btn[data-target="${activeScreen}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

function hideAllNavigateButtons() {
    document.querySelectorAll('.fixed-navigate-btn').forEach(btn => {
        btn.classList.add('hidden');
    });
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
    showSkeletonLoader(fontaneList);
    
    try {
        await loadDataFromFirebase('fontane');
        const filteredFontane = getFilteredItems('fontane');
        renderGridItems(fontaneList, filteredFontane, 'fontana');
    } catch (error) {
        showErrorState(fontaneList, 'fontane');
    }
}

async function loadBeverini() {
    const beveriniList = document.getElementById('beverini-list');
    showSkeletonLoader(beveriniList, 'compact');
    
    try {
        await loadDataFromFirebase('beverini');
        const filteredBeverini = getFilteredItems('beverini');
        renderCompactItems(beveriniList, filteredBeverini, 'beverino');
    } catch (error) {
        showErrorState(beveriniList, 'beverini');
    }
}

async function loadNews() {
    const newsList = document.getElementById('news-list');
    
    try {
        await loadDataFromFirebase('news');
        renderNewsItems(newsList, appData.news);
    } catch (error) {
        showErrorState(newsList, 'news');
    }
}

function getFilteredItems(type) {
    const items = appData[type];
    const filter = currentFilter[type];
    
    if (filter === 'all' || !filter) {
        return items;
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
        loadFontane();
    } else if (type === 'beverini') {
        loadBeverini();
    }
}

// Render Functions
function renderGridItems(container, items, type) {
    container.innerHTML = '';
    
    if (items.length === 0) {
        showEmptyState(container, type);
        return;
    }
    
    items.forEach(item => {
        const gridItem = createGridItem(item, type);
        container.appendChild(gridItem);
    });
}

function renderCompactItems(container, items, type) {
    container.innerHTML = '';
    
    if (items.length === 0) {
        showEmptyState(container, type);
        return;
    }
    
    items.forEach(item => {
        const compactItem = createCompactItem(item, type);
        container.appendChild(compactItem);
    });
}

function renderNewsItems(container, news) {
    container.innerHTML = '';
    
    if (news.length === 0) {
        showEmptyState(container, 'news');
        return;
    }
    
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

function createGridItem(item, type) {
    const gridItem = document.createElement('div');
    gridItem.className = 'grid-item';
    
    gridItem.onclick = () => {
        showDetail(item.id, type);
        currentLatLng = { lat: item.latitudine, lng: item.longitudine };
        document.getElementById(`${type}-detail-navigate-btn`).classList.remove('hidden');
    };
    
    const hasCustomImage = item.immagine && item.immagine.trim() !== '';
    gridItem.innerHTML = `
        <div class="item-image-container">
            <img src="${item.immagine || './images/sfondo-home.jpg'}" 
                 alt="${item.nome}" 
                 class="item-image"
                 onerror="this.src='./images/sfondo-home.jpg'">
        </div>
        <div class="item-content">
            <div class="item-name">${item.nome}</div>
            <div class="item-address">${item.indirizzo}</div>
            <div class="item-footer">
                <span class="item-status status-${item.stato}">${getStatusText(item.stato)}</span>
                <span class="image-indicator ${hasCustomImage ? 'image-custom' : 'image-default'}">
                    ${hasCustomImage ? '<i class="fas fa-check"></i>' : '<i class="fas fa-image"></i>'}
                </span>
            </div>
        </div>
    `;
    
    return gridItem;
}

function createCompactItem(item, type) {
    const compactItem = document.createElement('div');
    compactItem.className = 'compact-item';
    
    const totalLength = (item.nome || '').length + (item.indirizzo || '').length;
    if (totalLength > 100) compactItem.classList.add('very-long-content');
    else if (totalLength > 60) compactItem.classList.add('long-content');
    
    compactItem.onclick = () => {
        showDetail(item.id, type);
        currentLatLng = { lat: item.latitudine, lng: item.longitudine };
        document.getElementById(`${type}-detail-navigate-btn`).classList.remove('hidden');
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
    
    return compactItem;
}

function showDetail(id, type) {
    let item, screenId, titleElement, contentElement;
    
    if (type === 'fontana') {
        item = appData.fontane.find(f => f.id === id);
        screenId = 'fontana-detail-screen';
        titleElement = document.getElementById('fontana-detail-title');
        contentElement = document.getElementById('fontana-detail-content');
    } else {
        item = appData.beverini.find(b => b.id === id);
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
    
    document.getElementById(`${type}-detail-navigate-btn`).classList.remove('hidden');
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
        <img src="${item.immagine || './images/sfondo-home.jpg'}" 
             class="detail-image" 
             alt="${item.nome}"
             onerror="this.src='./images/sfondo-home.jpg'">
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
            <button class="detail-action-btn secondary" onclick="shareItem(${item.id}, '${type}')">
                <i class="fas fa-share-alt"></i> Condividi
            </button>
        </div>
    `;
}

// Search and Filter
const debouncedFilter = debounce(function(type, query) {
    const container = document.getElementById(`${type}-list`);
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
            name = items[i].getElementsByClassName('compact-item-name')[0]?.textContent || '';
            address = items[i].getElementsByClassName('compact-item-address')[0]?.textContent || '';
        } else {
            name = items[i].getElementsByClassName('item-name')[0]?.textContent || '';
            address = items[i].getElementsByClassName('item-address')[0]?.textContent || '';
        }
        
        const searchText = (name + address).toLowerCase();
        const isVisible = searchText.includes(query.toLowerCase());
        
        items[i].style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount++;
    }
    
    if (visibleCount === 0 && query) {
        showEmptySearchState(container);
    }
}, 300);

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
            const marker = createMapMarker(fontana, 'fontana');
            markers.set(`fontana-${fontana.id}`, marker);
            clusterGroup.addLayer(marker);
        }
    });
    
    appData.beverini.forEach(beverino => {
        if (isValidCoordinate(beverino.latitudine, beverino.longitudine)) {
            const marker = createMapMarker(beverino, 'beverino');
            markers.set(`beverino-${beverino.id}`, marker);
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

function createMapMarker(item, type) {
    const icon = getIconForType(type);
    const marker = L.marker([item.latitudine, item.longitudine], { icon });
    
    marker.bindPopup(`
        <div class="leaflet-popup-content">
            <div class="popup-title">${item.nome}</div>
            <p>${item.indirizzo}</p>
            <p>Stato: ${getStatusText(item.stato)}</p>
            <button class="popup-btn" onclick="showDetail('${item.id}', '${type}')">Dettagli</button>
            <button class="popup-btn" onclick="navigateTo(${item.latitudine}, ${item.longitudine})" 
                    style="margin-top: 5px; background: var(--primary-green);">
                Naviga
            </button>
        </div>
    `);
    
    return marker;
}

// Helper Functions
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
    try {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('it-IT', options);
    } catch (error) {
        return dateString;
    }
}

function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    let icon = 'info-circle';
    let background = 'var(--primary-blue)';
    
    switch(type) {
        case 'error':
            icon = 'exclamation-triangle';
            background = 'var(--primary-red)';
            break;
        case 'success':
            icon = 'check-circle';
            background = 'var(--primary-green)';
            break;
    }
    
    toast.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
    toast.style.background = background;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function logActivity(description) {
    console.log(`[Activity] ${description} - ${new Date().toLocaleString()}`);
}

function updateDashboardStats() {
    const totalFontane = appData.fontane.length;
    const fontaneFunzionanti = appData.fontane.filter(f => f.stato === 'funzionante').length;
    const fontaneNonFunzionanti = appData.fontane.filter(f => f.stato === 'non-funzionante').length;
    const fontaneManutenzione = appData.fontane.filter(f => f.stato === 'manutenzione').length;
    
    document.getElementById('total-fontane').textContent = totalFontane;
    document.getElementById('fontane-funzionanti').textContent = fontaneFunzionanti;
    document.getElementById('fontane-non-funzionanti').textContent = fontaneNonFunzionanti;
    document.getElementById('fontane-manutenzione').textContent = fontaneManutenzione;
    
    const totalBeverini = appData.beverini.length;
    const beveriniFunzionanti = appData.beverini.filter(b => b.stato === 'funzionante').length;
    const beveriniNonFunzionanti = appData.beverini.filter(b => b.stato === 'non-funzionante').length;
    const beveriniManutenzione = appData.beverini.filter(b => b.stato === 'manutenzione').length;
    
    document.getElementById('total-beverini').textContent = totalBeverini;
    document.getElementById('beverini-funzionanti').textContent = beveriniFunzionanti;
    document.getElementById('beverini-non-funzionanti').textContent = beveriniNonFunzionanti;
    document.getElementById('beverini-manutenzione').textContent = beveriniManutenzione;
    
    document.getElementById('total-news').textContent = appData.news.length;
}

// Skeleton Loader
function showSkeletonLoader(container, type = 'grid') {
    container.innerHTML = '';
    
    for (let i = 0; i < 6; i++) {
        if (type === 'compact') {
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
        } else {
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
}

function showEmptyState(container, type) {
    const typeNames = {
        fontane: 'fontane',
        fontana: 'fontane',
        beverini: 'beverini',
        beverino: 'beverini',
        news: 'news'
    };
    
    const typeName = typeNames[type] || type;
    const icons = {
        fontane: 'monument',
        beverini: 'faucet',
        news: 'newspaper'
    };
    
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-${icons[typeName] || 'search'}"></i></div>
            <div class="empty-state-text">Nessun ${typeName} disponibile</div>
            <div class="empty-state-subtext">${currentFilter[typeName] !== 'all' ? 'Prova a cambiare filtro' : 'Aggiungi tramite il pannello di controllo'}</div>
        </div>
    `;
}

function showEmptySearchState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-search"></i></div>
            <div class="empty-state-text">Nessun risultato trovato</div>
            <div class="empty-state-subtext">Prova a modificare i termini di ricerca</div>
        </div>
    `;
}

function showErrorState(container, type) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon"><i class="fas fa-exclamation-triangle"></i></div>
            <div class="empty-state-text">Errore nel caricamento</div>
            <div class="empty-state-subtext">Verifica la connessione o riprova più tardi</div>
        </div>
    `;
}

// Navigation
function navigateTo(lat, lng) {
    currentDestination = { lat, lng };
    document.getElementById('navigation-modal').style.display = 'flex';
}

function navigateToFixed() {
    if (!currentLatLng) return;
    navigateTo(currentLatLng.lat, currentLatLng.lng);
}

function openGoogleMaps() {
    if (!currentDestination) return;
    const { lat, lng } = currentDestination;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    window.open(url, '_blank');
    closeNavigationModal();
    showToast('Apertura Google Maps...', 'info');
}

function openAppleMaps() {
    if (!currentDestination) return;
    const { lat, lng } = currentDestination;
    const url = `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`;
    window.open(url, '_blank');
    closeNavigationModal();
    showToast('Apertura Apple Maps...', 'info');
}

function closeNavigationModal() {
    document.getElementById('navigation-modal').style.display = 'none';
    currentDestination = null;
}

// Admin Panel Functions
function loadAdminFontane() {
    const tbody = document.getElementById('fontane-table-body');
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
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editFontana(id) {
    const fontana = appData.fontane.find(f => f.id === id);
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
    const latitudine = parseFloat(document.getElementById('fontana-latitudine').value) || 0;
    const longitudine = parseFloat(document.getElementById('fontana-longitudine').value) || 0;
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
        if (id) {
            // Update existing
            await saveDataToFirebase('fontane', { ...fontanaData, id });
            
            const index = appData.fontane.findIndex(f => f.id === id);
            if (index !== -1) {
                appData.fontane[index] = { ...fontanaData, id };
            }
            
            showToast('Fontana modificata con successo', 'success');
        } else {
            // Add new
            const newId = await saveDataToFirebase('fontane', fontanaData);
            appData.fontane.push({ ...fontanaData, id: newId });
            showToast('Fontana aggiunta con successo', 'success');
        }
        
        saveDataToLocalStorage();
        loadAdminFontane();
        loadFontane();
        resetFontanaForm();
        updateDashboardStats();
    } catch (error) {
        showToast('Errore nel salvataggio della fontana', 'error');
    }
}

function resetFontanaForm() {
    document.getElementById('fontana-form').reset();
    document.getElementById('fontana-id').value = '';
}

function loadAdminBeverini() {
    const tbody = document.getElementById('beverini-table-body');
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
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editBeverino(id) {
    const beverino = appData.beverini.find(b => b.id === id);
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
    const latitudine = parseFloat(document.getElementById('beverino-latitudine').value) || 0;
    const longitudine = parseFloat(document.getElementById('beverino-longitudine').value) || 0;
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
        if (id) {
            // Update existing
            await saveDataToFirebase('beverini', { ...beverinoData, id });
            
            const index = appData.beverini.findIndex(b => b.id === id);
            if (index !== -1) {
                appData.beverini[index] = { ...beverinoData, id };
            }
            
            showToast('Beverino modificato con successo', 'success');
        } else {
            // Add new
            const newId = await saveDataToFirebase('beverini', beverinoData);
            appData.beverini.push({ ...beverinoData, id: newId });
            showToast('Beverino aggiunto con successo', 'success');
        }
        
        saveDataToLocalStorage();
        loadAdminBeverini();
        loadBeverini();
        resetBeverinoForm();
        updateDashboardStats();
    } catch (error) {
        showToast('Errore nel salvataggio del beverino', 'error');
    }
}

function resetBeverinoForm() {
    document.getElementById('beverino-form').reset();
    document.getElementById('beverino-id').value = '';
}

function loadAdminNews() {
    const tbody = document.getElementById('news-table-body');
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
            </td>
        `;
        tbody.appendChild(row);
    });
}

function editNews(id) {
    const news = appData.news.find(n => n.id === id);
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
        if (id) {
            // Update existing
            await saveDataToFirebase('news', { ...newsData, id });
            
            const index = appData.news.findIndex(n => n.id === id);
            if (index !== -1) {
                appData.news[index] = { ...newsData, id };
            }
            
            showToast('News modificata con successo', 'success');
        } else {
            // Add new
            const newId = await saveDataToFirebase('news', newsData);
            appData.news.push({ ...newsData, id: newId });
            showToast('News aggiunta con successo', 'success');
        }
        
        saveDataToLocalStorage();
        loadAdminNews();
        loadNews();
        resetNewsForm();
        updateDashboardStats();
    } catch (error) {
        showToast('Errore nel salvataggio della news', 'error');
    }
}

function resetNewsForm() {
    document.getElementById('news-form').reset();
    document.getElementById('news-id').value = '';
}

// Export/Import Functions
function exportToCSV(type) {
    const data = appData[type];
    if (!data || data.length === 0) {
        showToast(`Nessun dato da esportare per ${type}`, 'warning');
        return;
    }
    
    const headers = Object.keys(data[0]).filter(key => key !== 'id' && key !== 'last_modified');
    const csvRows = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const cell = row[header] || '';
                return JSON.stringify(cell);
            }).join(',')
        )
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    a.href = url;
    a.download = `${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast(`Dati ${type} esportati in CSV`, 'success');
}

function importFromCSV(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const csvText = e.target.result;
            const rows = csvText.split('\n');
            const headers = rows[0].split(',').map(h => h.replace(/"/g, ''));
            
            let type = 'fontane';
            if (headers.includes('titolo')) type = 'news';
            else if (headers.includes('descrizione')) type = 'fontane';
            else type = 'beverini';
            
            for (let i = 1; i < rows.length; i++) {
                if (!rows[i].trim()) continue;
                
                const values = rows[i].split(',').map(v => v.replace(/"/g, ''));
                const item = {};
                
                headers.forEach((header, index) => {
                    item[header] = values[index] || '';
                });
                
                // Convert numeric fields
                if (item.latitudine) item.latitudine = parseFloat(item.latitudine);
                if (item.longitudine) item.longitudine = parseFloat(item.longitudine);
                
                item.last_modified = new Date().toISOString();
                
                try {
                    await saveDataToFirebase(type, item);
                } catch (error) {
                    console.error('Errore nell\'importazione riga', i, error);
                }
            }
            
            // Reload data
            await loadDataFromFirebase(type);
            
            if (type === 'fontane') {
                loadAdminFontane();
                loadFontane();
            } else if (type === 'beverini') {
                loadAdminBeverini();
                loadBeverini();
            } else if (type === 'news') {
                loadAdminNews();
                loadNews();
            }
            
            updateDashboardStats();
            showToast('Importazione CSV completata', 'success');
        } catch (error) {
            showToast('Errore nell\'importazione CSV', 'error');
            console.error('Errore CSV:', error);
        }
    };
    
    reader.readAsText(file);
}

// Location Functions
function getCurrentLocationCoordinatesOnly(type) {
    showToast('Rilevamento coordinate in corso...', 'info');
    
    if (!navigator.geolocation) {
        showToast('Geolocalizzazione non supportata', 'error');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            document.getElementById(`${type}-latitudine`).value = lat.toFixed(6);
            document.getElementById(`${type}-longitudine`).value = lng.toFixed(6);
            
            showToast('Coordinate rilevate!', 'success');
        },
        error => {
            handleGeolocationError(error);
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

async function getCurrentLocationWithAddress(type) {
    showToast('Rilevamento posizione...', 'info');
    
    if (!navigator.geolocation) {
        showToast('Geolocalizzazione non supportata', 'error');
        return;
    }
    
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 15000
            });
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
            } else {
                document.getElementById(`${type}-indirizzo`).value = `Coordinate: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
                showToast('Posizione rilevata', 'warning');
            }
        } catch {
            document.getElementById(`${type}-indirizzo`).value = `Coordinate: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            showToast('Posizione rilevata', 'warning');
        }
    } catch (error) {
        handleGeolocationError(error);
    }
}

function handleGeolocationError(error) {
    let message = 'Errore nel rilevamento posizione';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Autorizzazione alla geolocalizzazione negata';
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Posizione non disponibile';
            break;
        case error.TIMEOUT:
            message = 'Timeout nel rilevamento';
            break;
    }
    
    showToast(message, 'error');
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
        
        if (!response.ok) throw new Error('Nominatim non disponibile');
        
        const data = await response.json();
        if (data && data.display_name) {
            return data.display_name;
        }
    } catch (error) {
        console.error('Reverse geocode error:', error);
    }
    
    return null;
}

// Map Search Functions
async function searchAddressOnMap(query) {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=it`,
            {
                headers: {
                    'User-Agent': 'FontaneBeveriniNapoli/1.0'
                }
            }
        );
        
        return await response.json();
    } catch (error) {
        showToast('Errore nella ricerca', 'error');
        return [];
    }
}

function performMapSearch() {
    const query = document.getElementById('map-search-input').value.trim();
    if (!query) return;
    
    searchAddressOnMap(query).then(results => {
        displaySearchResults(results);
    });
}

function displaySearchResults(results) {
    const container = document.getElementById('map-search-results');
    
    if (results.length === 0) {
        container.innerHTML = '<div class="search-result-item">Nessun risultato trovato</div>';
        container.style.display = 'block';
        return;
    }
    
    searchResults = results;
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
        .bindPopup(result.display_name)
        .openPopup();
    
    map.setView([result.lat, result.lon], 16);
    document.getElementById('map-search-results').style.display = 'none';
}

function handleMapSearch(event) {
    if (event.key === 'Enter') {
        performMapSearch();
    }
}

function setupSearchAutocomplete() {
    const searchInput = document.getElementById('map-search-input');
    let searchTimeout;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const query = this.value.trim();
        
        if (query.length < 3) {
            document.getElementById('map-search-results').style.display = 'none';
            return;
        }
        
        searchTimeout = setTimeout(() => {
            searchAddressOnMap(query).then(results => {
                displaySearchResults(results);
            });
        }, 500);
    });
    
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.map-search-container')) {
            document.getElementById('map-search-results').style.display = 'none';
        }
    });
}

// Map Controls
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
    if (!navigator.geolocation) {
        showToast('Geolocalizzazione non supportata', 'error');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        position => {
            const { latitude, longitude } = position.coords;
            
            if (userMarker) {
                map.removeLayer(userMarker);
            }
            
            userMarker = L.marker([latitude, longitude], {
                icon: L.icon({
                    iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(map).bindPopup('La tua posizione');
            
            map.setView([latitude, longitude], 16);
            showToast('Posizione corrente visualizzata', 'success');
        },
        handleGeolocationError,
        { enableHighAccuracy: true, timeout: 10000 }
    );
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
            iconAnchor: [12, 41]
        },
        beverino: {
            iconUrl: 'https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41]
        }
    };
    
    return L.icon(iconConfigs[type] || iconConfigs.fontana);
}

// Share Function
function shareItem(id, type) {
    let item;
    if (type === 'fontana') {
        item = appData.fontane.find(f => f.id === id);
    } else {
        item = appData.beverini.find(b => b.id === id);
    }
    
    if (!item) {
        showToast('Elemento non trovato', 'error');
        return;
    }
    
    const text = `${item.nome} - ${item.indirizzo}`;
    const url = window.location.href;
    
    if (navigator.share) {
        navigator.share({
            title: item.nome,
            text: text,
            url: url
        }).catch(() => {
            copyToClipboard(`${text} - ${url}`);
        });
    } else {
        copyToClipboard(`${text} - ${url}`);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
        .then(() => showToast('Link copiato negli appunti', 'success'))
        .catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Link copiato negli appunti', 'success');
        });
}

// Info Modal
function showInfoModal(title, message) {
    document.getElementById('info-modal-title').textContent = title;
    document.getElementById('info-modal-message').textContent = message;
    document.getElementById('info-modal').style.display = 'flex';
}

function closeInfoModal() {
    document.getElementById('info-modal').style.display = 'none';
}

// Admin Tab Management
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
    
    const tabBtn = document.querySelector(`.admin-tab-btn[data-tab="${tabId}"]`);
    const tabContent = document.getElementById(tabId);
    
    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');
}

// Event Listeners
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

document.getElementById('admin-panel').addEventListener('click', function(e) {
    if (e.target === this) {
        closeAdminPanel();
    }
});

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase auth state listener
    window.firebase.onAuthStateChanged(window.firebase.auth, (user) => {
        if (user) {
            isAdminAuthenticated = true;
            document.querySelector('.admin-fab').style.display = 'flex';
        } else {
            isAdminAuthenticated = false;
            document.querySelector('.admin-fab').style.display = 'none';
        }
    });
    
    // Check online status
    checkOnlineStatus();
    window.addEventListener('online', checkOnlineStatus);
    window.addEventListener('offline', checkOnlineStatus);
    
    // Handle URL parameters
    handleUrlParameters();
    
    // Load initial data
    Promise.all([
        loadDataFromFirebase('fontane'),
        loadDataFromFirebase('beverini'),
        loadDataFromFirebase('news')
    ]).then(() => {
        showScreen('home-screen');
        showToast('Dati caricati con successo', 'success');
    }).catch(error => {
        console.error('Errore nel caricamento iniziale:', error);
        showScreen('home-screen');
        showToast('Utilizzo dati locali', 'info');
    });
    
    // Setup image error handling
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            e.target.src = './images/sfondo-home.jpg';
        }
    }, true);
    
    // Escape key handler
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            if (document.getElementById('admin-panel').style.display === 'flex') {
                closeAdminPanel();
            }
            if (document.getElementById('admin-auth').style.display === 'flex') {
                closeAdminAuth();
            }
            if (document.getElementById('navigation-modal').style.display === 'flex') {
                closeNavigationModal();
            }
            if (document.getElementById('info-modal').style.display === 'flex') {
                closeInfoModal();
            }
        }
    });
    
    // Log app start
    logActivity('Applicazione avviata');
});

function checkOnlineStatus() {
    const offlineIndicator = document.getElementById('offline-indicator');
    if (!navigator.onLine) {
        offlineIndicator.style.display = 'block';
        showToast('Connessione internet assente', 'warning');
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

// Make functions globally available
window.showScreen = showScreen;
window.goBack = goBack;
window.navigateTo = navigateTo;
window.navigateToFixed = navigateToFixed;
window.openGoogleMaps = openGoogleMaps;
window.openAppleMaps = openAppleMaps;
window.closeNavigationModal = closeNavigationModal;
window.openAdminPanel = openAdminPanel;
window.checkAdminAuth = checkAdminAuth;
window.closeAdminAuth = closeAdminAuth;
window.closeAdminPanel = closeAdminPanel;
window.showAdminTab = showAdminTab;
window.setFilter = setFilter;
window.debouncedFilter = debouncedFilter;
window.getCurrentLocationCoordinatesOnly = getCurrentLocationCoordinatesOnly;
window.getCurrentLocationWithAddress = getCurrentLocationWithAddress;
window.handleMapSearch = handleMapSearch;
window.performMapSearch = performMapSearch;
window.selectSearchResult = selectSearchResult;
window.editFontana = editFontana;
window.saveFontana = saveFontana;
window.resetFontanaForm = resetFontanaForm;
window.editBeverino = editBeverino;
window.saveBeverino = saveBeverino;
window.resetBeverinoForm = resetBeverinoForm;
window.editNews = editNews;
window.saveNews = saveNews;
window.resetNewsForm = resetNewsForm;
window.exportToCSV = exportToCSV;
window.importFromCSV = importFromCSV;
window.shareItem = shareItem;
window.requestUserLocation = requestUserLocation;
window.fitMapToMarkers = fitMapToMarkers;
window.closeInfoModal = closeInfoModal;
window.logoutAdmin = logoutAdmin;