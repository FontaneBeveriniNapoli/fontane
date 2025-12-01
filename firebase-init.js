// Questo file è già incluso in index.html come modulo ES6
// Viene fornito separatamente per riferimento

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

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
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Esporta per uso globale (se necessario)
window.firebaseApp = app;
window.db = db;
window.auth = auth;

console.log('Firebase inizializzato correttamente');