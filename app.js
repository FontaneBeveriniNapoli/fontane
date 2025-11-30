// IMPORT FIREBASE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// --- TUA CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyBvDfxm-LSAcu0NwtJ8DYxxrjY-83LlLPU",
  authDomain: "abcnapolifontane.firebaseapp.com",
  projectId: "abcnapolifontane",
  storageBucket: "abcnapolifontane.firebasestorage.app",
  messagingSenderId: "686936372148",
  appId: "1:686936372148:web:4147bab1bab73583b638e1",
  measurementId: "G-DPEC2SNGDM"
};

// INIT
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);
const storage = getStorage(firebaseApp);

// STATO GLOBALE
let appData = { fontane: [], beverini: [], news: [] };
let map = null;
let markersCluster = null;
let editingId = null;
let screenHistory = ['home-screen'];

const app = {
    // --- NAVIGAZIONE ---
    showScreen: (id) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        
        // Gestione TabBar
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        // (Logica semplificata per tab bar active state)
        if(id.includes('fontane')) document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
        if(id.includes('beverini')) document.querySelector('.tab-btn:nth-child(3)').classList.add('active');
        if(id.includes('mappa')) document.querySelector('.tab-btn:nth-child(4)').classList.add('active');
        if(id === 'home-screen') document.querySelector('.tab-btn:nth-child(1)').classList.add('active');

        // Mappa
        if (id === 'mappa-screen') {
            if (!map) app.initMap();
            setTimeout(() => map.invalidateSize(), 200);
        }

        // Storia
        if (screenHistory[screenHistory.length-1] !== id) screenHistory.push(id);
        window.scrollTo(0,0);
    },

    goBack: () => {
        if (screenHistory.length > 1) {
            screenHistory.pop();
            app.showScreen(screenHistory[screenHistory.length-1]);
        } else {
            app.showScreen('home-screen');
        }
    },

    // --- CARICAMENTO DATI ---
    init: async () => {
        await app.loadFromFirebase();
    },

    loadFromFirebase: async () => {
        // Fontane
        const fSnap = await getDocs(collection(db, "fontane"));
        appData.fontane = [];
        fSnap.forEach(doc => appData.fontane.push({id: doc.id, ...doc.data()}));
        app.renderFontane();

        // Beverini
        const bSnap = await getDocs(collection(db, "beverini"));
        appData.beverini = [];
        bSnap.forEach(doc => appData.beverini.push({id: doc.id, ...doc.data()}));
        app.renderBeverini();

        // News
        const nSnap = await getDocs(collection(db, "news"));
        appData.news = [];
        nSnap.forEach(doc => appData.news.push({id: doc.id, ...doc.data()}));
        app.renderNews();

        // Aggiorna Mappa se esiste
        if(map) app.updateMapMarkers();
    },

    // --- RENDERING LISTE ---
    renderFontane: () => {
        const container = document.getElementById('fontane-list');
        container.innerHTML = appData.fontane.map(item => `
            <div class="grid-item" onclick="app.showDetail('${item.id}', 'fontane')">
                <img src="${item.immagine || './images/sfondo-home.jpg'}" class="item-image" onerror="this.src='./images/sfondo-home.jpg'">
                <div class="item-content">
                    <div class="item-name">${item.nome}</div>
                    <span class="item-status status-${item.stato}">${item.stato}</span>
                </div>
            </div>
        `).join('');
    },

    renderBeverini: () => {
        const container = document.getElementById('beverini-list');
        container.innerHTML = appData.beverini.map(item => `
            <div class="compact-item" onclick="app.showDetail('${item.id}', 'beverini')">
                <img src="${item.immagine || './images/sfondo-home.jpg'}" class="compact-image" onerror="this.src='./images/sfondo-home.jpg'">
                <div class="compact-info">
                    <div class="item-name">${item.nome}</div>
                    <div style="font-size:0.8rem; color:#666;">${item.indirizzo}</div>
                </div>
            </div>
        `).join('');
    },

    renderNews: () => {
        const container = document.getElementById('news-list');
        container.innerHTML = appData.news.map(item => `
            <div class="news-card">
                <div class="news-date">${item.data || ''}</div>
                <div class="news-title">${item.titolo || item.nome}</div>
                <div>${item.contenuto || item.indirizzo}</div>
            </div>
        `).join('');
    },

    // --- DETTAGLIO ---
    showDetail: (id, type) => {
        const item = appData[type].find(x => x.id === id);
        if(!item) return;

        const html = `
            <img src="${item.immagine || './images/sfondo-home.jpg'}" class="detail-image" onerror="this.src='./images/sfondo-home.jpg'">
            <div class="detail-info-card">
                <h2>${item.nome}</h2>
                <p style="color:#666; margin-bottom:10px;"><i class="fas fa-map-marker-alt"></i> ${item.indirizzo}</p>
                <div style="margin-bottom:15px;">
                    <span class="item-status status-${item.stato}">${item.stato}</span>
                </div>
                <button onclick="window.open('https://maps.google.com/?q=${item.lat},${item.lng}')" class="admin-btn primary" style="width:100%;">
                    <i class="fas fa-directions"></i> Naviga
                </button>
                ${auth.currentUser ? `<button onclick="app.openAdminPanel('${id}', '${type}')" class="admin-btn secondary" style="width:100%; margin-top:10px;">Modifica</button>` : ''}
            </div>
        `;
        document.getElementById('detail-content').innerHTML = html;
        document.getElementById('detail-title').innerText = type === 'fontane' ? 'Fontana' : 'Beverino';
        app.showScreen('detail-screen');
    },

    // --- MAPPA ---
    initMap: () => {
        map = L.map('map').setView([40.8518, 14.2681], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap, © CartoDB'
        }).addTo(map);
        markersCluster = L.markerClusterGroup();
        map.addLayer(markersCluster);
        app.updateMapMarkers();
    },

    updateMapMarkers: () => {
        if(!markersCluster) return;
        markersCluster.clearLayers();
        
        const addMarkers = (list, type, color) => {
            list.forEach(item => {
                if(item.lat && item.lng) {
                    const icon = L.icon({
                        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
                    });
                    const marker = L.marker([item.lat, item.lng], {icon});
                    marker.bindPopup(`<b>${item.nome}</b><br><button onclick="app.showDetail('${item.id}', '${type}')">Dettagli</button>`);
                    markersCluster.addLayer(marker);
                }
            });
        };

        addMarkers(appData.fontane, 'fontane', 'blue');
        addMarkers(appData.beverini, 'beverini', 'green');
    },

    // --- FILTRI ---
    filterList: (type, query) => {
        const term = query.toLowerCase();
        const list = type === 'fontane' ? 'fontane-list' : 'beverini-list';
        const items = document.getElementById(list).children;
        Array.from(items).forEach(div => {
            const text = div.innerText.toLowerCase();
            div.style.display = text.includes(term) ? 'flex' : 'none';
        });
    },

    // --- ADMIN & AUTH ---
    toggleLogin: () => {
        if(auth.currentUser) alert("Già loggato Admin");
        else document.getElementById('login-modal').style.display = 'flex';
    },

    login: () => {
        const em = document.getElementById('admin-email').value;
        const pw = document.getElementById('admin-password').value;
        signInWithEmailAndPassword(auth, em, pw)
            .then(() => {
                document.getElementById('login-modal').style.display = 'none';
                alert("Benvenuto Admin!");
            })
            .catch(e => alert(e.message));
    },

    logout: () => {
        signOut(auth).then(() => {
            app.closeAdminPanel();
            alert("Logout effettuato");
        });
    },

    openAdminPanel: (id = null, type = 'fontane') => {
        editingId = id;
        const panel = document.getElementById('admin-panel');
        panel.style.display = 'flex';
        
        // Reset o Pre-fill
        if(id) {
            const item = appData[type].find(x => x.id === id);
            document.getElementById('adm-type').value = type;
            document.getElementById('adm-name').value = item.nome || item.titolo;
            document.getElementById('adm-address').value = item.indirizzo || item.contenuto;
            document.getElementById('adm-lat').value = item.lat || '';
            document.getElementById('adm-lng').value = item.lng || '';
            document.getElementById('adm-image-url').value = item.immagine || '';
            document.getElementById('btn-delete').style.display = 'inline-block';
        } else {
            document.getElementById('adm-name').value = '';
            document.getElementById('adm-address').value = '';
            document.getElementById('adm-lat').value = '';
            document.getElementById('adm-lng').value = '';
            document.getElementById('adm-image-url').value = '';
            document.getElementById('btn-delete').style.display = 'none';
        }
    },

    closeAdminPanel: () => document.getElementById('admin-panel').style.display = 'none',

    saveData: async () => {
        const type = document.getElementById('adm-type').value;
        const data = {
            nome: document.getElementById('adm-name').value, // o titolo
            indirizzo: document.getElementById('adm-address').value, // o contenuto
            lat: parseFloat(document.getElementById('adm-lat').value) || 0,
            lng: parseFloat(document.getElementById('adm-lng').value) || 0,
            stato: document.getElementById('adm-status').value,
            immagine: document.getElementById('adm-image-url').value
        };

        if(type === 'news') { data.titolo = data.nome; data.contenuto = data.indirizzo; }

        // Upload Foto se presente
        const file = document.getElementById('adm-file').files[0];
        if(file) {
            const storageRef = ref(storage, 'uploads/' + Date.now() + '-' + file.name);
            await uploadBytes(storageRef, file);
            data.immagine = await getDownloadURL(storageRef);
        }

        if(editingId) {
            await updateDoc(doc(db, type, editingId), data);
        } else {
            await addDoc(collection(db, type), data);
        }
        alert("Salvato!");
        app.closeAdminPanel();
        app.loadFromFirebase();
    },

    deleteData: async () => {
        if(!editingId || !confirm("Eliminare definitivamente?")) return;
        const type = document.getElementById('adm-type').value;
        await deleteDoc(doc(db, type, editingId));
        alert("Eliminato");
        app.closeAdminPanel();
        app.loadFromFirebase();
    },

    getGPS: () => {
        navigator.geolocation.getCurrentPosition(p => {
            document.getElementById('adm-lat').value = p.coords.latitude;
            document.getElementById('adm-lng').value = p.coords.longitude;
        });
    },

    importInitialData: async () => {
        if(!confirm("Caricare dati esempio?")) return;
        const f = [{nome: "Fontana Gigante", indirizzo:"Via Partenope", lat:40.8322, lng:14.2496, stato:"funzionante"}];
        await addDoc(collection(db, "fontane"), f[0]);
        alert("Fatto");
        app.loadFromFirebase();
    }
};

// Monitor Auth
onAuthStateChanged(auth, user => {
    document.getElementById('admin-fab').style.display = user ? 'flex' : 'none';
});

// Start
window.app = app;
window.onload = app.init;