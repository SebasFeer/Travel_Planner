// ============================================================
// cloud.js — Cuenta (email/contraseña) y copia de seguridad en
// la nube (Firestore). Todo opcional: si no inicias sesión, o si
// no hay conexión con Firebase, la app sigue funcionando 100%
// local como hasta ahora — nunca debe romper el resto de la app.
// ============================================================

import { firebaseConfig } from "./firebase-config.js";
import { Data, STORES, onDataChange } from "./db.js";
import { isPro } from "./pro.js";

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

// ------------------------------------------------------------
// AUTOSYNC — guarda cambios en la nube automáticamente y descarga
// la copia más reciente al abrir la app, sin que el usuario tenga
// que darle a ningún botón. Todo esto es "a lo mejor esfuerzo": si
// no hay sesión o no hay red, no pasa nada, la app sigue en local.
//
// Guardamos dos marcas de tiempo en los ajustes locales (no viajan
// a la nube) para no perder nunca datos sin subir:
//   - sync_last_change_at: la última vez que se modificó algo local
//   - sync_last_pushed_at: la última vez que esa copia llegó a subir
// ------------------------------------------------------------
const SYNC_CHANGE_KEY = "sync_last_change_at";
const SYNC_PUSHED_KEY = "sync_last_pushed_at";
const AUTO_PUSH_DELAY_MS = 2000; // agrupa cambios seguidos en una sola subida

let autoSyncStarted = false;
let autoPushTimer = null;

function scheduleAutoPush() {
  if (autoPushTimer) clearTimeout(autoPushTimer);
  autoPushTimer = setTimeout(async () => {
    autoPushTimer = null;
    if (!currentUser()) return; // sin sesión: nada que subir
    await pushToCloud();
    await pushAllSharedTrips();
  }, AUTO_PUSH_DELAY_MS);
}

/**
 * Activa el autoguardado en la nube. A partir de aquí, cada cambio
 * en los datos (crear/editar/borrar un viaje, vuelo, gasto...) marca
 * la app como "con cambios pendientes" y programa una subida a los
 * pocos segundos (agrupando ediciones rápidas en una sola subida).
 * Si no has iniciado sesión, esto no hace nada (ni carga Firebase).
 */
function enableAutoSync() {
  if (autoSyncStarted) return;
  autoSyncStarted = true;
  onDataChange(() => {
    Data.settingSet(SYNC_CHANGE_KEY, Date.now()).catch(() => {});
    scheduleAutoPush();
  });
}

/**
 * Se llama una sola vez al arrancar la app, después de pintar la
 * pantalla con los datos locales (nunca esperamos a la red para
 * mostrar algo). Si hay una sesión ya recordada de antes:
 *
 *  - Si este dispositivo no tiene cambios sin subir, descarga la
 *    copia de la nube (por si se editó desde otro dispositivo).
 *  - Si este dispositivo SÍ tiene cambios sin subir (p. ej. se
 *    editó estando sin conexión), los sube primero en vez de
 *    descargar nada, para no perderlos nunca.
 *
 * Devuelve `true` si se han traído datos nuevos de la nube (para
 * que quien la llame vuelva a pintar la pantalla).
 */
function syncOnLaunch() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Si Firebase tarda demasiado en cargar (o no hay red), no nos
    // quedamos esperando para siempre.
    setTimeout(() => finish(false), 8000);

    onAuthChange(async (user) => {
      if (settled) return; // solo nos interesa el primer estado de sesión
      if (!user) {
        finish(false);
        return;
      }

      const [lastChange, lastPushed] = await Promise.all([
        Data.settingGet(SYNC_CHANGE_KEY).catch(() => undefined),
        Data.settingGet(SYNC_PUSHED_KEY).catch(() => undefined),
      ]);

      if ((lastChange || 0) > (lastPushed || 0)) {
        // Cambios locales sin subir todavía: los subimos primero.
        await pushToCloud();
        await pushAllSharedTrips();
        finish(false);
        return;
      }

      const res = await pullFromCloud();
      const sharedChanged = await refreshAllSharedTrips();
      finish(res.ok === true || sharedChanged);
    });
  });
}

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
    await Data.settingSet(SYNC_PUSHED_KEY, Date.now()).catch(() => {});
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
    // Local y nube ya coinciden: lo marcamos como sincronizado.
    await Data.settingSet(SYNC_PUSHED_KEY, Date.now()).catch(() => {});
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

// ============================================================
// VIAJES COMPARTIDOS (Pro) — un viaje concreto (no toda la cuenta)
// se guarda también en su propio documento de Firestore, al que
// puede unirse cualquiera que tenga el código. Es "el último que
// sube gana" igual que la copia de la cuenta: no hay fusión
// campo a campo, así que para uso simultáneo intenso (varias
// personas editando el mismo instante) puede pisarse algo — para
// una pareja o grupo planeando un viaje por turnos funciona bien.
// ============================================================

const SHARED_COLLECTION = "shared_trips";
const TRIP_CHILD_STORES = STORES.filter((s) => s !== "trips");

function genShareCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function exportTripPayload(tripId) {
  const trip = await Data.get("trips", tripId);
  if (!trip) return null;
  const payload = { trip };
  for (const storeName of TRIP_CHILD_STORES) {
    payload[storeName] = await Data.getAllByTrip(storeName, tripId);
  }
  return payload;
}

async function applyRemoteTripUpdate(localTripId, payload) {
  const localTrip = await Data.get("trips", localTripId);
  if (!localTrip || !payload || !payload.trip) return;
  const { id, ...remoteTripFields } = payload.trip;
  await Data.put("trips", { ...localTrip, ...remoteTripFields, id: localTripId, share_code: localTrip.share_code });
  await Data.replaceTripChildren(localTripId, payload);
}

/**
 * Convierte un viaje ya existente en tu lista en un viaje compartido:
 * genera (o reutiliza) un código de 6 caracteres y sube su contenido
 * a un documento propio en Firestore. Función Pro.
 */
async function shareTrip(tripId) {
  try {
    if (!(await isPro())) return { ok: false, error: "Compartir viajes es una función Pro." };
    const s = await ensureFirebase();
    const user = s.auth.currentUser;
    if (!user) return { ok: false, error: "Inicia sesión para compartir un viaje." };

    const trip = await Data.get("trips", tripId);
    if (!trip) return { ok: false, error: "Viaje no encontrado." };

    const code = trip.share_code || genShareCode();
    const payload = await exportTripPayload(tripId);

    await s.storeMod.setDoc(
      s.storeMod.doc(s.db, SHARED_COLLECTION, code),
      {
        ownerUid: user.uid,
        members: s.storeMod.arrayUnion(user.uid),
        data: JSON.stringify(payload),
        updatedAt: s.storeMod.serverTimestamp(),
      },
      { merge: true }
    );

    if (trip.share_code !== code) {
      await Data.put("trips", { ...trip, share_code: code });
    }
    return { ok: true, code };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

/**
 * Se une a un viaje compartido a partir de su código: lo añade como
 * un viaje nuevo en tu lista, con su propio id local. Función Pro.
 */
async function joinSharedTrip(code) {
  try {
    if (!(await isPro())) return { ok: false, error: "Unirse a viajes compartidos es una función Pro." };
    const s = await ensureFirebase();
    const user = s.auth.currentUser;
    if (!user) return { ok: false, error: "Inicia sesión para unirte a un viaje compartido." };

    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) return { ok: false, error: "Introduce un código." };

    const ref = s.storeMod.doc(s.db, SHARED_COLLECTION, cleanCode);
    const snap = await s.storeMod.getDoc(ref);
    if (!snap.exists()) return { ok: false, error: "No existe ningún viaje con ese código." };

    const payload = JSON.parse(snap.data().data);
    const { id, share_code, ...tripFields } = payload.trip;
    const newTripId = await Data.add("trips", { ...tripFields, share_code: cleanCode });
    await Data.replaceTripChildren(newTripId, payload);

    await s.storeMod.updateDoc(ref, { members: s.storeMod.arrayUnion(user.uid) });

    return { ok: true, tripId: newTripId };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

/**
 * Descarga la versión más reciente de un viaje ya compartido (por si
 * otro miembro ha hecho cambios) y sustituye sus datos locales.
 */
async function refreshSharedTrip(tripId) {
  try {
    const trip = await Data.get("trips", tripId);
    if (!trip || !trip.share_code) return { ok: false, error: "Este viaje no está compartido." };
    const s = await ensureFirebase();
    const snap = await s.storeMod.getDoc(s.storeMod.doc(s.db, SHARED_COLLECTION, trip.share_code));
    if (!snap.exists()) return { ok: false, error: "El viaje compartido ya no existe en la nube." };
    const payload = JSON.parse(snap.data().data);
    await applyRemoteTripUpdate(tripId, payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: friendlyAuthError(err) };
  }
}

// Sube la versión local de un viaje compartido concreto, si tiene
// código asignado. La llama el autosync tras cada subida general.
async function pushSharedTripIfNeeded(tripId) {
  if (!currentUser()) return;
  try {
    const trip = await Data.get("trips", tripId);
    if (!trip || !trip.share_code) return;
    const s = await ensureFirebase();
    const payload = await exportTripPayload(tripId);
    await s.storeMod.setDoc(
      s.storeMod.doc(s.db, SHARED_COLLECTION, trip.share_code),
      { data: JSON.stringify(payload), updatedAt: s.storeMod.serverTimestamp() },
      { merge: true }
    );
  } catch (err) {
    // sin conexión: se reintentará en el próximo cambio o al reabrir
  }
}

async function pushAllSharedTrips() {
  try {
    const trips = await Data.getAll("trips");
    for (const trip of trips) {
      if (trip.share_code) await pushSharedTripIfNeeded(trip.id);
    }
  } catch (err) {
    // nunca debe romper el autosync general
  }
}

/**
 * Descarga los cambios de todos los viajes compartidos locales.
 * Devuelve true si alguno trajo algo nuevo (para volver a pintar).
 */
async function refreshAllSharedTrips() {
  if (!currentUser()) return false;
  try {
    const trips = await Data.getAll("trips");
    let changed = false;
    for (const trip of trips) {
      if (!trip.share_code) continue;
      const res = await refreshSharedTrip(trip.id);
      if (res.ok) changed = true;
    }
    return changed;
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
  enableAutoSync,
  syncOnLaunch,
  shareTrip,
  joinSharedTrip,
  refreshSharedTrip,
  refreshAllSharedTrips,
};
