// ============================================================
// app.js — Viajoo en la web (mis-viajes.html).
//
// Es otra interfaz sobre LOS MISMOS datos que la app:
//   - db.js      -> mismo IndexedDB local ("travelplanner")
//   - cloud.js   -> misma cuenta de Firebase y misma sincronización
//                   (subida automática tras cada cambio, descarga al
//                   abrir si no hay cambios pendientes)
// Por eso la web y la app nunca se pisan entre sí dentro del mismo
// navegador, y entre dispositivos se comportan igual que la app en
// otro móvil. No se toca ningún archivo de la app: solo se importan.
// ============================================================

import { Data, onDataChange } from "../../js/db.js";
import {
  onAuthChange,
  signIn,
  signUp,
  signInWithGoogle,
  completeGoogleRedirect,
  signOutUser,
  pushToCloud,
  pullFromCloud,
  cloudHasBackup,
  enableAutoSync,
  syncOnLaunch,
} from "../../js/cloud.js";
import { findDestinationPhoto } from "../../js/photo.js";
import { geocodeAll, routeBetween, optimizeRouteOrder } from "../../js/geocode.js";
import { escapeHtml as esc, formatDatePretty, todayString, money, mapsQueryUrl } from "../../js/utils.js";

const $ = (sel, el = document) => el.querySelector(sel);
const app = $("#app");

// ------------------------------------------------------------
// Estado
// ------------------------------------------------------------
const state = {
  user: null,
  view: "home", // "home" | "trip"
  tripId: null,
  tab: "overview",
};

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------
const pretty = (iso) => (iso ? formatDatePretty(iso) : "");
const pad2 = (n) => String(n).padStart(2, "0");

function tripDays(trip) {
  if (!trip.start_date || !trip.end_date) return null;
  return Math.round((new Date(trip.end_date) - new Date(trip.start_date)) / 86400000) + 1;
}

function daysTo(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso) - new Date(todayString())) / 86400000);
}

function tripStatus(trip) {
  const today = todayString();
  if (trip.end_date && trip.end_date < today) return "past";
  if (trip.start_date && trip.start_date <= today) return "ongoing";
  return "upcoming";
}

// Código de 3 letras decorativo para la tarjeta de embarque
// ("Lisboa, Portugal" -> "LIS"); no es el código IATA real.
function placeCode(text) {
  const clean = String(text || "")
    .split(",")[0]
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return clean.slice(0, 3) || "···";
}

function bg(url) {
  return url ? `<img src="${esc(url)}" alt="" />` : "";
}

const sortByDateTime = (a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`);
const whenHtml = (date, time) => (date || time ? `${time ? `<b>${esc(time)}</b>` : ""}${esc(pretty(date))}` : "");

function toast(msg) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// Confirmación dentro de la página (sin confirm() del navegador).
function confirmBox(text, okLabel = "Eliminar") {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width:420px">
        <h2>¿Seguro?</h2>
        <p class="muted" style="margin-top:-8px">${esc(text)}</p>
        <div class="foot"><div class="right">
          <button class="btn btn-secondary" data-no type="button">Cancelar</button>
          <button class="btn btn-primary" data-yes type="button" style="background:var(--danger)">${esc(okLabel)}</button>
        </div></div>
      </div>`;
    const close = (v) => {
      back.remove();
      resolve(v);
    };
    back.addEventListener("click", (e) => e.target === back && close(false));
    $("[data-no]", back).addEventListener("click", () => close(false));
    $("[data-yes]", back).addEventListener("click", () => close(true));
    document.body.appendChild(back);
  });
}

// ------------------------------------------------------------
// Formularios (mismos campos que la app, ver sections.js/app.js)
// ------------------------------------------------------------
const FORMS = {
  trips: {
    single: "viaje",
    fields: [
      { name: "name", label: "Nombre del viaje", required: true, full: true, placeholder: "Ej. Escapada de verano" },
      { name: "destination", label: "Destino", required: true, full: true, placeholder: "Ej. Lisboa, Portugal" },
      { name: "start_date", label: "Fecha de inicio", type: "date", required: true },
      { name: "end_date", label: "Fecha de fin", type: "date", required: true },
      { name: "budget", label: "Presupuesto (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
  flights: {
    single: "vuelo",
    fields: [
      { name: "airline", label: "Aerolínea" },
      { name: "flight_number", label: "Nº de vuelo" },
      { name: "origin", label: "Origen" },
      { name: "destination", label: "Destino" },
      { name: "date", label: "Fecha", type: "date", required: true },
      { name: "time", label: "Hora", type: "time" },
      { name: "return_date", label: "Fecha de vuelta (si aplica)", type: "date", full: true },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
  hotels: {
    single: "hotel",
    fields: [
      { name: "name", label: "Nombre", required: true, full: true },
      { name: "address", label: "Dirección", full: true },
      { name: "check_in", label: "Entrada", type: "date" },
      { name: "check_in_time", label: "Hora de entrada (opcional)", type: "time" },
      { name: "check_out", label: "Salida", type: "date" },
      { name: "booking_code", label: "Código de reserva" },
      { name: "price", label: "Precio (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
  itinerary: {
    single: "actividad",
    fields: [
      { name: "title", label: "Título", required: true, full: true },
      { name: "date", label: "Fecha", type: "date", required: true },
      { name: "time", label: "Hora", type: "time" },
      { name: "location", label: "Lugar" },
      { name: "type", label: "Tipo", type: "select", options: ["Detectar automático", "Restaurante", "Museo", "Monumento", "Naturaleza", "Compras", "Alojamiento"] },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
  transport: {
    single: "transporte",
    fields: [
      { name: "type", label: "Tipo", type: "select", options: ["Avión", "Tren", "Bus", "Coche", "Barco", "Otro"] },
      { name: "company", label: "Compañía" },
      { name: "origin", label: "Origen" },
      { name: "destination", label: "Destino" },
      { name: "date", label: "Fecha", type: "date" },
      { name: "time", label: "Hora", type: "time" },
      { name: "booking_code", label: "Código de reserva" },
      { name: "price", label: "Precio (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
  reservations: {
    single: "reserva",
    fields: [
      { name: "type", label: "Tipo", type: "select", options: ["Restaurante", "Actividad", "Entrada", "Otro"] },
      { name: "name", label: "Nombre", required: true },
      { name: "date", label: "Fecha", type: "date" },
      { name: "time", label: "Hora", type: "time" },
      { name: "location", label: "Lugar", full: true },
      { name: "booking_code", label: "Código de reserva" },
      { name: "price", label: "Precio (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea", full: true },
    ],
  },
};

// Campos cuyo cambio invalida la foto guardada (igual que la app).
const PHOTO_QUERY_FIELDS = ["address", "location", "airline", "title", "company", "type", "name"];

function fieldHtml(f, value) {
  const id = `f_${f.name}`;
  const v = value ?? "";
  let input;
  if (f.type === "textarea") input = `<textarea id="${id}">${esc(v)}</textarea>`;
  else if (f.type === "select")
    input = `<select id="${id}">${f.options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  else
    input = `<input id="${id}" type="${f.type || "text"}" ${f.step ? `step="${f.step}"` : ""} value="${esc(v)}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ""} />`;
  return `<label class="field ${f.full || f.type === "textarea" ? "full" : ""}"><span class="label">${esc(f.label)}${f.required ? " *" : ""}</span>${input}</label>`;
}

function readField(f, root) {
  const el = $(`#f_${f.name}`, root);
  if (f.type === "number") return parseFloat(el.value || "0") || 0;
  return el.value.trim();
}

/** Formulario genérico en un modal. onSave(values) / onDelete() */
function openForm({ title, fields, initial = {}, onSave, onDelete, validate, deleteLabel }) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <form class="modal" role="dialog" aria-modal="true" novalidate>
      <h2>${esc(title)}</h2>
      <div class="grid2">${fields.map((f) => fieldHtml(f, initial[f.name])).join("")}</div>
      <p class="form-error" role="alert"></p>
      <div class="foot">
        ${onDelete ? `<button class="btn btn-danger" type="button" data-del>${esc(deleteLabel || "Eliminar")}</button>` : ""}
        <div class="right">
          <button class="btn btn-secondary" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary" type="submit">Guardar</button>
        </div>
      </div>
    </form>`;
  const close = () => back.remove();
  back.addEventListener("click", (e) => e.target === back && close());
  $("[data-cancel]", back).addEventListener("click", close);
  if (onDelete)
    $("[data-del]", back).addEventListener("click", async () => {
      if (!(await confirmBox("Se eliminará y no se puede deshacer."))) return;
      close();
      await onDelete();
    });
  $("form", back).addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) values[f.name] = readField(f, back);
    const missing = fields.find((f) => f.required && !values[f.name]);
    const error = missing ? `Falta "${missing.label}"` : validate ? validate(values) : null;
    if (error) {
      $(".form-error", back).textContent = error;
      return;
    }
    close();
    await onSave(values);
  });
  document.body.appendChild(back);
  $("input, select, textarea", back)?.focus();
}

// ------------------------------------------------------------
// Guardar / borrar (misma lógica que saveAndRefresh de la app)
// ------------------------------------------------------------
async function saveItem(store, existing, values, message) {
  if (existing) {
    const merged = { ...existing, ...values };
    const queryChanged = PHOTO_QUERY_FIELDS.some((k) => k in values && existing[k] !== values[k]);
    if (merged.photo_url && queryChanged) delete merged.photo_url;
    await Data.put(store, merged);
  } else {
    const extra = store === "itinerary" ? { order: Date.now() } : {};
    await Data.add(store, { ...values, ...extra, trip_id: state.tripId });
  }
  toast(message);
  render();
}

async function deleteItem(store, id, message) {
  await Data.delete(store, id);
  toast(message);
  render();
}

function openItemForm(store, item, prefill) {
  const cfg = FORMS[store];
  openForm({
    title: `${item ? "Editar" : "Nuevo"} ${cfg.single}`.replace("Nuevo actividad", "Nueva actividad").replace("Nuevo reserva", "Nueva reserva"),
    fields: cfg.fields,
    initial: item || prefill || {},
    onSave: (values) => saveItem(store, item, values, `${cap(cfg.single)} guardado`.replace(/(actividad|reserva) guardado/i, "$1 guardada")),
    onDelete: item ? () => deleteItem(store, item.id, `${cap(cfg.single)} eliminado`.replace(/(actividad|reserva) eliminado/i, "$1 eliminada")) : null,
  });
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function openTripForm(trip) {
  openForm({
    title: trip ? "Editar viaje" : "Nuevo viaje",
    fields: FORMS.trips.fields,
    initial: trip || {},
    validate: (v) => (v.start_date && v.end_date && v.end_date < v.start_date ? "La fecha de fin no puede ser anterior a la de inicio" : null),
    deleteLabel: "Eliminar viaje",
    onDelete: trip
      ? async () => {
          await Data.deleteTripCascade(trip.id);
          toast("Viaje eliminado");
          go("home");
        }
      : null,
    onSave: async (values) => {
      if (trip) {
        const merged = { ...trip, ...values };
        if (trip.destination !== values.destination) delete merged.photo_url;
        await Data.put("trips", merged);
        toast("Viaje actualizado");
        render();
      } else {
        const id = await Data.add("trips", values);
        await Data.addDefaultChecklistItems(id);
        toast("Viaje creado");
        go("trip", id);
      }
    },
  });
}

// Busca una foto real del destino si el viaje aún no tiene (igual que la app).
const photoLookups = new Set();
function ensureTripPhoto(trip) {
  if (trip.photo_url || !trip.destination || photoLookups.has(trip.id)) return;
  photoLookups.add(trip.id);
  findDestinationPhoto(trip.destination)
    .then(async (url) => {
      if (!url) return;
      const fresh = await Data.get("trips", trip.id);
      if (fresh && !fresh.photo_url) {
        await Data.put("trips", { ...fresh, photo_url: url });
        render();
      }
    })
    .catch(() => {});
}

// ------------------------------------------------------------
// Navegación (con el historial del navegador: #viaje-12/gastos)
// ------------------------------------------------------------
const TABS = [
  { id: "overview", label: "Resumen", accent: "--brand" },
  { id: "flights", label: "Vuelos", accent: "--c-flights" },
  { id: "hotels", label: "Hoteles", accent: "--c-hotels" },
  { id: "itinerary", label: "Itinerario", accent: "--c-itinerary" },
  { id: "transport", label: "Transporte", accent: "--c-transport" },
  { id: "reservations", label: "Reservas", accent: "--c-reservations" },
  { id: "expenses", label: "Gastos", accent: "--c-expenses" },
  { id: "checklist", label: "Checklist", accent: "--c-checklist" },
  { id: "calendar", label: "Calendario", accent: "--c-flights" },
  { id: "map", label: "Mapa", accent: "--c-hotels" },
];

function go(view, tripId, tab) {
  if (view === "home") location.hash = "";
  else location.hash = `viaje-${tripId}${tab && tab !== "overview" ? `/${tab}` : ""}`;
}

function readHash() {
  const m = location.hash.match(/^#viaje-(\d+)(?:\/(\w+))?$/);
  if (m) {
    state.view = "trip";
    state.tripId = Number(m[1]);
    state.tab = TABS.some((t) => t.id === m[2]) ? m[2] : "overview";
  } else {
    state.view = "home";
    state.tripId = null;
  }
}
window.addEventListener("hashchange", () => {
  const prev = `${state.view}:${state.tripId}`;
  readHash();
  render().then(() => {
    if (`${state.view}:${state.tripId}` !== prev) window.scrollTo(0, 0);
  });
});

// ------------------------------------------------------------
// Pintar
// ------------------------------------------------------------
// Agrupa varias peticiones seguidas en un solo pintado. Si llega una
// petición mientras se está pintando (p. ej. cambia la URL justo
// después de guardar), se vuelve a pintar al terminar con el estado
// más reciente.
let rendering = null;
let renderAgain = false;
async function render() {
  if (!state.user) return;
  if (rendering) {
    renderAgain = true;
    return rendering;
  }
  rendering = (async () => {
    do {
      renderAgain = false;
      await Promise.resolve();
      if (state.view === "trip") {
        const trip = await Data.get("trips", state.tripId);
        if (!trip) {
          state.view = "home";
          history.replaceState(null, "", location.pathname);
          await renderHome();
        } else await renderTrip(trip);
      } else await renderHome();
    } while (renderAgain);
  })().finally(() => {
    rendering = null;
  });
  return rendering;
}

function headerUser() {
  const u = state.user;
  const initial = (u.displayName || u.email || "?").trim().charAt(0).toUpperCase();
  const slot = $("#user-slot");
  slot.innerHTML = `
    <span class="sync-pill hide-sm" title="Los cambios se guardan en tu cuenta automáticamente">Sincronizado</span>
    <div class="user-menu">
      <button class="avatar" id="avatar" type="button" aria-haspopup="menu" aria-label="Tu cuenta">${esc(initial)}</button>
      <div class="menu" id="menu" role="menu" hidden>
        <div class="who"><span class="label">Sesión iniciada</span><b>${esc(u.displayName || "")}</b><span class="muted small">${esc(u.email || "")}</span></div>
        <button type="button" data-act="sync" role="menuitem">⟳ Sincronizar ahora</button>
        <a href="./" role="menuitem">Ir a la web de Viajoo</a>
        <a href="legal.html#privacidad" role="menuitem">Privacidad</a>
        <button type="button" data-act="logout" class="danger" role="menuitem">Cerrar sesión</button>
      </div>
    </div>`;
  $("#avatar").addEventListener("click", (e) => {
    e.stopPropagation();
    $("#menu").hidden = !$("#menu").hidden;
  });
  $("#menu").addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "logout") {
      await signOutUser();
      toast("Sesión cerrada");
    }
    if (act === "sync") {
      toast("Sincronizando…");
      const res = await pullOrPush();
      toast(res ? "Todo al día" : "No se pudo sincronizar");
      render();
    }
  });
}
document.addEventListener("click", () => {
  const m = $("#menu");
  if (m) m.hidden = true;
});

// --- Lista de viajes -------------------------------------------------
async function renderHome() {
  const [trips, flights, hotels, itin, res] = await Promise.all(["trips", "flights", "hotels", "itinerary", "reservations"].map((s) => Data.getAll(s)));
  trips.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const count = (list, id) => list.filter((x) => x.trip_id === id).length;
  const firstName = (state.user.displayName || "").split(" ")[0];

  const groups = [
    ["ongoing", "En curso"],
    ["upcoming", "Próximos"],
    ["past", "Pasados"],
  ];
  const body = trips.length
    ? groups
        .map(([key, label]) => {
          let list = trips.filter((t) => tripStatus(t) === key);
          if (key === "past") list = list.reverse();
          if (!list.length) return "";
          return `<div class="trips-group"><span class="label">${label} · ${list.length}</span><div class="trip-list">${list
            .map((t) => tripPass(t, { flights: count(flights, t.id), hotels: count(hotels, t.id), itinerary: count(itin, t.id), reservations: count(res, t.id) }, flights.filter((f) => f.trip_id === t.id).sort(sortByDateTime)[0]))
            .join("")}</div></div>`;
        })
        .join("")
    : `<div class="empty"><span class="label">Sin viajes</span><h2>Tu primer viaje empieza aquí</h2><p class="muted">Crea un viaje y añade vuelos, hoteles y actividades. Se guardará también en la app.</p><button class="btn btn-primary" data-new-trip type="button">Crear viaje</button></div>`;

  app.innerHTML = `
    <div class="home-head">
      <div>
        <span class="label">${firstName ? `Hola, ${esc(firstName)}` : "Tu cuenta"}</span>
        <h1>Mis viajes</h1>
      </div>
      <button class="btn btn-primary" data-new-trip type="button">+ Nuevo viaje</button>
    </div>
    ${body}`;
  app.querySelectorAll("[data-new-trip]").forEach((b) => b.addEventListener("click", () => openTripForm()));
  trips.forEach(ensureTripPhoto);
}

function tripPass(trip, counts, firstFlight) {
  const status = tripStatus(trip);
  const days = daysTo(trip.start_date);
  let big, small, lbl;
  if (status === "ongoing") [lbl, big, small] = ["Estado", "En curso", `Termina el ${pretty(trip.end_date)}`];
  else if (status === "upcoming" && days != null) [lbl, big, small] = ["Faltan", days === 0 ? "Hoy" : days === 1 ? "Mañana" : `${days} días`, days > 1 ? "para salir" : "sales"];
  else [lbl, big, small] = ["Estado", "Hecho", pretty(trip.end_date)];

  const chips = [
    ["flights", "--c-flights", "vuelo", "vuelos"],
    ["hotels", "--c-hotels", "hotel", "hoteles"],
    ["itinerary", "--c-itinerary", "actividad", "actividades"],
    ["reservations", "--c-reservations", "reserva", "reservas"],
  ]
    .map(([k, color, one, many]) => (counts[k] ? `<span class="chip" style="--accent:var(${color})"><i></i>${counts[k]} ${counts[k] === 1 ? one : many}</span>` : ""))
    .join("");
  const from = firstFlight && firstFlight.origin ? placeCode(firstFlight.origin) : "";

  return `
    <a class="pass" href="#viaje-${trip.id}">
      <div class="pass-main">
        <span class="label">${esc(trip.name || "Viaje")}</span>
        <div class="route">
          ${from ? `<span class="code">${esc(from)}</span><span class="plane"></span>` : ""}
          <span class="code">${esc(placeCode(trip.destination))}</span>
        </div>
        <div class="kv">
          <div><span class="label">Destino</span><b>${esc(trip.destination)}</b></div>
          <div><span class="label">Salida</span><b class="mono">${esc(pretty(trip.start_date))}</b></div>
          <div><span class="label">Vuelta</span><b class="mono">${esc(pretty(trip.end_date))}</b></div>
          <div><span class="label">Días</span><b class="mono">${tripDays(trip) ?? "—"}</b></div>
        </div>
        <div class="chips">${chips}${trip.share_code ? `<span class="chip" style="--accent:var(--brand)"><i></i>Compartido</span>` : ""}</div>
      </div>
      <div class="pass-stub">
        <div class="countdown ${status}"><span class="label">${lbl}</span><b>${esc(big)}</b><span class="muted small">${esc(small)}</span></div>
        ${trip.photo_url ? `<div class="photo" style="background-image:url('${esc(trip.photo_url).replace(/'/g, "%27")}')"></div>` : `<div class="barcode" aria-hidden="true"></div>`}
      </div>
    </a>`;
}

// --- Ficha de un viaje ----------------------------------------------
async function renderTrip(trip) {
  ensureTripPhoto(trip);
  const stores = ["flights", "hotels", "itinerary", "transport", "reservations", "expenses", "checklist", "companions", "settlements"];
  const lists = Object.fromEntries(await Promise.all(stores.map(async (s) => [s, await Data.getAllByTrip(s, trip.id)])));

  const status = tripStatus(trip);
  const days = daysTo(trip.start_date);
  const eyebrow =
    status === "ongoing" ? "En curso" : status === "past" ? "Viaje completado" : days === 0 ? "Sales hoy" : days === 1 ? "Sales mañana" : `Faltan ${days} días`;

  app.innerHTML = `
    <div class="trip-hero">
      ${bg(trip.photo_url)}
      <div>
        <span class="label">${esc(eyebrow)}</span>
        <h1>${esc(trip.name || trip.destination)}</h1>
        <p>📍 ${esc(trip.destination)} · ${esc(pretty(trip.start_date))} – ${esc(pretty(trip.end_date))} · ${tripDays(trip) ?? "—"} días</p>
      </div>
      <div class="actions">
        <a class="btn btn-glass btn-sm" href="#"><span class="arrow">←</span> Mis viajes</a>
        <button class="btn btn-glass btn-sm" type="button" data-edit-trip>Editar viaje</button>
      </div>
    </div>
    <nav class="tabs" role="tablist">
      ${TABS.map((t) => {
        const n = lists[t.id] ? lists[t.id].length : "";
        return `<button class="tab" role="tab" type="button" data-tab="${t.id}" aria-selected="${state.tab === t.id}" style="--accent:var(${t.accent})"><i></i>${t.label}${n !== "" ? ` <span class="n">${n}</span>` : ""}</button>`;
      }).join("")}
    </nav>
    <div id="tab-body"></div>`;

  $("[data-edit-trip]", app).addEventListener("click", () => openTripForm(trip));
  app.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => go("trip", trip.id, b.dataset.tab)));

  const sel = $(".tab[aria-selected=true]", app);
  const bar = $(".tabs", app);
  if (sel && bar) bar.scrollLeft = sel.offsetLeft - (bar.clientWidth - sel.offsetWidth) / 2;

  const body = $("#tab-body", app);
  const renderers = { overview: renderOverview, flights: renderFlights, hotels: renderHotels, itinerary: renderItinerary, transport: renderTransport, reservations: renderReservations, expenses: renderExpenses, checklist: renderChecklist, calendar: renderCalendar, map: renderMap };
  renderers[state.tab](body, trip, lists);
}

function sectionBar(title, store, addLabel) {
  return `<div class="section-bar"><h2>${title}</h2>${store ? `<button class="btn btn-primary btn-sm" type="button" data-add="${store}">+ ${addLabel}</button>` : ""}</div>`;
}

function wireRows(body, store, items) {
  body.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => openItemForm(b.dataset.add)));
  body.querySelectorAll("[data-id]").forEach((row) =>
    row.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const item = items.find((i) => String(i.id) === row.dataset.id);
      if (item) openItemForm(store, item);
    })
  );
}

function emptyInline(text, store, addLabel) {
  return `<div class="empty-inline">${esc(text)}<br /><button class="btn btn-primary btn-sm" type="button" data-add="${store}">+ ${addLabel}</button></div>`;
}

function mapLink(q) {
  const url = mapsQueryUrl(q);
  return url ? `<a class="icon-btn" href="${esc(url)}" target="_blank" rel="noopener" title="Abrir en Google Maps">📍</a>` : "";
}

function listRow(item, when, title, sub, right, map) {
  return `
    <div class="row clickable" data-id="${item.id}" tabindex="0">
      <div class="when">${when || ""}</div>
      <div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ""}</div>
      <div class="r actions-inline">${right || ""}${map || ""}</div>
    </div>`;
}

// Resumen: panel de salidas con lo próximo + contadores
function renderOverview(body, trip, L) {
  const events = [
    ...L.flights.map((f) => ({ date: f.date, time: f.time, what: [f.origin, f.destination].filter(Boolean).join(" → ") || "Vuelo", sub: [f.airline, f.flight_number].filter(Boolean).join(" · "), ref: f.flight_number || "", color: "--c-flights", tab: "flights" })),
    ...L.hotels.map((h) => ({ date: h.check_in, time: h.check_in_time || "", what: h.name, sub: "Check-in", ref: h.booking_code || "", color: "--c-hotels", tab: "hotels" })),
    ...L.itinerary.map((a) => ({ date: a.date, time: a.time, what: a.title, sub: a.location || "Itinerario", ref: "", color: "--c-itinerary", tab: "itinerary" })),
    ...L.transport.map((t) => ({ date: t.date, time: t.time, what: [t.origin, t.destination].filter(Boolean).join(" → ") || t.type, sub: [t.type, t.company].filter(Boolean).join(" · "), ref: t.booking_code || "", color: "--c-transport", tab: "transport" })),
    ...L.reservations.map((r) => ({ date: r.date, time: r.time, what: r.name, sub: [r.type, r.location].filter(Boolean).join(" · "), ref: r.booking_code || "", color: "--c-reservations", tab: "reservations" })),
  ]
    .filter((e) => e.date)
    .sort(sortByDateTime);
  const today = todayString();
  const upcoming = events.filter((e) => e.date >= today);
  const shown = (upcoming.length ? upcoming : events).slice(0, 7);

  const spent = L.expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const done = L.checklist.filter((c) => c.completed).length;
  const budget = parseFloat(trip.budget || 0);

  body.innerHTML = `
    <div class="overview">
      <div class="board">
        <div class="board-head"><b>${upcoming.length ? "Próximos planes" : "Planes del viaje"}</b><span class="clock" id="clock"></span></div>
        <div class="board-cols"><span>Hora</span><span>Plan</span><span>Ref.</span><span>Fecha</span></div>
        ${
          shown.length
            ? shown
                .map(
                  (e) => `
          <div class="board-row" data-go="${e.tab}" style="cursor:pointer">
            <span class="flap time">${esc(e.time || "--:--")}</span>
            <span class="what"><span class="flap">${esc(e.what)}</span><small><i class="cat-dot" style="background:var(${e.color})"></i>${esc(e.sub || "")}</small></span>
            <span class="flap">${esc(e.ref || "—")}</span>
            <span class="status ${e.date === today ? "st-board" : "st-plan"}">${e.date === today ? "Hoy" : esc(pretty(e.date).replace(/ \d{4}$/, ""))}</span>
          </div>`
                )
                .join("")
            : `<p style="color:var(--board-muted); padding:18px 4px">Aún no hay planes con fecha. Añade un vuelo, un hotel o una actividad.</p>`
        }
      </div>
      <div class="tiles">
        ${[
          ["flights", "Vuelos", L.flights.length, "--c-flights"],
          ["hotels", "Hoteles", L.hotels.length, "--c-hotels"],
          ["itinerary", "Actividades", L.itinerary.length, "--c-itinerary"],
          ["reservations", "Reservas", L.reservations.length, "--c-reservations"],
          ["expenses", "Gastado", money(spent), "--c-expenses", budget ? `de ${money(budget)}` : ""],
          ["checklist", "Checklist", `${done}/${L.checklist.length}`, "--c-checklist"],
        ]
          .map(([tab, label, v, color, extra]) => `<button class="tile" type="button" data-go="${tab}" style="--accent:var(${color})"><span class="label"><i></i>${label}</span><b>${esc(v)}</b>${extra ? `<span class="muted small">${esc(extra)}</span>` : ""}</button>`)
          .join("")}
        ${trip.notes ? `<div class="tile" style="grid-column:1/-1; cursor:default"><span class="label">Notas</span><p style="white-space:pre-wrap; margin:8px 0 0; color:var(--ink-2)">${esc(trip.notes)}</p></div>` : ""}
      </div>
    </div>`;
  body.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => go("trip", trip.id, el.dataset.go)));
  const d = new Date();
  $("#clock", body).textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function renderFlights(body, trip, L) {
  const items = [...L.flights].sort(sortByDateTime);
  body.innerHTML =
    sectionBar("Vuelos", "flights", "Añadir vuelo") +
    (items.length
      ? `<div class="rows" style="--accent:var(--c-flights)">${items
          .map((f) =>
            listRow(
              f,
              whenHtml(f.date, f.time),
              esc([f.origin, f.destination].filter(Boolean).join(" → ") || "Vuelo"),
              esc([f.airline, f.return_date ? `vuelta ${pretty(f.return_date)}` : "", f.notes].filter(Boolean).join(" · ")),
              `<span class="mono">${esc(f.flight_number || "")}</span>`
            )
          )
          .join("")}</div>`
      : emptyInline("Aún no hay vuelos en este viaje.", "flights", "Añadir vuelo"));
  wireRows(body, "flights", items);
}

function renderHotels(body, trip, L) {
  const items = [...L.hotels].sort((a, b) => (a.check_in || "").localeCompare(b.check_in || ""));
  body.innerHTML =
    sectionBar("Hoteles", "hotels", "Añadir hotel") +
    (items.length
      ? `<div class="rows">${items
          .map((h) =>
            listRow(
              h,
              `<b>${esc(pretty(h.check_in))}</b>${esc(pretty(h.check_out))}`,
              esc(h.name || "Hotel"),
              esc([h.address, h.booking_code ? `Reserva ${h.booking_code}` : "", h.check_in_time ? `entrada ${h.check_in_time}` : ""].filter(Boolean).join(" · ")),
              h.price ? money(h.price) : "",
              mapLink(h.address || h.name)
            )
          )
          .join("")}</div>`
      : emptyInline("Aún no hay hoteles en este viaje.", "hotels", "Añadir hotel"));
  wireRows(body, "hotels", items);
}

function renderItinerary(body, trip, L) {
  const items = [...L.itinerary].sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "").localeCompare(b.time || "") || (a.order || 0) - (b.order || 0));
  let lastDay = null;
  body.innerHTML =
    sectionBar("Itinerario", "itinerary", "Añadir actividad") +
    (items.length
      ? `<div class="rows">${items
          .map((a) => {
            const head = a.date !== lastDay ? `<div class="day-label">${a.date ? esc(pretty(a.date)) : "Sin fecha"}</div>` : "";
            lastDay = a.date;
            const type = a.type && a.type !== "Detectar automático" ? a.type : "";
            return head + listRow(a, a.time ? `<b>${esc(a.time)}</b>` : "", esc(a.title), esc([a.location, a.notes].filter(Boolean).join(" · ")), esc(type), mapLink(a.location));
          })
          .join("")}</div>`
      : emptyInline("Aún no hay actividades. Organiza cada día con hora y lugar.", "itinerary", "Añadir actividad"));
  wireRows(body, "itinerary", items);
}

function renderTransport(body, trip, L) {
  const items = [...L.transport].sort(sortByDateTime);
  body.innerHTML =
    sectionBar("Transporte", "transport", "Añadir transporte") +
    (items.length
      ? `<div class="rows">${items
          .map((t) =>
            listRow(
              t,
              whenHtml(t.date, t.time),
              esc([t.origin, t.destination].filter(Boolean).join(" → ") || t.type || "Transporte"),
              esc([t.type, t.company, t.booking_code].filter(Boolean).join(" · ")),
              t.price ? money(t.price) : ""
            )
          )
          .join("")}</div>`
      : emptyInline("Aún no hay trayectos. Añade trenes, buses, coches o barcos.", "transport", "Añadir transporte"));
  wireRows(body, "transport", items);
}

function renderReservations(body, trip, L) {
  const items = [...L.reservations].sort(sortByDateTime);
  body.innerHTML =
    sectionBar("Reservas", "reservations", "Añadir reserva") +
    (items.length
      ? `<div class="rows">${items
          .map((r) =>
            listRow(
              r,
              whenHtml(r.date, r.time),
              esc(r.name || r.type || "Reserva"),
              esc([r.type, r.location, r.booking_code ? `Código ${r.booking_code}` : ""].filter(Boolean).join(" · ")),
              r.price ? money(r.price) : "",
              mapLink(r.location)
            )
          )
          .join("")}</div>`
      : emptyInline("Aún no hay reservas de restaurantes, actividades o entradas.", "reservations", "Añadir reserva"));
  wireRows(body, "reservations", items);
}

// --- Gastos (misma lógica de reparto que la app) --------------------
const EXPENSE_ME_ID = "me";
const EXPENSE_CATEGORIES = ["Transporte", "Alojamiento", "Comida", "Ocio", "Compras", "Otros"];
const EXP_COLORS = { Transporte: "#f97316", Alojamiento: "#14b8a6", Comida: "#ec4899", Ocio: "#6c5ce7", Compras: "#ef4444", Otros: "#64748b" };

function computeBalances(items, companions, settlements) {
  const participants = [{ id: EXPENSE_ME_ID, name: "Yo" }, ...companions.map((c) => ({ id: String(c.id), name: c.archived ? `${c.name} (eliminado/a)` : c.name }))];
  const net = {};
  participants.forEach((p) => (net[p.id] = 0));
  items.forEach((e) => {
    const split = Array.isArray(e.split_with) ? e.split_with.map(String) : [];
    const amount = parseFloat(e.amount || 0);
    if (split.length < 2 || !amount) return;
    const payer = String(e.paid_by ?? EXPENSE_ME_ID);
    const share = amount / split.length;
    split.forEach((pid) => (net[pid] = (net[pid] || 0) - share));
    net[payer] = (net[payer] || 0) + amount;
  });
  settlements.forEach((s) => {
    const amount = parseFloat(s.amount || 0);
    if (!amount) return;
    net[String(s.from)] = (net[String(s.from)] || 0) + amount;
    net[String(s.to)] = (net[String(s.to)] || 0) - amount;
  });
  return participants.map((p) => ({ id: p.id, name: p.name, amount: net[p.id] || 0 }));
}

function simplifyDebts(balances) {
  const creditors = balances.filter((b) => b.amount > 0.005).map((b) => ({ ...b })).sort((a, b) => b.amount - a.amount);
  const debtors = balances.filter((b) => b.amount < -0.005).map((b) => ({ ...b, amount: -b.amount })).sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0,
    j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    out.push({ fromId: debtors[i].id, from: debtors[i].name, toId: creditors[j].id, to: creditors[j].name, amount: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount < 0.005) i++;
    if (creditors[j].amount < 0.005) j++;
  }
  return out;
}

function renderExpenses(body, trip, L) {
  const items = [...L.expenses].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const companions = [...L.companions].sort((a, b) => (a.id || 0) - (b.id || 0));
  const active = companions.filter((c) => !c.archived);
  const total = items.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const budget = parseFloat(trip.budget || 0);
  const byCat = {};
  items.forEach((e) => (byCat[e.category || "Otros"] = (byCat[e.category || "Otros"] || 0) + parseFloat(e.amount || 0)));
  const maxCat = Math.max(1, ...Object.values(byCat));
  const debts = simplifyDebts(computeBalances(items, companions, L.settlements));
  const nameOf = (id) => (id === EXPENSE_ME_ID ? "Yo" : companions.find((c) => String(c.id) === String(id))?.name || "?");

  body.innerHTML = `
    ${sectionBar("Gastos", null)}
    <div class="money-grid">
      <div class="tile" style="--accent:var(--c-expenses)"><span class="label"><i></i>Gastado</span><b>${money(total)}</b></div>
      <div class="tile"><span class="label">Presupuesto</span><b>${budget ? money(budget) : "—"}</b>${budget ? `<div class="meter ${total > budget ? "over" : ""}"><i style="width:${Math.min(100, Math.round((total / budget) * 100))}%"></i></div>` : `<span class="muted small">Defínelo en Editar viaje</span>`}</div>
      <div class="tile"><span class="label">${budget ? (total > budget ? "Te has pasado" : "Te queda") : "Gastos"}</span><b>${budget ? money(Math.abs(budget - total)) : items.length}</b></div>
    </div>
    <div class="two-col">
      <div class="side-card">
        <span class="label">Por categoría</span>
        <div class="bars" style="margin-top:14px">${
          Object.keys(byCat).length
            ? Object.entries(byCat)
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => `<div class="bar" style="--accent:${EXP_COLORS[c] || "#64748b"}"><span>${esc(c)}</span><span class="track"><i style="width:${(v / maxCat) * 100}%"></i></span><b>${money(v)}</b></div>`)
                .join("")
            : `<span class="muted small">Sin gastos todavía.</span>`
        }</div>
      </div>
      <div class="side-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px"><span class="label">Cuentas entre acompañantes</span><button class="btn btn-secondary btn-sm" type="button" data-companions>Acompañantes (${active.length})</button></div>
        <div class="balances" style="margin-top:10px">${
          debts.length
            ? debts
                .map(
                  (d, i) => `<div class="balance"><span><b>${esc(d.from)}</b> debe a <b>${esc(d.to)}</b></span><span style="display:flex; gap:8px; align-items:center"><b class="mono">${money(d.amount)}</b><button class="btn btn-secondary btn-sm" type="button" data-settle="${i}">Saldar</button></span></div>`
                )
                .join("")
            : `<span class="muted small">${active.length ? "Todo saldado. Divide un gasto entre varios para repartirlo." : "Añade acompañantes para dividir gastos y ver quién le debe a quién."}</span>`
        }</div>
      </div>
    </div>
    <div class="section-bar"><h2 style="font-size:22px">Movimientos</h2><button class="btn btn-primary btn-sm" type="button" data-add-expense>+ Añadir gasto</button></div>
    ${
      items.length
        ? `<div class="rows">${items
            .map((e) => {
              const split = Array.isArray(e.split_with) ? e.split_with.map(String) : [];
              const sub = [e.description ? e.category : "", split.length >= 2 ? `pagó ${nameOf(String(e.paid_by ?? EXPENSE_ME_ID))} · entre ${split.length}` : ""].filter(Boolean).join(" · ");
              return listRow(e, esc(pretty(e.date)), esc(e.description || e.category || "Gasto"), esc(sub), `<b class="mono">${money(e.amount)}</b>`);
            })
            .join("")}</div>`
        : `<div class="empty-inline">Aún no hay gastos en este viaje.</div>`
    }`;

  $("[data-add-expense]", body).addEventListener("click", () => openExpenseForm(trip, null, companions));
  $("[data-companions]", body).addEventListener("click", () => openCompanions(trip, companions));
  body.querySelectorAll("[data-id]").forEach((row) =>
    row.addEventListener("click", () => {
      const item = items.find((i) => String(i.id) === row.dataset.id);
      if (item) openExpenseForm(trip, item, companions);
    })
  );
  body.querySelectorAll("[data-settle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const d = debts[Number(b.dataset.settle)];
      if (!(await confirmBox(`Registrar que ${d.from} ha pagado ${money(d.amount)} a ${d.to}.`, "Registrar pago"))) return;
      await Data.add("settlements", { trip_id: trip.id, from: d.fromId, to: d.toId, amount: d.amount, date: todayString() });
      toast("Pago registrado");
      render();
    })
  );
}

function openExpenseForm(trip, e, companions) {
  const initial = e || {};
  const splitInitial = Array.isArray(initial.split_with) ? initial.split_with.map(String) : [];
  const paidByInitial = String(initial.paid_by ?? EXPENSE_ME_ID);
  const referenced = new Set([...splitInitial, paidByInitial]);
  const people = [{ id: EXPENSE_ME_ID, name: "Yo" }, ...companions.filter((c) => !c.archived || referenced.has(String(c.id))).map((c) => ({ id: String(c.id), name: c.archived ? `${c.name} (eliminado/a)` : c.name }))];
  const hasCompanions = people.length > 1;

  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <form class="modal" role="dialog" aria-modal="true" novalidate>
      <h2>${e ? "Editar gasto" : "Nuevo gasto"}</h2>
      <div class="grid2">
        <label class="field full"><span class="label">Descripción *</span><input id="exp-description" value="${esc(initial.description || "")}" /></label>
        <label class="field"><span class="label">Categoría</span><select id="exp-category">${EXPENSE_CATEGORIES.map((c) => `<option ${c === initial.category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        <label class="field"><span class="label">Importe (€) *</span><input id="exp-amount" type="number" step="0.01" value="${initial.amount ?? ""}" /></label>
        <label class="field"><span class="label">Fecha</span><input id="exp-date" type="date" value="${esc(initial.date || todayString())}" /></label>
        ${
          hasCompanions
            ? `<label class="field"><span class="label">Pagado por</span><select id="exp-paid-by">${people.map((p) => `<option value="${esc(p.id)}" ${p.id === paidByInitial ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
               <div class="field full"><span class="label">Dividir entre</span><div class="check-list">${people
                 .map((p) => `<label><input type="checkbox" data-split="${esc(p.id)}" ${splitInitial.includes(p.id) ? "checked" : ""} /> ${esc(p.name)}</label>`)
                 .join("")}</div><span class="muted small">Marca al menos a dos para repartirlo a partes iguales.</span></div>`
            : `<p class="muted small full">Añade acompañantes (en Gastos → Acompañantes) para poder dividir gastos.</p>`
        }
      </div>
      <p class="form-error" role="alert"></p>
      <div class="foot">
        ${e ? `<button class="btn btn-danger" type="button" data-del>Eliminar gasto</button>` : ""}
        <div class="right"><button class="btn btn-secondary" type="button" data-cancel>Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div>
      </div>
    </form>`;
  const close = () => back.remove();
  back.addEventListener("click", (ev) => ev.target === back && close());
  $("[data-cancel]", back).addEventListener("click", close);
  if (e)
    $("[data-del]", back).addEventListener("click", async () => {
      if (!(await confirmBox("Se eliminará este gasto."))) return;
      close();
      await deleteItem("expenses", e.id, "Gasto eliminado");
    });
  $("form", back).addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const description = $("#exp-description", back).value.trim();
    const amount = parseFloat($("#exp-amount", back).value || "0") || 0;
    if (!description) return ($(".form-error", back).textContent = 'Falta "Descripción"');
    if (!amount) return ($(".form-error", back).textContent = 'Falta "Importe (€)"');
    const values = { description, category: $("#exp-category", back).value, amount, date: $("#exp-date", back).value || todayString() };
    if (hasCompanions) {
      values.paid_by = $("#exp-paid-by", back).value;
      values.split_with = [...back.querySelectorAll("[data-split]:checked")].map((c) => c.dataset.split);
    }
    close();
    if (e) await Data.put("expenses", { ...e, ...values });
    else await Data.add("expenses", { ...values, trip_id: trip.id });
    toast("Gasto guardado");
    render();
  });
  document.body.appendChild(back);
  $("#exp-description", back).focus();
}

function openCompanions(trip, companions) {
  const back = document.createElement("div");
  back.className = "modal-back";
  const paint = (list) => {
    const active = list.filter((c) => !c.archived);
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <h2>Acompañantes</h2>
        <p class="muted" style="margin-top:-8px">Añade a quienes viajan contigo para dividir los gastos del viaje.</p>
        <form class="check-add" data-add-form><input id="comp-name" placeholder="Nombre" autocomplete="off" /><button class="btn btn-primary" type="submit">Añadir</button></form>
        <div class="rows">${
          active.length
            ? active.map((c) => `<div class="row check"><span>${esc(c.name)}</span><button class="icon-btn" type="button" data-remove="${c.id}" title="Quitar">✕</button></div>`).join("")
            : `<p class="muted small" style="padding:14px 0">Aún no hay acompañantes.</p>`
        }</div>
        <div class="foot"><div class="right"><button class="btn btn-secondary" type="button" data-close>Listo</button></div></div>
      </div>`;
    $("[data-close]", back).addEventListener("click", () => {
      back.remove();
      render();
    });
    $("[data-add-form]", back).addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = $("#comp-name", back).value.trim();
      if (!name) return;
      await Data.add("companions", { trip_id: trip.id, name });
      paint(await Data.getAllByTrip("companions", trip.id));
      $("#comp-name", back).focus();
    });
    back.querySelectorAll("[data-remove]").forEach((b) =>
      b.addEventListener("click", async () => {
        const c = list.find((x) => String(x.id) === b.dataset.remove);
        // Igual que la app: se archiva, no se borra, para no perder su saldo.
        await Data.put("companions", { ...c, archived: true });
        paint(await Data.getAllByTrip("companions", trip.id));
      })
    );
  };
  back.addEventListener("click", (ev) => {
    if (ev.target === back) {
      back.remove();
      render();
    }
  });
  paint(companions);
  document.body.appendChild(back);
}

// --- Checklist -------------------------------------------------------
function renderChecklist(body, trip, L) {
  const items = [...L.checklist].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const done = items.filter((c) => c.completed).length;
  body.innerHTML = `
    ${sectionBar(`Checklist <span class="muted mono" style="font-size:16px">${done}/${items.length}</span>`, null)}
    <form class="check-add" data-add-task><input id="task-input" placeholder="Añadir tarea, p. ej. Adaptador de enchufe" autocomplete="off" /><button class="btn btn-primary" type="submit">Añadir</button></form>
    ${
      items.length
        ? `<div class="rows">${items
            .map(
              (c) => `<div class="row check ${c.completed ? "done" : ""}"><label><input type="checkbox" data-toggle="${c.id}" ${c.completed ? "checked" : ""} /><span class="t">${esc(c.task)}</span></label><button class="icon-btn" type="button" data-del-task="${c.id}" title="Eliminar">✕</button></div>`
            )
            .join("")}</div>`
        : `<div class="empty-inline">La lista está vacía.</div>`
    }`;
  $("[data-add-task]", body).addEventListener("submit", async (e) => {
    e.preventDefault();
    const task = $("#task-input", body).value.trim();
    if (!task) return;
    const order = items.length ? Math.max(...items.map((i) => i.order ?? 0)) + 1 : 0;
    await Data.add("checklist", { trip_id: trip.id, task, completed: 0, order });
    await render();
    $("#task-input")?.focus();
  });
  body.querySelectorAll("[data-toggle]").forEach((cb) =>
    cb.addEventListener("change", async () => {
      const item = items.find((i) => String(i.id) === cb.dataset.toggle);
      await Data.put("checklist", { ...item, completed: cb.checked ? 1 : 0 });
      render();
    })
  );
  body.querySelectorAll("[data-del-task]").forEach((b) =>
    b.addEventListener("click", async () => {
      await Data.delete("checklist", Number(b.dataset.delTask));
      render();
    })
  );
}

// --- Calendario mensual ----------------------------------------------
const MONTHS_LONG = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TRANSPORT_EMOJI = { Avión: "✈️", Tren: "🚆", Bus: "🚌", Coche: "🚗", Barco: "⛴️", Otro: "🚐" };
let calCursor = null; // { tripId, year, month }

function tripEvents(L) {
  const ev = [];
  const push = (date, time, text, color, tab) => date && ev.push({ date, time: time || "", text, color, tab });
  L.flights.forEach((f) => push(f.date, f.time, `✈️ ${[f.origin, f.destination].filter(Boolean).join(" → ") || f.airline || "Vuelo"}`, "--c-flights", "flights"));
  L.hotels.forEach((h) => {
    push(h.check_in, h.check_in_time, `🏨 Entrada · ${h.name || "Hotel"}`, "--c-hotels", "hotels");
    push(h.check_out, "", `🏨 Salida · ${h.name || "Hotel"}`, "--c-hotels", "hotels");
  });
  L.itinerary.forEach((a) => push(a.date, a.time, `📍 ${a.title}`, "--c-itinerary", "itinerary"));
  L.transport.forEach((t) => push(t.date, t.time, `${TRANSPORT_EMOJI[t.type] || "🚗"} ${[t.origin, t.destination].filter(Boolean).join(" → ") || t.type || "Transporte"}`, "--c-transport", "transport"));
  L.reservations.forEach((r) => push(r.date, r.time, `🎟️ ${r.name || r.type || "Reserva"}`, "--c-reservations", "reservations"));
  return ev.sort(sortByDateTime);
}

function renderCalendar(body, trip, L) {
  if (!calCursor || calCursor.tripId !== trip.id) {
    const base = trip.start_date ? new Date(`${trip.start_date}T00:00:00`) : new Date();
    calCursor = { tripId: trip.id, year: base.getFullYear(), month: base.getMonth() };
  }
  const { year, month } = calCursor;
  const events = tripEvents(L);
  const byDate = {};
  events.forEach((e) => (byDate[e.date] = byDate[e.date] || []).push(e));
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = todayString();

  let cells = "";
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(d)}`;
    const list = byDate[iso] || [];
    const inTrip = trip.start_date && trip.end_date && iso >= trip.start_date && iso <= trip.end_date;
    cells += `
      <div class="cal-cell ${inTrip ? "in-trip" : ""} ${iso === today ? "today" : ""}" data-date="${iso}">
        <span class="d">${d}</span>
        ${list
          .slice(0, 3)
          .map((e) => `<button type="button" class="cal-ev" data-go="${e.tab}" style="--accent:var(${e.color})">${e.time ? `<b>${esc(e.time)}</b> ` : ""}${esc(e.text)}</button>`)
          .join("")}
        ${list.length > 3 ? `<span class="more">+${list.length - 3} más</span>` : ""}
      </div>`;
  }

  const monthKey = `${year}-${pad2(month + 1)}`;
  const agenda = events.filter((e) => e.date.startsWith(monthKey));

  body.innerHTML = `
    <div class="section-bar">
      <h2>${MONTHS_LONG[month]} ${year}</h2>
      <div style="display:flex; gap:6px">
        <button class="icon-btn" type="button" data-cal="-1" aria-label="Mes anterior">‹</button>
        <button class="btn btn-secondary btn-sm" type="button" data-cal="trip">Mes del viaje</button>
        <button class="icon-btn" type="button" data-cal="1" aria-label="Mes siguiente">›</button>
      </div>
    </div>
    <div class="cal">
      ${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((l) => `<div class="cal-dow">${l}</div>`).join("")}
      ${cells}
    </div>
    <div class="cal-agenda">
      <span class="label">Agenda del mes · ${agenda.length}</span>
      <div class="rows" style="margin-top:10px">${
        agenda.length
          ? agenda.map((e) => `<div class="row clickable" data-go="${e.tab}"><div class="when">${e.time ? `<b>${esc(e.time)}</b>` : ""}${esc(pretty(e.date))}</div><div class="t">${esc(e.text)}</div><div></div></div>`).join("")
          : `<p class="muted small" style="padding:14px 0">Sin planes este mes.</p>`
      }</div>
    </div>`;

  body.querySelectorAll("[data-cal]").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.cal === "trip") calCursor = null;
      else {
        calCursor.month += Number(b.dataset.cal);
        if (calCursor.month < 0) (calCursor.month = 11), calCursor.year--;
        if (calCursor.month > 11) (calCursor.month = 0), calCursor.year++;
      }
      renderCalendar(body, trip, L);
    })
  );
  body.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => go("trip", trip.id, el.dataset.go)));
}

// --- Mapa (Leaflet + OpenStreetMap, como la app) ---------------------
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    js.onload = () => resolve(window.L);
    js.onerror = () => {
      leafletPromise = null;
      reject(new Error("leaflet"));
    };
    document.head.appendChild(js);
  });
  return leafletPromise;
}

const KIND_LABEL = { hotel: "Alojamiento", itinerary: "Actividad", reservation: "Reserva", transport: "Transporte" };
const KIND_COLOR = { hotel: "--c-hotels", itinerary: "--c-itinerary", reservation: "--c-reservations", transport: "--c-transport" };

// Mismos puntos que el mapa de la app (collectMapPins en sections.js).
function mapPins(L) {
  const pins = [];
  L.hotels.forEach((h) => {
    if (!h.address) return;
    if (h.check_in) pins.push({ kind: "hotel", text: h.address, date: h.check_in, time: h.check_in_time || "14:00", title: `Entrada: ${h.name || "Hotel"}` });
    if (h.check_out) pins.push({ kind: "hotel", text: h.address, date: h.check_out, time: "11:00", title: `Salida: ${h.name || "Hotel"}` });
  });
  L.itinerary.forEach((i) => i.location && pins.push({ kind: "itinerary", text: i.location, date: i.date, time: i.time || "12:00", title: i.title || "Actividad" }));
  L.reservations.forEach((r) => r.location && pins.push({ kind: "reservation", text: r.location, date: r.date, time: r.time || "12:00", title: r.name || r.type || "Reserva" }));
  L.transport.forEach((t) => {
    if (t.origin) pins.push({ kind: "transport", text: t.origin, date: t.date, time: t.time || "08:00", title: `Salida · ${t.type || "Transporte"}` });
    if (t.destination) pins.push({ kind: "transport", text: t.destination, date: t.date, time: t.time || "08:01", title: `Llegada · ${t.type || "Transporte"}` });
  });
  return pins;
}

let mapDay = "all";
let mapOptimize = false;
let leafletMap = null;

async function renderMap(body, trip, L) {
  const pins = mapPins(L);
  if (!pins.length) {
    body.innerHTML = `<div class="section-bar"><h2>Mapa</h2></div><div class="empty-inline">Añade direcciones a hoteles, actividades, reservas o trayectos y aparecerán aquí.</div>`;
    return;
  }
  const dates = [...new Set(pins.map((p) => p.date).filter(Boolean))].sort();
  if (mapDay !== "all" && !dates.includes(mapDay)) mapDay = "all";

  body.innerHTML = `
    <div class="section-bar"><h2>Mapa</h2><span class="muted small" id="map-status">Localizando lugares…</span></div>
    <div class="chips-row">
      <button type="button" class="chip-btn" data-day="all" aria-pressed="${mapDay === "all"}">Todos los días</button>
      ${dates.map((d) => `<button type="button" class="chip-btn" data-day="${d}" aria-pressed="${mapDay === d}">${esc(pretty(d))}</button>`).join("")}
      ${mapDay !== "all" ? `<button type="button" class="chip-btn" data-optimize aria-pressed="${mapOptimize}">🧭 Ordenar por cercanía</button>` : ""}
    </div>
    <div class="map-layout">
      <div id="leaflet-map" class="map-box"></div>
      <div class="rows map-list" id="map-list"><p class="muted small" style="padding:14px 0">Localizando…</p></div>
    </div>`;

  body.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => {
      mapDay = b.dataset.day;
      renderMap(body, trip, L);
    })
  );
  $("[data-optimize]", body)?.addEventListener("click", () => {
    mapOptimize = !mapOptimize;
    renderMap(body, trip, L);
  });

  const visible = mapDay === "all" ? pins : pins.filter((p) => p.date === mapDay);
  const [Lf, located] = await Promise.all([loadLeaflet().catch(() => null), geocodeAll(visible, (p) => p.text)]);
  const status = $("#map-status", body);
  if (!status || !document.contains(status)) return; // cambió de pestaña mientras tanto
  if (!located.length) {
    status.textContent = "No se pudo localizar ninguna dirección (revisa tu conexión).";
    $("#map-list", body).innerHTML = `<p class="muted small" style="padding:14px 0">Sin lugares localizados.</p>`;
    return;
  }
  const byTime = [...located].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const ordered = mapDay !== "all" && mapOptimize && byTime.length >= 3 ? optimizeRouteOrder(byTime) : byTime;

  if (leafletMap) {
    leafletMap.remove();
    leafletMap = null;
  }
  $("#map-list", body).innerHTML = ordered
    .map(
      (p, i) => `<div class="row"><div class="when"><b>${i + 1}</b>${esc(p.time || "")}</div><div><div class="t">${esc(p.title)}</div><div class="s">${esc(KIND_LABEL[p.kind])} · ${esc(p.text)}</div></div><div class="r">${mapLink(p.text)}</div></div>`
    )
    .join("");
  if (!Lf) {
    $("#leaflet-map", body).innerHTML = `<div class="empty-inline" style="margin:24px">No se pudo cargar el mapa (revisa tu conexión). La lista sigue disponible.</div>`;
    status.textContent = `${located.length} de ${visible.length} lugares localizados`;
    return;
  }
  const map = Lf.map($("#leaflet-map", body), { scrollWheelZoom: false });
  leafletMap = map;
  Lf.tileLayer("https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap", maxZoom: 19 }).addTo(map);
  ordered.forEach((p, i) => {
    const icon = Lf.divIcon({ html: `<div class="map-marker" style="--accent:var(${KIND_COLOR[p.kind]})"><span>${i + 1}</span></div>`, className: "", iconSize: [30, 30], iconAnchor: [15, 28] });
    Lf.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(`<strong>${esc(p.title)}</strong><br>${esc(p.time || "")} · ${esc(pretty(p.date))}`);
  });
  map.fitBounds(Lf.latLngBounds(ordered.map((p) => [p.lat, p.lng])).pad(0.25));

  if (mapDay !== "all" && ordered.length >= 2) {
    status.textContent = "Calculando ruta…";
    const route = await routeBetween(ordered);
    if (route && document.contains(status)) {
      Lf.polyline(route.coords, { color: "#5b4be8", weight: 4, opacity: 0.85 }).addTo(map);
      const h = Math.floor(route.durationMin / 60);
      const m = Math.round(route.durationMin % 60);
      status.textContent = `Ruta del día: ${route.distanceKm.toFixed(1)} km · ${h ? `${h} h ` : ""}${m} min en coche`;
    } else if (document.contains(status)) status.textContent = `${ordered.length} lugares localizados. No se pudo calcular la ruta.`;
  } else status.textContent = `${located.length} de ${visible.length} lugares localizados`;
}

// ------------------------------------------------------------
// Acceso y sincronización (misma lógica que afterLogin de la app)
// ------------------------------------------------------------
async function afterLogin() {
  const hasBackup = await cloudHasBackup();
  if (!hasBackup) {
    toast("Sesión iniciada. Subiendo tus datos…");
    await pushToCloud();
  } else {
    toast("Sesión iniciada. Descargando tus viajes…");
    await pullFromCloud();
  }
}

// "Sincronizar ahora": igual que al abrir la app.
async function pullOrPush() {
  const res = await pullFromCloud();
  return res.ok || res.empty;
}

let justLoggedIn = false;

function renderLogin(mode = "login") {
  $("#user-slot").innerHTML = "";
  app.innerHTML = `
    <div class="auth-grid">
      <div class="intro auth-photo">
        <img src="../img/wonders/taj-mahal.webp" alt="" />
        <span class="label">Viajoo en la web</span>
        <h1>Tus viajes, en pantalla grande.</h1>
        <p>Entra con la misma cuenta de la app. Todo lo que cambies aquí aparece en el móvil, y al revés.</p>
      </div>
      <div class="auth-card">
        <div class="auth-tabs" role="tablist">
          <button type="button" role="tab" data-mode="login" aria-selected="${mode === "login"}">Iniciar sesión</button>
          <button type="button" role="tab" data-mode="signup" aria-selected="${mode === "signup"}">Crear cuenta</button>
        </div>
        <button class="btn btn-secondary btn-block" id="btn-google" type="button">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Continuar con Google
        </button>
        <div class="divider"><span class="label">o con tu email</span></div>
        <form id="login-form" novalidate>
          <label class="field"><span class="label">Email</span><input id="login-email" type="email" autocomplete="email" required /></label>
          <label class="field"><span class="label">Contraseña</span><input id="login-password" type="password" autocomplete="${mode === "signup" ? "new-password" : "current-password"}" required /></label>
          <p class="form-error" id="login-error" role="alert"></p>
          <button class="btn btn-primary btn-block" type="submit" id="btn-login">${mode === "signup" ? "Crear cuenta" : "Entrar"} <span class="arrow">→</span></button>
        </form>
        <p class="muted small" style="margin:18px 0 0">${mode === "signup" ? "La contraseña debe tener al menos 6 caracteres." : "Usa el mismo email o cuenta de Google que en la app."}</p>
      </div>
    </div>`;

  app.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => renderLogin(b.dataset.mode)));
  const err = $("#login-error");
  $("#btn-google").addEventListener("click", async () => {
    err.textContent = "";
    justLoggedIn = true;
    const res = await signInWithGoogle();
    if (res.error) {
      justLoggedIn = false;
      err.textContent = res.error;
    }
  });
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    err.textContent = "";
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    if (!email || !password) return (err.textContent = "Escribe tu email y tu contraseña.");
    $("#btn-login").disabled = true;
    justLoggedIn = true;
    const res = mode === "signup" ? await signUp(email, password) : await signIn(email, password);
    $("#btn-login") && ($("#btn-login").disabled = false);
    if (res.error) {
      justLoggedIn = false;
      err.textContent = res.error;
    }
  });
}

function showLoading() {
  app.innerHTML = `<div class="loading"><div class="spinner"></div><span class="label">Cargando tus viajes</span></div>`;
}

async function start() {
  readHash();
  showLoading();
  enableAutoSync();

  // Vuelta de un inicio de sesión con Google por redirección.
  const redirectUser = await completeGoogleRedirect();
  if (redirectUser) justLoggedIn = true;

  let firstState = true;
  onAuthChange(async (user) => {
    state.user = user;
    if (!user) {
      renderLogin();
      return;
    }
    headerUser();
    showLoading();
    if (justLoggedIn) {
      justLoggedIn = false;
      await afterLogin();
    } else if (firstState) {
      // Sesión ya recordada: misma sincronización que al abrir la app.
      await syncOnLaunch();
    }
    firstState = false;
    await render();
  });

  // Sin conexión con Firebase: onAuthChange nunca llega a llamarse.
  setTimeout(() => {
    if (!state.user && $(".loading", app)) renderLogin();
  }, 9000);
}

// Cualquier cambio en los datos (también los que llegan por sincronización
// de viajes compartidos) vuelve a pintar la pantalla.
onDataChange(() => render());

start();
