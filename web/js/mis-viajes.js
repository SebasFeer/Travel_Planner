// ============================================================
// mis-viajes.js — Zona "Mis viajes" de la web de Viajoo.
//
// Inicia sesión con la MISMA cuenta de Firebase que la app
// (email/contraseña o Google) y muestra los viajes que la app ha
// subido a la nube, en users/{uid}.data (un JSON con el volcado
// completo de IndexedDB, ver pushToCloud en js/cloud.js).
//
// SOLO LECTURA a propósito: esta página nunca escribe en Firestore.
// La app sube su copia entera y sobrescribe lo que haya ("gana la
// última escritura"), así que editar desde aquí podría pisar cambios
// hechos en el móvil. Para editar, se abre la app.
// ============================================================

import { firebaseConfig } from "../../js/firebase-config.js";

// Misma versión del SDK que usa la app (js/cloud.js).
const SDK_BASE = "https://www.gstatic.com/firebasejs/12.19.0";

const $ = (sel) => document.querySelector(sel);
const views = ["#view-loading", "#view-login", "#view-trips"];
function show(id) {
  for (const v of views) $(v).hidden = v !== id;
}

document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

// ------------------------------------------------------------
// Firebase
// ------------------------------------------------------------

let fb = null;
async function loadFirebase() {
  if (fb) return fb;
  const [{ initializeApp }, authMod, storeMod] = await Promise.all([
    import(`${SDK_BASE}/firebase-app.js`),
    import(`${SDK_BASE}/firebase-auth.js`),
    import(`${SDK_BASE}/firebase-firestore.js`),
  ]);
  // Con nombre propio ("viajoo-web") a propósito: Firebase guarda la
  // sesión por nombre de app, y la web vive en el mismo dominio que la
  // app. Si compartieran sesión, entrar aquí dejaría también la app de
  // este navegador con sesión iniciada, y al abrirla subiría sus datos
  // locales a la nube pisando los del móvil (syncOnLaunch en cloud.js).
  // Así, iniciar o cerrar sesión en la web nunca toca a la app.
  const app = initializeApp(firebaseConfig, "viajoo-web");
  fb = { auth: authMod.getAuth(app), db: storeMod.getFirestore(app), authMod, storeMod };
  return fb;
}

function friendlyAuthError(err) {
  const code = err && err.code ? err.code : "";
  const map = {
    "auth/invalid-email": "El email no es válido.",
    "auth/missing-password": "Escribe tu contraseña.",
    "auth/user-not-found": "No existe ninguna cuenta con ese email.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/invalid-credential": "Email o contraseña incorrectos.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/network-request-failed": "Sin conexión a internet.",
    "auth/account-exists-with-different-credential":
      "Ya existe una cuenta con ese email usando otro método de acceso (por ejemplo, con contraseña).",
    "auth/unauthorized-domain":
      "Este sitio no está autorizado todavía para iniciar sesión con Google (falta configurarlo en Firebase).",
    "auth/popup-blocked": "El navegador bloqueó la ventana de Google. Inténtalo de nuevo.",
    "auth/operation-not-allowed": "Este método de acceso no está activado para Viajoo.",
    "permission-denied": "No tienes permiso para leer estos datos.",
    unavailable: "No se pudo conectar con la nube. Revisa tu conexión.",
  };
  return map[code] || "No se pudo conectar con el servicio de cuenta (revisa tu conexión a internet).";
}

// ------------------------------------------------------------
// Utilidades de formato (mismo estilo que js/utils.js de la app)
// ------------------------------------------------------------

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value) {
  const n = parseFloat(value || 0);
  return `${n.toFixed(2)} €`;
}

function prettyDate(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1] || m} ${y}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  const ms = new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`);
  return Math.round(ms / 86400000) + 1;
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(`${iso}T00:00:00`) - new Date(`${todayIso()}T00:00:00`)) / 86400000);
}

function bgUrl(url) {
  return url ? `background-image:url("${String(url).replace(/["\\\n\r]/g, "")}")` : "";
}

// ------------------------------------------------------------
// Datos
// ------------------------------------------------------------

let dump = null; // { trips: [...], flights: [...], ... }

function byTrip(store, tripId) {
  return (dump[store] || []).filter((r) => r.trip_id === tripId);
}

function tripStatus(trip) {
  const today = todayIso();
  if (trip.end_date && trip.end_date < today) return "past";
  if (trip.start_date && trip.start_date <= today) return "ongoing";
  return "upcoming";
}

async function loadTrips(user) {
  $("#who").textContent = user.email || user.displayName || "";
  show("#view-loading");
  const { db, storeMod } = await loadFirebase();
  try {
    const snap = await storeMod.getDoc(storeMod.doc(db, "users", user.uid));
    dump = snap.exists() ? JSON.parse(snap.data().data || "{}") : { trips: [] };
  } catch (err) {
    show("#view-trips");
    $("#trips-root").innerHTML = `
      <div class="card empty">
        <div class="big">⚠️</div>
        <h2>No se pudieron cargar tus viajes</h2>
        <p class="muted">${esc(friendlyAuthError(err))}</p>
      </div>`;
    return;
  }
  show("#view-trips");
  render();
}

// ------------------------------------------------------------
// Pintar
// ------------------------------------------------------------

function render() {
  const match = location.hash.match(/^#viaje-(\d+)$/);
  const trip = match && (dump.trips || []).find((t) => String(t.id) === match[1]);
  if (trip) renderTrip(trip);
  else renderList();
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => dump && render());

function renderList() {
  const trips = [...(dump.trips || [])].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const root = $("#trips-root");

  if (!trips.length) {
    root.innerHTML = `
      <div class="card empty">
        <div class="big">🧳</div>
        <h2>Aún no hay viajes en la nube</h2>
        <p class="muted">Crea un viaje en la app con la sesión iniciada y aparecerá aquí en unos segundos.</p>
        <a class="btn btn-primary" href="../">Abrir Viajoo</a>
      </div>`;
    return;
  }

  const groups = [
    ["ongoing", "En curso"],
    ["upcoming", "Próximos"],
    ["past", "Pasados"],
  ];
  root.innerHTML = groups
    .map(([key, label]) => {
      let list = trips.filter((t) => tripStatus(t) === key);
      if (key === "past") list = list.reverse(); // el más reciente primero
      if (!list.length) return "";
      return `
        <div class="trips-group">
          <h2>${label}</h2>
          <div class="trip-grid">${list.map(tripCard).join("")}</div>
        </div>`;
    })
    .join("");
}

function tripCard(trip) {
  const status = tripStatus(trip);
  const days = daysUntil(trip.start_date);
  let badge = "";
  if (status === "ongoing") badge = "En curso";
  else if (status === "upcoming" && days != null) badge = days === 0 ? "¡Hoy!" : days === 1 ? "Mañana" : `En ${days} días`;
  else if (status === "past") badge = "Completado";

  const counts = [
    ["flights", "✈️", "vuelo", "vuelos"],
    ["hotels", "🏨", "hotel", "hoteles"],
    ["itinerary", "🗺️", "actividad", "actividades"],
  ]
    .map(([store, emoji, one, many]) => {
      const n = byTrip(store, trip.id).length;
      return n ? `<span class="pill">${emoji} ${n} ${n === 1 ? one : many}</span>` : "";
    })
    .join("");

  return `
    <a class="trip-card" href="#viaje-${esc(trip.id)}" style="text-decoration:none">
      <div class="cover" style='${bgUrl(trip.photo_url)}'>${badge ? `<span class="badge">${badge}</span>` : ""}</div>
      <div class="info">
        <h3>${esc(trip.name || trip.destination)}</h3>
        <div class="dest">📍 ${esc(trip.destination)} · ${prettyDate(trip.start_date)} – ${prettyDate(trip.end_date)}</div>
        <div class="counts">${counts}${trip.share_code ? `<span class="pill">👥 Compartido</span>` : ""}</div>
      </div>
    </a>`;
}

function section(title, accent, items, rowFn) {
  if (!items.length) return "";
  return `
    <div class="block" style="--accent: var(${accent})">
      <h2><span class="sw"></span>${title} <span class="muted" style="font-weight:500">(${items.length})</span></h2>
      <div class="rows">${items.map(rowFn).join("")}</div>
    </div>`;
}

function row(title, sub, right, extraClass = "") {
  return `
    <div class="row ${extraClass}">
      <div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>
      ${right ? `<div class="r">${right}</div>` : ""}
    </div>`;
}

const sortByDateTime = (a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
const when = (date, time) => [prettyDate(date), time].filter(Boolean).join(" · ");

function renderTrip(trip) {
  const flights = byTrip("flights", trip.id).sort(sortByDateTime);
  const hotels = byTrip("hotels", trip.id).sort((a, b) => (a.check_in || "").localeCompare(b.check_in || ""));
  const itinerary = byTrip("itinerary", trip.id).sort(sortByDateTime);
  const transport = byTrip("transport", trip.id).sort(sortByDateTime);
  const reservations = byTrip("reservations", trip.id).sort(sortByDateTime);
  const expenses = byTrip("expenses", trip.id);
  const checklist = byTrip("checklist", trip.id).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const spent = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const done = checklist.filter((c) => c.completed).length;
  const budget = parseFloat(trip.budget || 0);

  // Itinerario agrupado por día
  let lastDay = null;
  const itineraryHtml = itinerary.length
    ? `
    <div class="block" style="--accent: var(--c-itinerary)">
      <h2><span class="sw"></span>Itinerario <span class="muted" style="font-weight:500">(${itinerary.length})</span></h2>
      <div class="rows">
        ${itinerary
          .map((a) => {
            const head = a.date !== lastDay ? `<div class="day-label">${a.date ? prettyDate(a.date) : "Sin fecha"}</div>` : "";
            lastDay = a.date;
            return head + row(esc(a.title), esc([a.location, a.type && a.type !== "Detectar automático" ? a.type : ""].filter(Boolean).join(" · ")), esc(a.time || ""));
          })
          .join("")}
      </div>
    </div>`
    : "";

  $("#trips-root").innerHTML = `
    <div class="trip-detail">
      <a class="btn btn-secondary btn-sm back" href="#">← Todos los viajes</a>
      <div class="detail-hero" style='${bgUrl(trip.photo_url)}'>
        <div class="txt">
          <h1>${esc(trip.name || trip.destination)}</h1>
          <p>📍 ${esc(trip.destination)} · ${prettyDate(trip.start_date)} – ${prettyDate(trip.end_date)}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><div class="k">Duración</div><div class="v">${daysBetween(trip.start_date, trip.end_date) || "—"} días</div></div>
        <div class="stat"><div class="k">Gastado</div><div class="v">${money(spent)}</div></div>
        ${budget ? `<div class="stat"><div class="k">Presupuesto</div><div class="v">${money(budget)}</div></div>` : ""}
        ${checklist.length ? `<div class="stat"><div class="k">Checklist</div><div class="v">${done}/${checklist.length}</div></div>` : ""}
      </div>

      ${trip.notes ? `<div class="card" style="padding:16px 20px"><div class="muted" style="white-space:pre-wrap">${esc(trip.notes)}</div></div>` : ""}

      ${section("Vuelos", "--c-flights", flights, (f) =>
        row(
          esc([f.airline, f.flight_number].filter(Boolean).join(" ") || "Vuelo"),
          esc([f.origin, f.destination].filter(Boolean).join(" → ")),
          esc(when(f.date, f.time)) + (f.return_date ? `<br>Vuelta: ${esc(prettyDate(f.return_date))}` : "")
        )
      )}
      ${section("Hoteles", "--c-hotels", hotels, (h) =>
        row(
          esc(h.name || "Hotel"),
          esc([h.address, h.booking_code ? `Reserva ${h.booking_code}` : ""].filter(Boolean).join(" · ")),
          `${esc(prettyDate(h.check_in))} – ${esc(prettyDate(h.check_out))}${h.price ? `<br>${money(h.price)}` : ""}`
        )
      )}
      ${itineraryHtml}
      ${section("Transporte", "--c-transport", transport, (t) =>
        row(
          esc([t.type, t.company].filter(Boolean).join(" · ") || "Transporte"),
          esc([t.origin, t.destination].filter(Boolean).join(" → ")),
          esc(when(t.date, t.time)) + (t.price ? `<br>${money(t.price)}` : "")
        )
      )}
      ${section("Reservas", "--c-reservations", reservations, (r) =>
        row(
          esc(r.name || r.type || "Reserva"),
          esc([r.type && r.name ? r.type : "", r.location, r.booking_code ? `Código ${r.booking_code}` : ""].filter(Boolean).join(" · ")),
          esc(when(r.date, r.time)) + (r.price ? `<br>${money(r.price)}` : "")
        )
      )}
      ${section("Gastos", "--c-expenses", expenses, (e) =>
        row(esc(e.description || e.category || "Gasto"), esc(e.description ? e.category || "" : ""), `<b>${money(e.amount)}</b>`)
      )}
      ${section("Checklist", "--c-checklist", checklist, (c) =>
        row(`${c.completed ? "✅" : "⬜"} ${esc(c.task)}`, "", "", c.completed ? "done" : "")
      )}
    </div>`;
}

// ------------------------------------------------------------
// Acceso
// ------------------------------------------------------------

async function init() {
  let s;
  try {
    s = await loadFirebase();
  } catch (err) {
    show("#view-login");
    $("#login-error").textContent = friendlyAuthError(err);
    return;
  }

  // Por si se volvió de un inicio de sesión con Google por redirección.
  s.authMod.getRedirectResult(s.auth).catch((err) => {
    $("#login-error").textContent = friendlyAuthError(err);
  });

  s.authMod.onAuthStateChanged(s.auth, (user) => {
    if (user) loadTrips(user);
    else {
      dump = null;
      show("#view-login");
    }
  });
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = $("#btn-login");
  $("#login-error").textContent = "";
  btn.disabled = true;
  try {
    const s = await loadFirebase();
    await s.authMod.signInWithEmailAndPassword(s.auth, form.email.value.trim(), form.password.value);
  } catch (err) {
    $("#login-error").textContent = friendlyAuthError(err);
  } finally {
    btn.disabled = false;
  }
});

$("#btn-google").addEventListener("click", async () => {
  $("#login-error").textContent = "";
  let s;
  try {
    s = await loadFirebase();
  } catch (err) {
    $("#login-error").textContent = friendlyAuthError(err);
    return;
  }
  const provider = new s.authMod.GoogleAuthProvider();
  try {
    await s.authMod.signInWithPopup(s.auth, provider);
  } catch (err) {
    const code = err && err.code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      await s.authMod.signInWithRedirect(s.auth, provider).catch((e2) => {
        $("#login-error").textContent = friendlyAuthError(e2);
      });
      return;
    }
    $("#login-error").textContent = friendlyAuthError(err);
  }
});

$("#btn-reset").addEventListener("click", async (e) => {
  e.preventDefault();
  const email = $("#login-form").email.value.trim();
  if (!email) {
    $("#login-error").textContent = "Escribe tu email arriba y vuelve a pulsar para recibir el enlace.";
    return;
  }
  try {
    const s = await loadFirebase();
    await s.authMod.sendPasswordResetEmail(s.auth, email);
    $("#login-error").textContent = "";
    alert(`Si existe una cuenta con ${email}, te llegará un email para cambiar la contraseña.`);
  } catch (err) {
    $("#login-error").textContent = friendlyAuthError(err);
  }
});

$("#btn-logout").addEventListener("click", async () => {
  const s = await loadFirebase();
  await s.authMod.signOut(s.auth);
  history.replaceState(null, "", location.pathname);
});

init();
