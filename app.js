// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyBvDfxm-LSAcu0NwtJ8DYxxrjY-83LlLPU",
    authDomain: "abcnapolifontane.firebaseapp.com",
    projectId: "abcnapolifontane",
    storageBucket: "abcnapolifontane.firebasestorage.app",
    messagingSenderId: "686936372148",
    appId: "1:686936372148:web:4147bab1bab73583b638e1",
    measurementId: "G-DPEC2SNGDM"
};

// Initialize Firebase
try {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
} catch (error) {
    console.error("Firebase initialization error:", error);
}

const db = firebase.firestore();
const auth = firebase.auth();

// Variabili globali
let appData = {
    fontane: [],
    beverini: [],
    news: []
};
let currentLatLng = null;
let mappaInizializzata = false;
let currentMapMarkers = [];
let screenHistory = ['home-screen'];
let currentFilter = {
    fontane: 'all',
    beverini: 'all'
};
let activityLog = [];
let map = null;
let clusterGroup = null;

// Variabili per la sequenza segreta
let secretSequence = [];
const correctSequence = ['logo', 'title', 'logo'];

// Funzione per gestire la sequenza segreta
function handleSecretSequence(elementType) {
    secretSequence.push(elementType);
    console.log('Sequenza segreta:', secretSequence);

    if (secretSequence.length === 3 &&
        secretSequence[0] === correctSequence[0] &&
        secretSequence[1] === correctSequence[1] &&
        secretSequence[2] === correctSequence[2]) {
        showAdminAuth();
        secretSequence = [];
    } else if (secretSequence.length >= 3) {
        setTimeout(() => {
            secretSequence = [];
        }, 2000);
    }
}

// Firebase Auth State Observer
auth.onAuthStateChanged((user) => {
    if (user) {
        console.log('User logged in:', user.email);
        updateUserEmail();
        showAdminPanel();
    } else {
        console.log('User logged out');
        closeAdminPanel();
    }
});

// FUNZIONI DI NAVIGAZIONE
function showScreen(screenId) {
    if (screenHistory[screenHistory.length - 1] !== screenId) {
        screenHistory.push(screenId);
    }
    if (screenHistory.length > 10) {
        screenHistory = screenHistory.slice(-10);
    }
    
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.style.display = 'block';
        setTimeout(() => {
            targetScreen.classList.add('active');
        }, 10);
        window.scrollTo(0, 0);
        initializeScreenContent(screenId);
    }
    
    updateTabBar(screenId);
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
    
    const activeTab = document.querySelector(`.tab-btn[onclick="showScreen('${activeScreen}')"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
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

// FUNZIONI DI CARICAMENTO DATI
function loadData() {
    try {
        const savedData = localStorage.getItem('fontaneBeveriniData');
        if (savedData) {
            appData = JSON.parse(savedData);
            console.log('Dati caricati dal localStorage:', appData);
        } else {
            // Dati di default
            appData = {
                fontane: [
                    {
                        id: "1",
                        nome: "Fontana Cariati",
                        indirizzo: "Via Santa Caterina da Siena",
                        stato: "funzionante",
                        anno: "2023",
                        descrizione: "Fontana storica nel centro città",
                        storico: "Costruita nel 2023",
                        latitudine: 40.8478,
                        longitudine: 14.2504,
                        immagine: "./images/sfondo-home.jpg"
                    }
                ],
                beverini: [
                    {
                        id: "1",
                        nome: "Beverino Centrale",
                        indirizzo: "Piazza del Plebiscito",
                        stato: "funzionante",
                        latitudine: 40.8359,
                        longitudine: 14.2488,
                        immagine: "./images/sfondo-home.jpg"
                    }
                ],
                news: [
                    {
                        id: "1",
                        titolo: "Ristrutturazione Fontana del Gigante",
                        contenuto: "È iniziato il restauro conservativo della Fontana del Gigante, uno dei monumenti più iconici di Napoli.",
                        data: "2024-01-15",
                        categoria: "Manutenzione",
                        fonte: "Comune di Napoli"
                    }
                ]
            };
            saveData();
            console.log('Dati inizializzati con valori predefiniti');
        }
    } catch (error) {
        console.error('Errore nel caricamento dati:', error);
    }
}

function saveData() {
    try {
        localStorage.setItem('fontaneBeveriniData', JSON.stringify(appData));
        console.log('Dati salvati nel localStorage');
    } catch (error) {
        console.error('Errore nel salvataggio dati:', error);
    }
}

// FUNZIONI DI VISUALIZZAZIONE
function loadFontane() {
    const container = document.getElementById('fontane-list');
    if (!container) return;

    const filteredFontane = filterData(appData.fontane, currentFilter.fontane);
    
    if (filteredFontane.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-monument"></i></div>
                <div class="empty-state-text">Nessuna fontana trovata</div>
                <div class="empty-state-subtext">Prova a cambiare filtro o ricerca</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredFontane.map(fontana => `
        <div class="grid-item" onclick="showFontanaDetail('${fontana.id}')">
            <div class="item-image-container">
                ${fontana.immagine ? 
                    `<img src="${fontana.immagine}" alt="${fontana.nome}" class="item-image" onerror="this.style.display='none'">` :
                    `<div class="image-placeholder"><i class="fas fa-monument"></i></div>`
                }
            </div>
            <div class="item-content">
                <div class="item-name">${fontana.nome}</div>
                <div class="item-address">${fontana.indirizzo}</div>
                <div class="item-footer">
                    <span class="item-status status-${fontana.stato}">
                        ${getStatusText(fontana.stato)}
                    </span>
                    ${fontana.immagine ? '<span class="image-indicator image-custom">Foto</span>' : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function loadBeverini() {
    const container = document.getElementById('beverini-list');
    if (!container) return;

    const filteredBeverini = filterData(appData.beverini, currentFilter.beverini);
    
    if (filteredBeverini.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-faucet"></i></div>
                <div class="empty-state-text">Nessun beverino trovato</div>
                <div class="empty-state-subtext">Prova a cambiare filtro o ricerca</div>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredBeverini.map(beverino => `
        <div class="compact-item" onclick="showBeverinoDetail('${beverino.id}')">
            ${beverino.immagine ? 
                `<img src="${beverino.immagine}" alt="${beverino.nome}" class="compact-item-image" onerror="this.style.display='none'">` :
                `<div class="compact-item-image" style="display: flex; align-items: center; justify-content: center; background: #f3f4f6;">
                    <i class="fas fa-faucet" style="font-size: 1.5rem; color: #6b7280;"></i>
                </div>`
            }
            <div class="compact-item-content">
                <div class="compact-item-header">
                    <div class="compact-item-name">${beverino.nome}</div>
                </div>
                <div class="compact-item-address">${beverino.indirizzo}</div>
                <div class="compact-item-footer">
                    <span class="compact-item-status status-${beverino.stato}">
                        ${getStatusText(beverino.stato)}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

function loadNews() {
    const container = document.getElementById('news-list');
    if (!container) return;

    if (appData.news.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-newspaper"></i></div>
                <div class="empty-state-text">Nessuna news disponibile</div>
                <div class="empty-state-subtext">Torna presto per aggiornamenti</div>
            </div>
        `;
        return;
    }

    container.innerHTML = appData.news.map(news => `
        <div class="news-card">
            <div class="news-header">
                <div class="news-title">${news.titolo}</div>
                <div class="news-date">${formatDate(news.data)}</div>
            </div>
            <div class="news-content">${news.contenuto}</div>
            <div class="news-footer">
                <span class="news-category">${news.categoria}</span>
                <span class="news-source">${news.fonte}</span>
            </div>
        </div>
    `).join('');
}

// FUNZIONI DI FILTRO E RICERCA
function setFilter(type, filter) {
    currentFilter[type] = filter;
    
    document.querySelectorAll(`#${type}-screen .filter-btn`).forEach(btn => {
        btn.classList.remove('active');
    });
    
    event.target.classList.add('active');
    
    if (type === 'fontane') loadFontane();
    if (type === 'beverini') loadBeverini();
}

function filterData(data, filter) {
    if (filter === 'all') return data;
    return data.filter(item => item.stato === filter);
}

function debouncedFilter(type, query) {
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        performFilter(type, query);
    }, 300);
}

function performFilter(type, query) {
    const data = appData[type];
    const filteredByStatus = filterData(data, currentFilter[type]);
    
    const filtered = filteredByStatus.filter(item => 
        item.nome.toLowerCase().includes(query.toLowerCase()) ||
        item.indirizzo.toLowerCase().includes(query.toLowerCase())
    );
    
    if (type === 'fontane') {
        const container = document.getElementById('fontane-list');
        renderFilteredItems(container, filtered, type);
    } else if (type === 'beverini') {
        const container = document.getElementById('beverini-list');
        renderFilteredItems(container, filtered, type);
    }
}

function renderFilteredItems(container, items, type) {
    if (items.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="fas fa-${type === 'fontane' ? 'monument' : 'faucet'}"></i></div>
                <div class="empty-state-text">Nessun risultato trovato</div>
                <div class="empty-state-subtext">Prova a modificare la ricerca</div>
            </div>
        `;
        return;
    }

    if (type === 'fontane') {
        container.innerHTML = items.map(item => `
            <div class="grid-item" onclick="showFontanaDetail('${item.id}')">
                <div class="item-image-container">
                    ${item.immagine ? 
                        `<img src="${item.immagine}" alt="${item.nome}" class="item-image" onerror="this.style.display='none'">` :
                        `<div class="image-placeholder"><i class="fas fa-monument"></i></div>`
                    }
                </div>
                <div class="item-content">
                    <div class="item-name">${item.nome}</div>
                    <div class="item-address">${item.indirizzo}</div>
                    <div class="item-footer">
                        <span class="item-status status-${item.stato}">
                            ${getStatusText(item.stato)}
                        </span>
                        ${item.immagine ? '<span class="image-indicator image-custom">Foto</span>' : ''}
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = items.map(item => `
            <div class="compact-item" onclick="showBeverinoDetail('${item.id}')">
                ${item.immagine ? 
                    `<img src="${item.immagine}" alt="${item.nome}" class="compact-item-image" onerror="this.style.display='none'">` :
                    `<div class="compact-item-image" style="display: flex; align-items: center; justify-content: center; background: #f3f4f6;">
                        <i class="fas fa-faucet" style="font-size: 1.5rem; color: #6b7280;"></i>
                    </div>`
                }
                <div class="compact-item-content">
                    <div class="compact-item-header">
                        <div class="compact-item-name">${item.nome}</div>
                    </div>
                    <div class="compact-item-address">${item.indirizzo}</div>
                    <div class="compact-item-footer">
                        <span class="compact-item-status status-${item.stato}">
                            ${getStatusText(item.stato)}
                        </span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

// FUNZIONI UTILITY
function getStatusText(status) {
    const statusMap = {
        'funzionante': 'Funzionante',
        'non-funzionante': 'Non Funzionante',
        'manutenzione': 'In Manutenzione'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT');
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = 'toast show';
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// FUNZIONI MAPPA
function initMappa() {
    if (mappaInizializzata) return;

    const mapElement = document.getElementById('map');
    if (!mapElement) return;

    try {
        map = L.map('map').setView([40.8518, 14.2681], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        clusterGroup = L.markerClusterGroup();
        map.addLayer(clusterGroup);

        // Aggiungi fontane alla mappa
        appData.fontane.forEach(fontana => {
            if (fontana.latitudine && fontana.longitudine) {
                const marker = L.marker([fontana.latitudine, fontana.longitudine])
                    .bindPopup(`
                        <div class="popup-content">
                            <div class="popup-title">${fontana.nome}</div>
                            <div class="popup-address">${fontana.indirizzo}</div>
                            <div class="popup-status status-${fontana.stato}">${getStatusText(fontana.stato)}</div>
                            <button class="popup-btn" onclick="showFontanaDetail('${fontana.id}')">Dettagli</button>
                        </div>
                    `);
                clusterGroup.addLayer(marker);
            }
        });

        // Aggiungi beverini alla mappa
        appData.beverini.forEach(beverino => {
            if (beverino.latitudine && beverino.longitudine) {
                const marker = L.marker([beverino.latitudine, beverino.longitudine])
                    .bindPopup(`
                        <div class="popup-content">
                            <div class="popup-title">${beverino.nome}</div>
                            <div class="popup-address">${beverino.indirizzo}</div>
                            <div class="popup-status status-${beverino.stato}">${getStatusText(beverino.stato)}</div>
                            <button class="popup-btn" onclick="showBeverinoDetail('${beverino.id}')">Dettagli</button>
                        </div>
                    `);
                clusterGroup.addLayer(marker);
            }
        });

        mappaInizializzata = true;
        console.log('Mappa inizializzata con successo');
    } catch (error) {
        console.error('Errore nell\'inizializzazione della mappa:', error);
    }
}

// FUNZIONI DETTAGLIO
function showFontanaDetail(id) {
    const fontana = appData.fontane.find(f => f.id === id);
    if (!fontana) return;

    // Per ora mostriamo un alert, puoi implementare una schermata di dettaglio
    showToast(`Fontana: ${fontana.nome} - ${fontana.indirizzo}`, 'info');
}

function showBeverinoDetail(id) {
    const beverino = appData.beverini.find(b => b.id === id);
    if (!beverino) return;

    // Per ora mostriamo un alert, puoi implementare una schermata di dettaglio
    showToast(`Beverino: ${beverino.nome} - ${beverino.indirizzo}`, 'info');
}

// FUNZIONI ADMIN
function openAdminPanel() {
    const user = auth.currentUser;
    if (user) {
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
    document.getElementById('admin-email').value = '';
    document.getElementById('admin-password').value = '';
    document.getElementById('auth-error').style.display = 'none';
}

async function checkAdminAuth() {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('auth-error');

    try {
        showToast('Accesso in corso...', 'info');
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        showToast(`Accesso effettuato come ${user.email}`, 'success');
        closeAdminAuth();
        showAdminPanel();
        
    } catch (error) {
        console.error('Login error:', error);
        
        let errorMessage = 'Errore di accesso';
        switch (error.code) {
            case 'auth/invalid-email':
                errorMessage = 'Email non valida';
                break;
            case 'auth/user-disabled':
                errorMessage = 'Account disabilitato';
                break;
            case 'auth/user-not-found':
                errorMessage = 'Utente non trovato';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Password errata';
                break;
            case 'auth/too-many-requests':
                errorMessage = 'Troppi tentativi. Riprova più tardi';
                break;
            default:
                errorMessage = error.message;
        }
        
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-password').focus();
    }
}

function showAdminPanel() {
    const user = auth.currentUser;
    if (!user) {
        showAdminAuth();
        return;
    }

    document.querySelector('.admin-fab').style.display = 'flex';
    showToast('Pannello admin attivo - Usa il pulsante in basso a destra', 'info');
}

function closeAdminPanel() {
    document.querySelector('.admin-fab').style.display = 'none';
}

function updateUserEmail() {
    const user = auth.currentUser;
    if (user) {
        console.log('Utente connesso:', user.email);
    }
}

async function logoutAdmin() {
    try {
        await auth.signOut();
        showToast('Logout effettuato con successo', 'success');
    } catch (error) {
        showToast('Errore durante il logout', 'error');
    }
}

// Firebase Functions
async function loadFromFirebase(type) {
    try {
        showToast(`Caricamento ${type} da Firebase...`, 'info');
        
        const snapshot = await db.collection(type).get();
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        appData[type] = data;
        saveData();
        showToast(`${data.length} ${type} caricati da Firebase`, 'success');
        
        if (type === 'fontane') loadFontane();
        if (type === 'beverini') loadBeverini();
        if (type === 'news') loadNews();
        
        return data;
    } catch (error) {
        showToast(`Errore nel caricamento ${type}: ${error.message}`, 'error');
        throw error;
    }
}

async function saveToFirebase(type) {
    try {
        showToast(`Salvataggio ${type} su Firebase...`, 'info');
        
        const batch = db.batch();
        const collectionRef = db.collection(type);
        
        // Clear existing data
        const snapshot = await collectionRef.get();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Add new data
        appData[type].forEach(item => {
            const docRef = collectionRef.doc(item.id.toString());
            const { id, ...data } = item;
            batch.set(docRef, data);
        });
        
        await batch.commit();
        showToast(`${appData[type].length} ${type} salvati su Firebase`, 'success');
        return { success: true, total: appData[type].length };
    } catch (error) {
        showToast(`Errore nel salvataggio ${type}: ${error.message}`, 'error');
        throw error;
    }
}

// INIZIALIZZAZIONE
document.addEventListener('DOMContentLoaded', function() {
    console.log('Applicazione inizializzata');
    loadData();
    showScreen('home-screen');

    // Prova a caricare i dati da Firebase
    setTimeout(() => {
        loadFromFirebase('fontane').catch(() => {
            console.log('Utilizzo dati locali per fontane');
        });
        loadFromFirebase('beverini').catch(() => {
            console.log('Utilizzo dati locali per beverini');
        });
        loadFromFirebase('news').catch(() => {
            console.log('Utilizzo dati locali per news');
        });
    }, 1000);
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('./sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful');
            })
            .catch(function(err) {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}