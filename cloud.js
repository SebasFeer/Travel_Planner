// ============================================================
// cloud.js — Cuenta (email/contraseña) y copia de seguridad en
// la nube (Firestore). Todo opcional: si no inicias sesión, o si
// no hay conexión con Firebase, la app sigue funcionando 100%
// local como hasta ahora — nunca debe romper el resto de la app.
// ============================================================

import { firebaseConfig } from "./firebase-config.js";
import { Data } from "./db.js";

const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";

let sdk = null;       // { app, auth, db, fns... } una vez cargado
let loadError = null; // motivo si falló la carga (sin red, etc.)
let loadingPromise = null;

// Carga el SDK de Firebase bajo demanda. Si falla (sin conexión,
// CDN bloqueado, etc.) lo recordamos y todas las funciones de este
// módulo devuelven un error amistoso en vez de romper la app.
function ensureFirebase() {
  if (sdk) return Promise.resolve(sdk);
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      const [{ initializeApp }, authMod, storeMod] = await Promise.all([
        import(`${SDK_BASE}/firebase-app.js`),
        import(`${SDK_BASE}/firebase-auth.js`),
        import(`${SDK_BASE}/firebase-firestore.js`),
      ]);

      const app = initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      const db = storeMod.getFirestore(app);

      sdk = { app, auth, db, authMod, storeMod };
      return sdk;
    } catch (err) {
      loadError = err;
      throw err;
    }
  })();

  return loadingPromise;
}

const NO_CONNECTION_MSG =
  "No se pudo conectar con el servicio de cuenta (revisa tu conexión a internet).";

function currentUser() {
  return sdk ? sdk.auth.currentUser : null;
}

/**
 * Se suscribe a cambios de sesión. Si Firebase no llega a cargar
 * (p. ej. sin red), simplemente no se llama nunca al callback —
 * el resto de la app sigue funcionando en modo 100% local.
 */
function onAuthChange(callback) {
  ensureFirebase()
    .then((s) => s.authMod.onAuthStateChanged(s.auth, callback))
    .catch(() => {
      /* sin conexión con Firebase: la app sigue en modo local */
    });
}

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/email-already-in-use": "Ya existe una cuenta con ese email.",
    "auth/invalid-email": "El email no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/user-not-found": "No existe ninguna cuenta con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/network-request-failed": "Sin conexión a internet.",
  };
  return map[code] || NO_CONNECTION_MSG;
}

async function signUp(email, password) {
  try {
    const s = await ensureFirebase();
    const cred = await s.authMod.createUserWithEmailAndPassword(s.auth, email, password);
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: friendlyAuthError(err) };
  }
}

async function signIn(email, password) {
  try {
    const s = await ensureFirebase();
    const cred = await s.authMod.signInWithEmailAndPassword(s.auth, email, password);
    return { user: cred.user, error: null };
  } catch (err) {
    return { user: null, error: friendlyAuthError(err) };
  }
}

async function signOutUser() {
  try {
    const s = await ensureFirebase();
    await s.authMod.signOut(s.auth);
  } catch (err) {
    // si no había sesión de Firebase cargada, no hay nada que cerrar
  }
}

/**
 * Sube todos los datos locales (IndexedDB) a Firestore, bajo el
 * documento del usuario. Sobrescribe lo que hubiera antes en la nube.
 */
async function pushToCloud() {
  try {
    const s = await ensureFirebase();
    const user = s.auth.currentUser;
    if (!user) return { ok: false, error: "No has iniciado sesión." };
    const dump = await Data.exportAll();
    await s.storeMod.setDoc(s.storeMod.doc(s.db, "users", user.uid), {
      data: JSON.stringify(dump),
      updatedAt: s.storeMod.serverTimestamp(),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

/**
 * Descarga la copia de la nube y sustituye los datos locales.
 * Devuelve { ok:false, empty:true } si el usuario no tiene copia todavía.
 */
async function pullFromCloud() {
  try {
    const s = await ensureFirebase();
    const user = s.auth.currentUser;
    if (!user) return { ok: false, error: "No has iniciado sesión." };
    const snap = await s.storeMod.getDoc(s.storeMod.doc(s.db, "users", user.uid));
    if (!snap.exists()) return { ok: false, empty: true };
    const dump = JSON.parse(snap.data().data);
    await Data.importAll(dump);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

async function cloudHasBackup() {
  try {
    const s = await ensureFirebase();
    const user = s.auth.currentUser;
    if (!user) return false;
    const snap = await s.storeMod.getDoc(s.storeMod.doc(s.db, "users", user.uid));
    return snap.exists();
  } catch (err) {
    return false;
  }
}

export {
  currentUser,
  onAuthChange,
  signUp,
  signIn,
  signOutUser,
  pushToCloud,
  pullFromCloud,
  cloudHasBackup,
};
