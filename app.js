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
let currentFilter = { fontane: 'all', beverini: 'all' };
let map = null;
let clusterGroup = null;
let markers = new Map();
let searchResults = [];
let searchMarker = null;
let isAdminAuthenticated = false;
let adminAuthTimeout = null;

// Gestione Sequenza Segreta
let secretSequence = [];
const correctSequence = ['logo', 'title', 'logo'];

// Firebase Collections Names
const COLLECTIONS = {
    FONTANE: 'fontane',
    BEVERINI: 'beverini',
    NEWS: 'news'
};

// Check Firebase Initialization
function checkFirebase() {
    if (!window.firebase) {
        showToast('Firebase non inizializzato', 'error');
        return false;
    }
    return true;
}

// ------------------------------------------
// DATA OPERATIONS (CRUD)
// ------------------------------------------

async function loadDataFromFirebase(type) {
    if (!checkFirebase()) return [];
    try {
        const collection = window.firebase.collection(window.firebase.db, COLLECTIONS[type.toUpperCase()]);
        const snapshot = await window.firebase.getDocs(collection);
        const data = [];
        snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
        appData[type] = data;
        saveDataToLocalStorage();
        return data;
    } catch (error) {
        console.error(`Errore caricamento ${type}:`, error);
        return loadDataFromLocalStorage(type);
    }
}

async function saveDataToFirebase(type, item) {
    if (!checkFirebase()) return null;
    try {
        const collection = window.firebase.collection(window.firebase.db, COLLECTIONS[type.toUpperCase()]);
        if (item.id) {
            const docRef = window.firebase.doc(window.firebase.db, COLLECTIONS[type.toUpperCase()], item.id);
            await window.firebase.updateDoc(docRef, item);
            return item.id;
        } else {
            const docRef = await window.firebase.addDoc(collection, item);
            return docRef.id;
        }
    } catch (error) {
        showToast(`Errore salvataggio ${type}`, 'error');
        throw error;
    }
}

async function deleteDataFromFirebase(type, id) {
    if (!checkFirebase()) return false;
    try {
        const docRef = window.firebase.doc(window.firebase.db, COLLECTIONS[type.toUpperCase()], id);
        await window.firebase.deleteDoc(docRef);
        
        // Update local state
        appData[type] = appData[type].filter(item => item.id !== id);
        
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
        return true;
    } catch (error) {
        showToast('Errore durante l\'eliminazione', 'error');
        return false;
    }
}

function saveDataToLocalStorage() {
    localStorage.setItem('fontaneBeveriniData', JSON.stringify(appData));
}

function loadDataFromLocalStorage(type) {
    const saved = localStorage.getItem('fontaneBeveriniData');
    if (saved) {
        const parsed = JSON.parse(saved);
        appData[type] = parsed[type] || [];
        return appData[type];
    }
    return [];
}

// ------------------------------------------
// ADMIN & AUTHENTICATION
// ------------------------------------------

// Logic per la Sequenza Segreta (Logo -> Title -> Logo)
function handleSecretSequence(elementType) {
    secretSequence.push(elementType);

    if (secretSequence.length === 3 &&
        secretSequence[0] === correctSequence[0] &&
        secretSequence[1] === correctSequence[1] &&
        secretSequence[2] === correctSequence[2]) {
        showAdminAuth();
        secretSequence = [];
    } else if (secretSequence.length >= 3) {
        setTimeout(() => { secretSequence = []; }, 1000);
    }
}

function showAdminAuth() {
    document.getElementById('admin-auth').style.display = 'flex';
    document.getElementById('admin-password').focus();
}

function closeAdminAuth() {
    document.getElementById('admin-auth').style.display = 'none';
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('admin-password').value = '';
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
        showToast('Accesso amministratore riuscito', 'success');
    } catch (error) {
        errorElement.style.display = 'block';
        showToast('Credenziali errate', 'error');
    }
}

function openAdminPanel() {
    if (isAdminAuthenticated) showAdminPanel();
    else showAdminAuth();
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
}

function logoutAdmin() {
    window.firebase.signOut(window.firebase.auth).then(() => {
        isAdminAuthenticated = false;
        closeAdminPanel();
        document.querySelector('.admin-fab').style.display = 'none';
        showToast('Logout effettuato', 'success');
    });
}

// ------------------------------------------
// CSV EXPORT / IMPORT (ROBUST)
// ------------------------------------------

function exportToCSV(type) {
    const data = appData[type];
    if (!data || data.length === 0) {
        showToast(`Nessun dato per ${type}`, 'warning');
        return;
    }
    
    const headers = Object.keys(data[0]).filter(k => k !== 'id');
    const csvContent = [
        headers.join(','),
        ...data.map(row => headers.map(fieldName => {
            let value = row[fieldName] || '';
            // Gestione virgole nel contenuto: racchiudi in virgolette
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                value = `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}_export_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    showToast(`${type} esportati con successo`, 'success');
}

function importFromCSV(files) {
    if (!files.length) return;
    const file = files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n');
        const headers = rows[0].split(',').map(h => h.trim());
        
        let type = 'fontane';
        if (headers.includes('titolo')) type = 'news';
        else if (!headers.includes('descrizione')) type = 'beverini';
        
        let count = 0;
        
        // Regex per splittare CSV rispettando le virgolette
        const csvRegex = /(?:,|^)(?:"([^"]*)"|([^",]*))/g;

        for (let i = 1; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            
            const matches = [...rows[i].matchAll(csvRegex)].map(m => m[1] || m[2] || '');
            // Rimuovi il primo match vuoto se presente (artefatto della regex)
            const values = matches.slice(0, headers.length);

            const item = {};
            headers.forEach((h, index) => {
                let val = values[index];
                if (val) val = val.trim();
                item[h] = val;
            });
            
            // Convert numeric coordinates
            if (item.latitudine) item.latitudine = parseFloat(item.latitudine);
            if (item.longitudine) item.longitudine = parseFloat(item.longitudine);
            item.last_modified = new Date().toISOString();
            
            try {
                await saveDataToFirebase(type, item);
                count++;
            } catch (err) { console.error('Errore riga CSV', i); }
        }
        
        // Reload
        await loadDataFromFirebase(type);
        if (type === 'fontane') { loadAdminFontane(); loadFontane(); }
        else if (type === 'beverini') { loadAdminBeverini(); loadBeverini(); }
        else { loadAdminNews(); loadNews(); }
        
        updateDashboardStats();
        showToast(`${count} elementi importati in ${type}`, 'success');
        document.getElementById('import-csv-file').value = ''; // Reset input
    };
    reader.readAsText(file);
}

// ------------------------------------------
// UI & NAVIGATION
// ------------------------------------------

function showScreen(screenId) {
    if (screenHistory[screenHistory.length - 1] !== screenId) {
        screenHistory.push(screenId);
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    updateTabBar(screenId);
    window.scrollTo(0, 0);
    
    if (screenId === 'mappa-screen') setTimeout(initMappa, 100);
    if (screenId === 'fontane-screen') loadFontane();
    if (screenId === 'beverini-screen') loadBeverini();
    if (screenId === 'news-screen') loadNews();
}

function goBack() {
    if (screenHistory.length > 1) {
        screenHistory.pop();
        showScreen(screenHistory[screenHistory.length - 1]);
    } else {
        showScreen('home-screen');
    }
}

function updateTabBar(activeScreen) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-target="${activeScreen}"]`);
    if (btn) btn.classList.add('active');
}

// ------------------------------------------
// ADMIN UI FUNCTIONS
// ------------------------------------------

function loadAdminFontane() {
    const tbody = document.getElementById('fontane-table-body');
    tbody.innerHTML = '';
    appData.fontane.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${f.nome}</td><td><button class="edit-btn" onclick="editFontana('${f.id}')">✏️</button> <button class="delete-btn" onclick="deleteItem('fontane', '${f.id}')">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function loadAdminBeverini() {
    const tbody = document.getElementById('beverini-table-body');
    tbody.innerHTML = '';
    appData.beverini.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${b.nome}</td><td><button class="edit-btn" onclick="editBeverino('${b.id}')">✏️</button> <button class="delete-btn" onclick="deleteItem('beverini', '${b.id}')">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function loadAdminNews() {
    const tbody = document.getElementById('news-table-body');
    tbody.innerHTML = '';
    appData.news.forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${n.titolo}</td><td><button class="edit-btn" onclick="editNews('${n.id}')">✏️</button> <button class="delete-btn" onclick="deleteItem('news', '${n.id}')">🗑️</button></td>`;
        tbody.appendChild(tr);
    });
}

function deleteItem(type, id) {
    if (confirm('Sei sicuro di voler eliminare questo elemento?')) {
        deleteDataFromFirebase(type, id);
    }
}

function editFontana(id) {
    const item = appData.fontane.find(f => f.id === id);
    if (!item) return;
    document.getElementById('fontana-id').value = item.id;
    document.getElementById('fontana-nome').value = item.nome;
    document.getElementById('fontana-indirizzo').value = item.indirizzo;
    document.getElementById('fontana-stato').value = item.stato;
    document.getElementById('fontana-latitudine').value = item.latitudine;
    document.getElementById('fontana-longitudine').value = item.longitudine;
    document.getElementById('fontana-anno').value = item.anno || '';
    document.getElementById('fontana-descrizione').value = item.descrizione || '';
    document.getElementById('fontana-storico').value = item.storico || '';
    document.getElementById('fontana-immagine').value = item.immagine || '';
}

function editBeverino(id) {
    const item = appData.beverini.find(b => b.id === id);
    if (!item) return;
    document.getElementById('beverino-id').value = item.id;
    document.getElementById('beverino-nome').value = item.nome;
    document.getElementById('beverino-indirizzo').value = item.indirizzo;
    document.getElementById('beverino-stato').value = item.stato;
    document.getElementById('beverino-latitudine').value = item.latitudine;
    document.getElementById('beverino-longitudine').value = item.longitudine;
    document.getElementById('beverino-immagine').value = item.immagine || '';
}

function editNews(id) {
    const item = appData.news.find(n => n.id === id);
    if (!item) return;
    document.getElementById('news-id').value = item.id;
    document.getElementById('news-titolo').value = item.titolo;
    document.getElementById('news-contenuto').value = item.contenuto;
    document.getElementById('news-data').value = item.data;
    document.getElementById('news-categoria').value = item.categoria;
    document.getElementById('news-fonte').value = item.fonte;
}

// Generic Save Functions
async function saveFontana(e) {
    e.preventDefault();
    const id = document.getElementById('fontana-id').value;
    const item = {
        nome: document.getElementById('fontana-nome').value,
        indirizzo: document.getElementById('fontana-indirizzo').value,
        stato: document.getElementById('fontana-stato').value,
        latitudine: parseFloat(document.getElementById('fontana-latitudine').value),
        longitudine: parseFloat(document.getElementById('fontana-longitudine').value),
        anno: document.getElementById('fontana-anno').value,
        descrizione: document.getElementById('fontana-descrizione').value,
        storico: document.getElementById('fontana-storico').value,
        immagine: document.getElementById('fontana-immagine').value,
        last_modified: new Date().toISOString()
    };
    if(id) item.id = id;
    await saveDataToFirebase('fontane', item);
    loadAdminFontane();
    loadFontane();
    resetFontanaForm();
    showToast('Fontana salvata', 'success');
}

async function saveBeverino(e) {
    e.preventDefault();
    const id = document.getElementById('beverino-id').value;
    const item = {
        nome: document.getElementById('beverino-nome').value,
        indirizzo: document.getElementById('beverino-indirizzo').value,
        stato: document.getElementById('beverino-stato').value,
        latitudine: parseFloat(document.getElementById('beverino-latitudine').value),
        longitudine: parseFloat(document.getElementById('beverino-longitudine').value),
        immagine: document.getElementById('beverino-immagine').value,
        last_modified: new Date().toISOString()
    };
    if(id) item.id = id;
    await saveDataToFirebase('beverini', item);
    loadAdminBeverini();
    loadBeverini();
    resetBeverinoForm();
    showToast('Beverino salvato', 'success');
}

async function saveNews(e) {
    e.preventDefault();
    const id = document.getElementById('news-id').value;
    const item = {
        titolo: document.getElementById('news-titolo').value,
        contenuto: document.getElementById('news-contenuto').value,
        data: document.getElementById('news-data').value,
        categoria: document.getElementById('news-categoria').value,
        fonte: document.getElementById('news-fonte').value,
        last_modified: new Date().toISOString()
    };
    if(id) item.id = id;
    await saveDataToFirebase('news', item);
    loadAdminNews();
    loadNews();
    resetNewsForm();
    showToast('News salvata', 'success');
}

function resetFontanaForm() { document.getElementById('fontana-form').reset(); document.getElementById('fontana-id').value = ''; }
function resetBeverinoForm() { document.getElementById('beverino-form').reset(); document.getElementById('beverino-id').value = ''; }
function resetNewsForm() { document.getElementById('news-form').reset(); document.getElementById('news-id').value = ''; }

function updateDashboardStats() {
    document.getElementById('total-fontane').textContent = appData.fontane.length;
    document.getElementById('total-beverini').textContent = appData.beverini.length;
    document.getElementById('total-news').textContent = appData.news.length;
}

// ------------------------------------------
// MAP LOGIC
// ------------------------------------------

function initMappa() {
    if (!map) {
        map = L.map('map').setView([40.8518, 14.2681], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
        clusterGroup = L.markerClusterGroup();
        map.addLayer(clusterGroup);
    }
    clusterGroup.clearLayers();
    
    appData.fontane.forEach(f => {
        const marker = L.marker([f.latitudine, f.longitudine], { icon: getIcon('blue') });
        marker.bindPopup(`<b>${f.nome}</b><br>${f.indirizzo}<br><button onclick="showDetail('${f.id}','fontana')">Dettagli</button>`);
        clusterGroup.addLayer(marker);
    });
    
    appData.beverini.forEach(b => {
        const marker = L.marker([b.latitudine, b.longitudine], { icon: getIcon('orange') });
        marker.bindPopup(`<b>${b.nome}</b><br>${b.indirizzo}<br><button onclick="showDetail('${b.id}','beverino')">Dettagli</button>`);
        clusterGroup.addLayer(marker);
    });
}

function getIcon(color) {
    return L.icon({
        iconUrl: `https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34]
    });
}

// ------------------------------------------
// UTILS
// ------------------------------------------

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = `toast show ${type}`;
    toast.style.background = type === 'error' ? '#ef4444' : (type === 'success' ? '#10b981' : '#3b82f6');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function setFilter(type, status) {
    currentFilter[type] = status;
    document.querySelectorAll(`#${type}-screen .filter-btn`).forEach(b => b.classList.remove('active'));
    document.querySelector(`#${type}-screen .filter-btn.${status}`).classList.add('active');
    if (type === 'fontane') loadFontane();
    if (type === 'beverini') loadBeverini();
}

function debouncedFilter(type, query) {
    const items = appData[type].filter(item => 
        (item.nome + item.indirizzo).toLowerCase().includes(query.toLowerCase())
    );
    // Render filtered items... logic simplified for brevity, reuse render functions
    if (type === 'fontane') renderGridItems(document.getElementById('fontane-list'), items, 'fontana');
    if (type === 'beverini') renderCompactItems(document.getElementById('beverini-list'), items, 'beverino');
}

// ------------------------------------------
// RENDERERS
// ------------------------------------------
function loadFontane() {
    const list = document.getElementById('fontane-list');
    const filtered = appData.fontane.filter(i => currentFilter.fontane === 'all' || i.stato === currentFilter.fontane);
    renderGridItems(list, filtered, 'fontana');
}
function loadBeverini() {
    const list = document.getElementById('beverini-list');
    const filtered = appData.beverini.filter(i => currentFilter.beverini === 'all' || i.stato === currentFilter.beverini);
    renderCompactItems(list, filtered, 'beverino');
}
function loadNews() {
    const list = document.getElementById('news-list');
    list.innerHTML = '';
    appData.news.forEach(n => {
        const div = document.createElement('div');
        div.className = 'news-card';
        div.innerHTML = `<div class="news-title">${n.titolo}</div><div class="news-content">${n.contenuto}</div>`;
        list.appendChild(div);
    });
}

function renderGridItems(container, items, type) {
    container.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'grid-item';
        div.innerHTML = `
            <div class="item-image-container"><img src="${item.immagine || './images/sfondo-home.jpg'}" class="item-image" onerror="this.src='./images/sfondo-home.jpg'"></div>
            <div class="item-content">
                <div class="item-name">${item.nome}</div>
                <div class="item-address">${item.indirizzo}</div>
            </div>`;
        div.onclick = () => showDetail(item.id, type);
        container.appendChild(div);
    });
}

function renderCompactItems(container, items, type) {
    container.innerHTML = '';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'compact-item';
        div.innerHTML = `
            <img src="${item.immagine || './images/sfondo-home.jpg'}" class="compact-item-image" onerror="this.src='./images/sfondo-home.jpg'">
            <div class="compact-item-content">
                <div class="compact-item-name">${item.nome}</div>
                <div class="compact-item-address">${item.indirizzo}</div>
            </div>`;
        div.onclick = () => showDetail(item.id, type);
        container.appendChild(div);
    });
}

function showDetail(id, type) {
    const item = appData[type === 'fontana' ? 'fontane' : 'beverini'].find(i => i.id === id);
    if (!item) return;
    const content = document.getElementById(`${type}-detail-content`);
    content.innerHTML = `
        <img src="${item.immagine || './images/sfondo-home.jpg'}" class="detail-image" onerror="this.src='./images/sfondo-home.jpg'">
        <div class="detail-info">
            <h2>${item.nome}</h2>
            <p>${item.indirizzo}</p>
            <p>Stato: ${item.stato}</p>
            <p>${item.descrizione || ''}</p>
        </div>
        <div class="detail-actions">
            <button class="detail-action-btn primary" onclick="navigateTo(${item.latitudine}, ${item.longitudine})">Naviga</button>
        </div>
    `;
    document.getElementById(`${type}-detail-navigate-btn`).classList.remove('hidden');
    currentLatLng = { lat: item.latitudine, lng: item.longitudine };
    showScreen(`${type}-detail-screen`);
}

function navigateTo(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

function navigateToFixed() {
    if (currentLatLng) navigateTo(currentLatLng.lat, currentLatLng.lng);
}

// ------------------------------------------
// GPS UTILS
// ------------------------------------------
function getCurrentLocationCoordinatesOnly(type) {
    if (!navigator.geolocation) return showToast('GPS non supportato', 'error');
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById(`${type}-latitudine`).value = pos.coords.latitude.toFixed(6);
        document.getElementById(`${type}-longitudine`).value = pos.coords.longitude.toFixed(6);
        showToast('Coordinate rilevate', 'success');
    });
}

function getCurrentLocationWithAddress(type) {
    getCurrentLocationCoordinatesOnly(type);
    showToast('Indirizzo non disponibile senza API esterne', 'warning');
}

// ------------------------------------------
// INITIALIZATION
// ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Admin Secret Sequence Listeners
    document.getElementById('secret-logo').addEventListener('dblclick', () => handleSecretSequence('logo'));
    document.getElementById('secret-title').addEventListener('click', () => handleSecretSequence('title'));

    // Admin FAB logic (optional if sequence fails)
    window.firebase.onAuthStateChanged(window.firebase.auth, (user) => {
        isAdminAuthenticated = !!user;
        if(user) document.querySelector('.admin-fab').style.display = 'flex';
    });

    // Load initial data
    Promise.all([
        loadDataFromFirebase('fontane'),
        loadDataFromFirebase('beverini'),
        loadDataFromFirebase('news')
    ]).then(() => {
        updateDashboardStats();
    });

    // Tab Management
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            document.getElementById(this.dataset.tab).classList.add('active');
        });
    });
});