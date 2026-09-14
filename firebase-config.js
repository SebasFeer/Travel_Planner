// ============================================================
// firebase-config.js — Configuración de tu proyecto Firebase.
// Estas claves son públicas por diseño (no son contraseñas):
// la seguridad real la dan las Reglas de Firestore, no ocultar esto.
//
// Este archivo NO importa nada del SDK de Firebase a propósito:
// así, si algún día cambias de proveedor o falla la red, cargar
// este archivo nunca puede romper el resto de la app.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAf7_HlFAGs4cpxE5beaic5bXgmvdFOV5c",
  authDomain: "travel-planner-e16e1.firebaseapp.com",
  projectId: "travel-planner-e16e1",
  storageBucket: "travel-planner-e16e1.firebasestorage.app",
  messagingSenderId: "296430068371",
  appId: "1:296430068371:web:45e9fe3400d3f617362366",
};

export { firebaseConfig };
