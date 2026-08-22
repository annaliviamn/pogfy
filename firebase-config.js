// Importa as funções do Firebase direto via CDN (sem precisar instalar nada)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

// Configuração do seu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA1O0QRJ0YX5bdsHOsaRiyTGokS7KmZ4EI",
  authDomain: "pogfy-eab10.firebaseapp.com",
  projectId: "pogfy-eab10",
  storageBucket: "pogfy-eab10.firebasestorage.app",
  messagingSenderId: "154735774226",
  appId: "1:154735774226:web:c4e37733a44f1613e3a6cb"
};

// Inicializa o Firebase e o Firestore, disponibilizando pro resto do app
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);