// Configurazione Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBvDfxm-LSAcu0NwtJ8DYxxrjY-83LlLPU",
    authDomain: "abcnapolifontane.firebaseapp.com",
    projectId: "abcnapolifontane",
    storageBucket: "abcnapolifontane.firebasestorage.app",
    messagingSenderId: "686936372148",
    appId: "1:686936372148:web:4147bab1bab73583b638e1",
    measurementId: "G-DPEC2SNGDM"
};

// Inizializza Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Configurazioni sicure
const SECURE_CONFIG = {
    ADMIN_PASSWORD: 'admin123',
    ADMIN_EMAIL: 'admin@fontanenapoli.it'
};

// Variabili globali
let appData = {
    fontane: [],
    beverini: [],
    news: []
};
let currentLatLng = null;
let currentMapMarkers = [];
let currentDestination = null;
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
let currentUser = null;

// Sequenza segreta
let secretSequence = [];
const correctSequence = ['logo', 'title', 'logo'];

// Funzione per gestire la sequenza segreta
function handleSecretSequence(elementType) {
    secretSequence.push(elementType);

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

// Firebase Auth
async function loginAdmin(email, password) {
    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        isAdminAuthenticated = true;
        return true;
    } catch (error) {
        console.error('Login error:', error);
        return false;
    }
}

async function logoutAdmin() {
    try {
        await auth.signOut();
        isAdminAuthenticated = false;
        currentUser = null;
        closeAdminPanel();
        showToast('Logout effettuato', 'success');
        logActivity('Logout amministratore');
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function checkAdminAuth() {
    const password = document.getElementById('admin-password').value;
    const errorElement = document.getElementById('auth-error');

    try {
        const success = await loginAdmin(SECURE_CONFIG.ADMIN_EMAIL, password);
        if (success) {
            closeAdminAuth();
            showAdminPanel();
            
            if (adminAuthTimeout) {
                clearTimeout(adminAuthTimeout);
            }
            adminAuthTimeout = setTimeout(() => {
                logoutAdmin();
                showToast('Sessione amministratore scaduta', 'info');
            }, 30 * 60 * 1000);
        } else {
            errorElement.style.display = 'block';
            document.getElementById('admin-password').value = '';
            document.getElementById('admin-password').focus();
        }
    } catch (error) {
        errorElement.style.display = 'block';
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-password').focus();
    }
}

// Funzioni Firebase per i dati
async function loadFromFirebase(type) {
    try {
        showToast(`Caricamento ${type} da Firebase...`, 'info');
        
        const collectionRef = db.collection(type);
        const snapshot = await collectionRef.get();
        
        const data = [];
        snapshot.forEach(doc => {
            data.push({
                id: doc.id,
                ...doc.data()
            });
        });

        appData[type] = data;
        saveData();
        showToast(`${data.length} ${type} caricati da Firebase`, 'success');

        if (type === 'fontane') loadFontane();
        if (type === 'beverini') loadBeverini();
        if (type === 'news') loadNews();

        if (document.getElementById('admin-panel').style.display === 'flex') {
            if (type === 'fontane') loadAdminFontane();
            if (type === 'beverini') loadAdminBeverini();
            if (type === 'news') loadAdminNews();
        }

        return data;
    } catch (error) {
        showToast(`Errore nel caricamento ${type}: ${error.message}`, 'error');
        throw error;
    }
}

async function saveToFirebase(type) {
    if (!isAdminAuthenticated) {
        showToast('Devi essere autenticato per salvare', 'error');
        return;
    }

    try {
        showToast(`Salvataggio ${type} su Firebase...`, 'info');

        const data = appData[type];
        const batch = db.batch();
        const collectionRef = db.collection(type);

        for (const item of data) {
            const docRef = collectionRef.doc(item.id.toString());
            const itemData = { ...item };
            delete itemData.id;
            batch.set(docRef, itemData);
        }

        await batch.commit();
        showToast(`${data.length} ${type} salvati su Firebase`, 'success');
    } catch (error) {
        showToast(`Errore nel salvataggio ${type}: ${error.message}`, 'error');
        throw error;
    }
}

async function saveItemToFirebase(type, item) {
    if (!isAdminAuthenticated) {
        showToast('Devi essere autenticato per salvare', 'error');
        return false;
    }

    try {
        const collectionRef = db.collection(type);
        const itemData = { ...item };
        const id = itemData.id;
        delete itemData.id;

        await collectionRef.doc(id.toString()).set(itemData);
        return true;
    } catch (error) {
        console.error('Save item error:', error);
        return false;
    }
}

async function deleteItemFromFirebase(type, id) {
    if (!isAdminAuthenticated) {
        showToast('Devi essere autenticato per eliminare', 'error');
        return false;
    }

    try {
        await db.collection(type).doc(id.toString()).delete();
        return true;
    } catch (error) {
        console.error('Delete item error:', error);
        return false;
    }
}

// Funzioni di utilità
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
        'manutenzione': 'In Manutenzione',
        'guasto': 'Guasto'
    };
    return statusMap[stato] || 'Stato sconosciuto';
}

function formatDate(dateString) {
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('it-IT', options);
}

function showError(message, duration = 5000) {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message}`;
    toast.style.background = 'var(--primary-red)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showSuccess(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    toast.style.background = 'var(--primary-green)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showInfo(message, duration = 4000) {
    const toast = document.getElementById('toast');
    toast.innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
    toast.style.background = 'var(--primary-blue)';
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function showToast(message, type = 'info', duration = 3000) {
    switch(type) {
        case 'error': showError(message, duration); break;
        case 'success': showSuccess(message, duration); break;
        default: showInfo(message, duration); break;
    }
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

// Funzioni per la gestione dello stato
function loadData() {
    try {
        const savedData = localStorage.getItem('fontaneBeveriniData');
        if (savedData) {
            appData = JSON.parse(savedData);
            showToast('Dati caricati con successo', 'success');
        } else {
            appData = {
                fontane: [
                    {
                        id: 1,
                        nome: "Fontana Cariati",
                        indirizzo: "Via Santa Caterina da Siena",
                        stato: "funzionante",
                        anno: "",
                        descrizione: "",
                        storico: "",
                        latitudine: 40.8478,
                        longitudine: 14.2504,
                        immagine: "./images/fontana-cariati.jpg"
                    }
                ],
                beverini: [],
                news: [
                    {
                        id: 1,
                        titolo: "Ristrutturazione Fontana del Gigante",
                        contenuto: "È iniziato il restauro conservativo della Fontana del Gigante, uno dei monumenti più iconici di Napoli.",
                        data: "2024-01-15",
                        categoria: "Manutenzione",
                        fonte: "Comune di Napoli"
                    }
                ]
            };
            saveData();
            showToast('Dati inizializzati con valori predefiniti', 'info');
        }
    } catch (error) {
        showToast('Errore nel caricamento dati. Ripristino backup...', 'error');
        restoreFromBackup();
    }
}

function saveData() {
    try {
        localStorage.setItem('fontaneBeveriniData', JSON.stringify(appData));
        autoBackupData();
    } catch (error) {
        showToast('Errore nel salvataggio dati', 'error');
    }
}

function autoBackupData() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupKey = `fontaneBeveriniBackup_${timestamp}`;
        localStorage.setItem(backupKey, JSON.stringify(appData));
        
        const backupKeys = Object.keys(localStorage)
            .filter(key => key.startsWith('fontaneBeveriniBackup_'))
            .sort()
            .reverse();
        
        if (backupKeys.length > 5) {
            for (let i = 5; i < backupKeys.length; i++) {
                localStorage.removeItem(backupKeys[i]);
            }
        }
    } catch (error) {
        console.error('Backup error:', error);
    }
}

// Funzioni per la navigazione
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

// Funzioni per l'amministrazione
function showAdminAuth() {
    document.getElementById('admin-auth').style.display = 'flex';
    document.getElementById('admin-password').focus();
}

function closeAdminAuth() {
    document.getElementById('admin-auth').style.display = 'none';
    document.getElementById('admin-password').value = '';
    document.getElementById('auth-error').style.display = 'none';
}

function openAdminPanel() {
    if (isAdminAuthenticated) {
        showAdminPanel();
    } else {
        showAdminAuth();
    }
}

function showAdminPanel() {
    document.getElementById('admin-panel').style.display = 'flex';
    document.querySelector('.admin-fab').style.display = 'flex';

    loadSecureConfig();
    loadAdminFontane();
    loadAdminBeverini();
    loadAdminNews();
    updateDashboardStats();

    const savedLog = localStorage.getItem('activityLog');
    if (savedLog) {
        activityLog = JSON.parse(savedLog);
        updateActivityLog();
    }

    loadBackupList();
}

function closeAdminPanel() {
    document.getElementById('admin-panel').style.display = 'none';
    document.querySelector('.admin-fab').style.display = 'none';
}

function loadSecureConfig() {
    const configSection = document.querySelector('.admin-config-section');
    configSection.innerHTML = `
        <h3>Configurazione Firebase</h3>
        <div class="secure-config-section">
            <h4>Stato Connessione</h4>
            <div class="api-status" id="firebase-status">
                <i class="fas fa-circle"></i> <span id="firebase-status-text">Connesso a Firebase</span>
            </div>
        </div>
        <div class="sync-actions">
            <button class="admin-btn primary" onclick="syncAllWithFirebase()">
                <i class="fas fa-sync-alt"></i> Sincronizza Tutto
            </button>
            <button class="admin-btn secondary" onclick="loadAllFromFirebase()">
                <i class="fas fa-download"></i> Carica Tutto da Firebase
            </button>
            <button class="admin-btn secondary" onclick="saveAllToFirebase()">
                <i class="fas fa-upload"></i> Salva Tutto su Firebase
            </button>
        </div>
    `;
}

async function syncAllWithFirebase() {
    try {
        showToast('Sincronizzazione con Firebase...', 'info');
        await saveAllToFirebase();
        await loadAllFromFirebase();
        showToast('Sincronizzazione completata', 'success');
    } catch (error) {
        showToast(`Errore nella sincronizzazione: ${error.message}`, 'error');
    }
}

async function loadAllFromFirebase() {
    try {
        showToast('Caricamento di tutti i dati da Firebase...', 'info');
        await loadFromFirebase('fontane');
        await loadFromFirebase('beverini');
        await loadFromFirebase('news');
        showToast('Tutti i dati caricati da Firebase', 'success');
    } catch (error) {
        showToast(`Errore nel caricamento: ${error.message}`, 'error');
    }
}

async function saveAllToFirebase() {
    try {
        showToast('Salvataggio di tutti i dati su Firebase...', 'info');
        await saveToFirebase('fontane');
        await saveToFirebase('beverini');
        await saveToFirebase('news');
        showToast('Tutti i dati salvati su Firebase', 'success');
    } catch (error) {
        showToast(`Errore nel salvataggio: ${error.message}`, 'error');
    }
}

// Aggiungi altre funzioni necessarie dal codice originale...

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    loadData();
    checkOnlineStatus();
    showScreen('home-screen');
    handleUrlParameters();

    // Nascondi il FAB admin all'avvio
    document.querySelector('.admin-fab').style.display = 'none';

    // Inizializza Firebase Auth listener
    auth.onAuthStateChanged((user) => {
        currentUser = user;
        isAdminAuthenticated = !!user;
        if (user) {
            console.log('Admin autenticato:', user.email);
        }
    });

    // Carica i dati da Firebase all'avvio
    setTimeout(() => {
        loadAllFromFirebase().then(() => {
            console.log('Dati caricati da Firebase');
        }).catch(error => {
            console.log('Utilizzo dati locali:', error.message);
        });
    }, 1000);

    // Gestione errori immagini
    document.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG') {
            e.target.src = './images/sfondo-home.jpg';
        }
    }, true);

    // Event listener per la sequenza segreta
    const logo = document.querySelector('.app-logo');
    const title = document.querySelector('.home-title');

    logo.addEventListener('dblclick', function() {
        handleSecretSequence('logo');
    });

    title.addEventListener('click', function() {
        handleSecretSequence('title');
    });

    logActivity('Applicazione avviata');
});

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registrato con successo:', registration);
            })
            .catch(error => {
                console.log('Registrazione Service Worker fallita:', error);
            });
    });
}

// Aggiungi qui tutte le altre funzioni necessarie dal codice originale
// (gestione mappa, filtri, form, etc.) mantenendo la logica Firebase