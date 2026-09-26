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

let currentUser = null;

async function loadTrips(user) {
  currentUser = user;
  show("#view-loading");
  const { db, storeMod } = await loadFirebase();
  try {
    const snap = await storeMod.getDoc(storeMod.doc(db, "users", user.uid));
    dump = snap.exists() ? JSON.parse(snap.data().data || "{}") : { trips: [] };
  } catch (err) {
    show("#view-trips");
    $("#trips-root").innerHTML = `
      ${accountBar("Mis viajes")}
      <div class="empty">
        <span class="label">Error</span>
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

// Clic en "Cerrar sesión" (el botón se vuelve a pintar en cada vista).
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#btn-logout")) return;
  const s = await loadFirebase();
  await s.authMod.signOut(s.auth);
  history.replaceState(null, "", location.pathname);
});

function accountBar(title) {
  const who = currentUser ? currentUser.email || currentUser.displayName || "" : "";
  return `
    <div class="account-bar">
      <div>
        <span class="label readonly-pill">Solo lectura · ${esc(who)}</span>
        <h1>${esc(title)}</h1>
      </div>
      <div class="actions">
        <a class="btn btn-primary btn-sm" href="../">Editar en la app</a>
        <button class="btn btn-ghost btn-sm" id="btn-logout" type="button">Cerrar sesión</button>
      </div>
    </div>`;
}

// Código de 3 letras para la tarjeta de embarque, sacado del nombre
// del destino ("Lisboa, Portugal" -> "LIS"). Es solo decorativo: no
// pretende ser el código IATA real del aeropuerto.
function placeCode(text) {
  const clean = String(text || "")
    .split(",")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return clean.slice(0, 3) || "···";
}

function renderList() {
  const trips = [...(dump.trips || [])].sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const root = $("#trips-root");

  if (!trips.length) {
    root.innerHTML = `
      ${accountBar("Mis viajes")}
      <div class="empty">
        <span class="label">Sin viajes</span>
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
  root.innerHTML =
    accountBar("Mis viajes") +
    groups
      .map(([key, label]) => {
        let list = trips.filter((t) => tripStatus(t) === key);
        if (key === "past") list = list.reverse(); // el más reciente primero
        if (!list.length) return "";
        return `
          <div class="trips-group">
            <span class="label">${label} · ${list.length}</span>
            <div class="trip-list">${list.map(tripPass).join("")}</div>
          </div>`;
      })
      .join("") +
    `<div style="height:96px"></div>`;
}

function tripPass(trip) {
  const status = tripStatus(trip);
  const days = daysUntil(trip.start_date);
  let big = "";
  let small = "";
  if (status === "ongoing") {
    big = "En curso";
    small = `Termina el ${prettyDate(trip.end_date)}`;
  } else if (status === "upcoming" && days != null) {
    big = days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`;
    small = days > 1 ? "para salir" : "sales";
  } else {
    big = "Completado";
    small = prettyDate(trip.end_date);
  }

  const chips = [
    ["flights", "--c-flights", "vuelo", "vuelos"],
    ["hotels", "--c-hotels", "hotel", "hoteles"],
    ["itinerary", "--c-itinerary", "actividad", "actividades"],
    ["reservations", "--c-reservations", "reserva", "reservas"],
  ]
    .map(([store, color, one, many]) => {
      const n = byTrip(store, trip.id).length;
      return n ? `<span class="chip" style="--accent:var(${color})"><i></i>${n} ${n === 1 ? one : many}</span>` : "";
    })
    .join("");

  const firstFlight = byTrip("flights", trip.id).sort(sortByDateTime)[0];
  const from = firstFlight && firstFlight.origin ? placeCode(firstFlight.origin) : "";

  return `
    <a class="pass" href="#viaje-${esc(trip.id)}">
      <div class="pass-main">
        <span class="label">${esc(trip.name || "Viaje")}</span>
        <div class="route">
          ${from ? `<span class="code">${esc(from)}</span><span class="plane"></span>` : ""}
          <span class="code">${esc(placeCode(trip.destination))}</span>
        </div>
        <div class="kv">
          <div><span class="label">Destino</span><b>${esc(trip.destination)}</b></div>
          <div><span class="label">Salida</span><b class="mono">${esc(prettyDate(trip.start_date))}</b></div>
          <div><span class="label">Vuelta</span><b class="mono">${esc(prettyDate(trip.end_date))}</b></div>
          <div><span class="label">Días</span><b class="mono">${daysBetween(trip.start_date, trip.end_date) || "—"}</b></div>
        </div>
        <div class="chips">${chips}${trip.share_code ? `<span class="chip" style="--accent:var(--brand)"><i></i>Compartido</span>` : ""}</div>
      </div>
      <div class="pass-stub">
        <div class="countdown ${status}">
          <span class="label">${status === "past" ? "Estado" : status === "ongoing" ? "Estado" : "Faltan"}</span>
          <b>${esc(big)}</b>
          <span class="muted small">${esc(small)}</span>
        </div>
        ${trip.photo_url ? `<div class="photo" style='${bgUrl(trip.photo_url)}'></div>` : `<div class="barcode" aria-hidden="true"></div>`}
      </div>
    </a>`;
}

function block(title, accent, items, rowFn) {
  if (!items.length) return "";
  return `
    <div class="block" style="--accent: var(${accent})">
      <div class="block-head"><span class="sw"></span><h2>${title}</h2><span class="n">${String(items.length).padStart(2, "0")}</span></div>
      <div class="rows">${items.map(rowFn).join("")}</div>
    </div>`;
}

function row(when, title, sub, right, extraClass = "") {
  return `
    <div class="row ${extraClass}">
      <div class="when">${when || ""}</div>
      <div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>
      <div class="r">${right || ""}</div>
    </div>`;
}

const sortByDateTime = (a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
const whenHtml = (date, time) => (date || time ? `${time ? `<b>${esc(time)}</b>` : ""}${esc(prettyDate(date))}` : "");

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
  const pct = budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0;

  // Itinerario agrupado por día
  let lastDay = null;
  const itineraryHtml = itinerary.length
    ? `
    <div class="block" style="--accent: var(--c-itinerary)">
      <div class="block-head"><span class="sw"></span><h2>Itinerario</h2><span class="n">${String(itinerary.length).padStart(2, "0")}</span></div>
      <div class="rows">
        ${itinerary
          .map((a) => {
            const head = a.date !== lastDay ? `<div class="day-label">${a.date ? esc(prettyDate(a.date)) : "Sin fecha"}</div>` : "";
            lastDay = a.date;
            const type = a.type && a.type !== "Detectar automático" ? a.type : "";
            return head + row(a.time ? `<b>${esc(a.time)}</b>` : "", esc(a.title), esc(a.location || ""), esc(type));
          })
          .join("")}
      </div>
    </div>`
    : "";

  const blocks =
    block("Vuelos", "--c-flights", flights, (f) =>
      row(
        whenHtml(f.date, f.time),
        esc([f.origin, f.destination].filter(Boolean).join(" → ") || "Vuelo"),
        esc([f.airline, f.return_date ? `vuelta ${prettyDate(f.return_date)}` : ""].filter(Boolean).join(" · ")),
        esc(f.flight_number || "")
      )
    ) +
    block("Hoteles", "--c-hotels", hotels, (h) =>
      row(
        `<b>${esc(prettyDate(h.check_in))}</b>${esc(prettyDate(h.check_out))}`,
        esc(h.name || "Hotel"),
        esc([h.address, h.booking_code ? `Reserva ${h.booking_code}` : ""].filter(Boolean).join(" · ")),
        h.price ? money(h.price) : ""
      )
    ) +
    itineraryHtml +
    block("Transporte", "--c-transport", transport, (t) =>
      row(
        whenHtml(t.date, t.time),
        esc([t.origin, t.destination].filter(Boolean).join(" → ") || t.type || "Transporte"),
        esc([t.type, t.company, t.booking_code].filter(Boolean).join(" · ")),
        t.price ? money(t.price) : ""
      )
    ) +
    block("Reservas", "--c-reservations", reservations, (r) =>
      row(
        whenHtml(r.date, r.time),
        esc(r.name || r.type || "Reserva"),
        esc([r.type && r.name ? r.type : "", r.location].filter(Boolean).join(" · ")),
        esc(r.booking_code || (r.price ? money(r.price) : ""))
      )
    ) +
    block("Gastos", "--c-expenses", expenses, (e) =>
      row(esc(e.date ? prettyDate(e.date) : ""), esc(e.description || e.category || "Gasto"), esc(e.description ? e.category || "" : ""), money(e.amount))
    ) +
    (checklist.length
      ? `
    <div class="block" style="--accent: var(--c-checklist)">
      <div class="block-head"><span class="sw"></span><h2>Checklist</h2><span class="n">${done}/${checklist.length}</span></div>
      <div class="rows">
        ${checklist
          .map(
            (c) => `
          <div class="row check ${c.completed ? "done" : ""}">
            <span class="tick">${c.completed ? "✓" : ""}</span>
            <div class="t">${esc(c.task)}</div>
          </div>`
          )
          .join("")}
      </div>
    </div>`
      : "");

  $("#trips-root").innerHTML = `
    ${accountBar(trip.name || trip.destination)}
    <div class="detail-top">
      <a class="btn btn-secondary btn-sm" href="#"><span class="arrow">←</span> Todos los viajes</a>
    </div>
    <div class="detail-grid">
      <div>
        ${blocks || `<div class="empty"><span class="label">Vacío</span><h2>Este viaje aún no tiene nada</h2><p class="muted">Añade vuelos, hoteles o actividades desde la app.</p></div>`}
      </div>
      <aside class="detail-side">
        <div class="side-card">
          ${trip.photo_url ? `<div class="photo" style='${bgUrl(trip.photo_url)}'></div>` : ""}
          <span class="label">Destino</span>
          <div style="font:800 34px/1.05 var(--f-display); font-stretch:125%; margin:6px 0 4px">${esc(placeCode(trip.destination))}</div>
          <div class="muted small" style="margin-bottom:12px">${esc(trip.destination)}</div>
          <div class="stat-row"><span>Salida</span><b>${esc(prettyDate(trip.start_date))}</b></div>
          <div class="stat-row"><span>Vuelta</span><b>${esc(prettyDate(trip.end_date))}</b></div>
          <div class="stat-row"><span>Duración</span><b>${daysBetween(trip.start_date, trip.end_date) || "—"} días</b></div>
          ${checklist.length ? `<div class="stat-row"><span>Checklist</span><b>${done}/${checklist.length}</b></div>` : ""}
        </div>
        <div class="side-card">
          <span class="label">Gastado</span>
          <div style="font:800 30px/1.1 var(--f-display); font-stretch:115%; margin-top:6px">${money(spent)}</div>
          ${
            budget
              ? `<div class="meter ${spent > budget ? "over" : ""}"><i style="width:${pct}%"></i></div>
                 <div class="muted small">${pct}% de ${money(budget)} de presupuesto</div>`
              : `<div class="muted small">Sin presupuesto definido</div>`
          }
        </div>
        ${trip.notes ? `<div class="side-card"><span class="label">Notas</span><p style="white-space:pre-wrap; margin:8px 0 0; color:var(--ink-2)">${esc(trip.notes)}</p></div>` : ""}
      </aside>
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

init();
