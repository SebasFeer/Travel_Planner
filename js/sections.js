import { Data, DEFAULT_CHECKLIST_ITEMS } from "./db.js";
import {
  money,
  todayString,
  escapeHtml,
  formatDatePretty,
  daysBetween,
} from "./utils.js";
import { geocodeAll, routeBetween } from "./geocode.js";
import { state, root, h, toast, showFormModal, confirmAction, renderApp, withTransition, openDiscoverSheet, openMapsAppPicker } from "./app.js";
import { findDestinationPhoto } from "./photo.js";
import { icon } from "./icons.js";
import { isAiCopilotConfigured, openAiPlannerSheet, openAiDayRegenerateSheet } from "./ai-copilot.js";
import { isPro } from "./pro.js";
import { TOP_CURRENCIES, ALL_CURRENCIES, convertCurrency } from "./currency.js";
import { t } from "./i18n.js";

// ============================================================
// CONFIGURACIÓN DE PESTAÑAS
// ============================================================

const TABS = [
  { id: "dashboard", icon: "🏠", label: "Resumen" },
  { id: "flights", icon: "✈️", label: "Vuelos" },
  { id: "hotels", icon: "🏨", label: "Hoteles" },
  { id: "itinerary", icon: "📍", label: "Plan" },
  { id: "transport", icon: "🚗", label: "Transporte" },
  { id: "expenses", icon: "💶", label: "Gastos" },
  { id: "checklist", icon: "☑️", label: "Checklist" },
  { id: "calendar", icon: "🗓️", label: "Calendario" },
  { id: "map", icon: "🗺️", label: "Mapa" },
];

const TRANSPORT_ICONS = {
  Avión: "✈️",
  Tren: "🚆",
  Bus: "🚌",
  Coche: "🚗",
  Barco: "🚢",
  Otro: "➡️",
};
// Icono SVG + color para la ficha de cada trayecto (según el tipo
// elegido en la lista, no según el texto libre de compañía/nombre).
const TRANSPORT_STUB_ICONS = {
  Avión: "plane",
  Tren: "train",
  Bus: "bus",
  Coche: "car",
  Barco: "boat",
  Otro: "transport",
};
const TRANSPORT_COLORS = {
  Avión: "var(--cat-flights)",
  Tren: "var(--cat-transport)",
  Bus: "var(--cat-transport)",
  Coche: "var(--cat-transport)",
  Barco: "var(--cat-hotels)",
  Otro: "var(--muted-dark)",
};

const RESERVATION_ICONS = {
  Restaurante: "🍽️",
  Actividad: "🧭",
  Entrada: "🎫",
  Otro: "📌",
};

/**
 * Clasifica una actividad del itinerario por palabras clave de su
 * título/lugar, solo para elegir icono y color (etiqueta tipo
 * "Museo" / "Restaurante" / "Monumento" de la maqueta). No se
 * guarda en los datos: se calcula al vuelo cada vez que se pinta.
 */
const ACTIVITY_TYPES = {
  food: {
    label: "Restaurante", icon: "restaurant",
    color: "var(--tag-food)", soft: "var(--tag-food-soft)",
    words: ["restaurante", "almuerzo", "cena", "desayuno", "café", "cafe", "bar ", "brunch", "comida", "tapas", "bistro", "pizzería", "pizzeria", "marisquería", "marisqueria", "asador", "cervecería", "cerveceria", "taberna", "food tour", "degustación", "degustacion"],
  },
  sight: {
    label: "Museo", icon: "museum",
    color: "var(--tag-sight)", soft: "var(--tag-sight-soft)",
    words: ["museo", "galería", "galeria", "exposición", "exposicion", "acuario", "planetario", "centro de arte", "exhibición", "exhibicion"],
  },
  monument: {
    label: "Monumento", icon: "landmark",
    color: "var(--tag-monument)", soft: "var(--tag-monument-soft)",
    words: ["torre", "catedral", "iglesia", "palacio", "monumento", "castillo", "plaza", "puente", "basílica", "basilica", "ruinas", "templo", "mirador", "estatua", "muralla", "arco de", "fortaleza", "ciudadela"],
  },
  nature: {
    label: "Naturaleza", icon: "leaf",
    color: "var(--tag-nature)", soft: "var(--tag-nature-soft)",
    words: ["parque", "playa", "jardín", "jardin", "lago", "montaña", "montana", "senderismo", "sendero", "bosque", "isla", "cascada", "reserva natural", "paseo por", "paseo en"],
  },
  shopping: {
    label: "Compras", icon: "bag",
    color: "var(--tag-shopping)", soft: "var(--tag-shopping-soft)",
    words: ["mercado", "tienda", "compras", "centro comercial", "boutique", "souvenir", "outlet", "zoco", "bazar"],
  },
  lodging: {
    label: "Alojamiento", icon: "hotels",
    color: "var(--tag-lodging)", soft: "var(--tag-lodging-soft)",
    words: ["hotel", "hostal", "check-in", "check in", "alojamiento"],
  },
};
const DEFAULT_ACTIVITY_TYPE = {
  label: "Actividad", icon: "compass",
  color: "var(--tag-other)", soft: "var(--tag-other-soft)",
};
// Si la actividad tiene un tipo elegido a mano (campo "type" del
// formulario), ese manda siempre sobre la detección por palabras
// clave — así el icono es exacto y no depende de adivinar el texto.
function classifyActivity(item) {
  if (item.type && item.type !== "Detectar automático") {
    const forced = Object.values(ACTIVITY_TYPES).find((t) => t.label === item.type);
    if (forced) return forced;
  }
  const text = `${item.title || ""} ${item.location || ""}`.toLowerCase();
  for (const type of Object.values(ACTIVITY_TYPES)) {
    if (type.words.some((w) => text.includes(w))) return type;
  }
  return DEFAULT_ACTIVITY_TYPE;
}

function stub(iconHtml, isoDate, photoUrl) {
  const [y, m, d] = (isoDate || "").split("-");
  const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const monthLabel = m ? months[parseInt(m, 10) - 1] : "";
  return h`
    <div class="ticket-stub ${photoUrl ? "has-photo" : ""}">
      ${photoUrl ? `<img src="${photoUrl}" alt="" loading="lazy" />` : `<div class="stub-icon">${iconHtml}</div>`}
      ${
        d
          ? `<div class="stub-date"><span class="stub-day">${parseInt(d, 10)}</span><span class="stub-month">${monthLabel}</span></div>`
          : ""
      }
    </div>`;
}

/**
 * Busca en segundo plano una foto real para las tarjetas de una
 * lista (hoteles, reservas...) usando el campo indicado como
 * consulta, y la guarda en el registro para no repetir la búsqueda.
 * Si no hay conexión o no se encuentra nada, no cambia nada.
 */
function fetchStubPhotos(storeName, items, queryField, context) {
  const getQuery = typeof queryField === "function" ? queryField : (item) => item[queryField];
  items.forEach((item) => {
    const query = getQuery(item);
    if (item.photo_url || !query) return;
    findDestinationPhoto(query, context, item.address).then(async (url) => {
      if (!url) return;
      // En la línea de tiempo del itinerario la foto va en la
      // miniatura de la derecha, no en el talón de la tarjeta.
      const thumbEl = root.querySelector(`.tl-item[data-id="${item.id}"] .tl-thumb`);
      if (thumbEl && thumbEl.tagName !== "IMG") {
        const img = document.createElement("img");
        img.className = "tl-thumb";
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        thumbEl.replaceWith(img);
      }
      const stubEl = root.querySelector(`.ticket[data-id="${item.id}"] .ticket-stub`);
      if (stubEl) {
        const iconEl = stubEl.querySelector(".stub-icon");
        if (iconEl) iconEl.remove();
        stubEl.classList.add("has-photo");
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        stubEl.prepend(img);
      }
      await Data.put(storeName, { ...item, photo_url: url });
    });
  });
}

/**
 * Anillo SVG de progreso de presupuesto (reemplaza la barra plana).
 */
function budgetRing(pct, over) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(pct, 100) / 100) * c;
  const color = over ? "var(--rose)" : "var(--brand)";
  return `
    <svg width="64" height="64" viewBox="0 0 64 64" class="budget-ring">
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--surface-tint)" stroke-width="8"/>
      <circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="8"
        stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        transform="rotate(-90 32 32)"/>
      <text x="32" y="37" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)" font-family="var(--font-body)">${Math.min(pct,999)}%</text>
    </svg>`;
}

/**
 * Anillo tipo "donut" con el reparto de gastos por categoría.
 * `slices` es una lista [categoría, importe] ya ordenada.
 */
function donutChart(slices, total, colors) {
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = slices
    .map(([cat, amount]) => {
      const len = total ? (amount / total) * c : 0;
      const arc = `<circle cx="56" cy="56" r="${r}" fill="none"
          stroke="${colors[cat] || "var(--muted)"}" stroke-width="15"
          stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"
          transform="rotate(-90 56 56)"/>`;
      offset += len;
      return arc;
    })
    .join("");
  return `
    <svg width="112" height="112" viewBox="0 0 112 112" class="donut">
      <circle cx="56" cy="56" r="${r}" fill="none" stroke="var(--surface-tint)" stroke-width="15"/>
      ${arcs}
    </svg>`;
}

function section(container) {
  document.getElementById("section-content").innerHTML = container;
}

function setFab(html) {
  document.getElementById("fab-slot").innerHTML = html;
}

// ============================================================
// DESPACHADOR PRINCIPAL
// ============================================================

async function renderSection(trip) {
  const renderers = {
    dashboard: renderDashboard,
    flights: renderFlights,
    hotels: renderHotels,
    itinerary: renderItinerary,
    transport: renderTransport,
    reservations: renderReservations,
    expenses: renderExpenses,
    checklist: renderChecklist,
    calendar: renderCalendar,
    map: renderMap,
  };
  const fn = renderers[state.section] || renderDashboard;
  await fn(trip);
}

// ============================================================
// RESUMEN / DASHBOARD
// ============================================================

async function renderDashboard(trip) {
  const [flights, hotels, itin, expenses, checklist, transport] = await Promise.all([
    Data.getAllByTrip("flights", trip.id),
    Data.getAllByTrip("hotels", trip.id),
    Data.getAllByTrip("itinerary", trip.id),
    Data.getAllByTrip("expenses", trip.id),
    Data.getAllByTrip("checklist", trip.id),
    Data.getAllByTrip("transport", trip.id),
  ]);

  const totalSpent = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const budget = parseFloat(trip.budget || 0);

  const today = todayString();
  const todayFlights = flights.filter((f) => f.date === today);
  const todayEvents = itin.filter((i) => i.date === today);

  let bannerHtml = "";
  if (todayFlights.length || todayEvents.length) {
    const parts = [];
    if (todayFlights.length) parts.push(`✈️ Tienes ${todayFlights.length} vuelo(s) hoy`);
    if (todayEvents.length) parts.push(`📅 Tienes ${todayEvents.length} actividad(es) hoy`);
    bannerHtml = `<div class="today-banner">${parts.join(" · ")}</div>`;
  }

  const events = [];
  itin.forEach((i) =>
    events.push({
      key: `${i.date} ${i.time || ""}`,
      text: `📅 ${i.date || ""} ${i.time || ""} — ${i.title || ""}${i.location ? ` (${i.location})` : ""}`,
    })
  );
  flights.forEach((f) =>
    events.push({
      key: `${f.date} ${f.time || ""}`,
      text: `✈️ ${f.date || ""} ${f.time || ""} — ${f.airline || ""} ${f.flight_number || ""} ${f.origin || ""} → ${f.destination || ""}`,
    })
  );
  events.sort((a, b) => a.key.localeCompare(b.key));

  const nextEventsHtml = events.length
    ? events
        .slice(0, 8)
        .map((e) => `<div class="agenda-line">${escapeHtml(e.text)}</div>`)
        .join("")
    : `<p style="color:var(--muted); font-size:13.5px;">No hay próximos eventos.</p>`;

  const completedCount = checklist.filter((c) => c.completed).length;
  const checklistPct = checklist.length
    ? Math.round((completedCount / checklist.length) * 100)
    : 0;

  let budgetHtml;
  if (budget > 0) {
    const pct = Math.min(100, Math.round((totalSpent / budget) * 100));
    const over = totalSpent > budget;
    budgetHtml = h`
      <div style="display:flex; align-items:center; gap:14px;">
        ${budgetRing(pct, over)}
        <div>
          <p style="font-size:13.5px; color:var(--muted); margin:0;">Presupuesto ${money(budget)}</p>
          <p style="font-size:13.5px; color:var(--muted); margin:4px 0 0;">Gastado ${money(totalSpent)} · Disponible ${money(budget - totalSpent)}</p>
        </div>
      </div>`;
  } else {
    budgetHtml = `<p style="font-size:13.5px; color:var(--muted);">Gastado ${money(totalSpent)} · Sin presupuesto establecido</p>`;
  }

  const tripDays = daysBetween(trip.date_start || trip.start_date, trip.date_end || trip.end_date);
  const reservationCount = itin.length + transport.length;

  const heroStatsHtml = h`
    <div class="hero-stats">
      <div class="hero-stat" data-nav="expenses" style="--accent: var(--cat-expenses);">
        <span class="hs-icon">${icon("wallet")}</span>
        <span class="hs-label">${t("stat_budget")}</span>
        <span class="hs-value">${budget > 0 ? money(budget) : money(totalSpent)}</span>
      </div>
      <div class="hero-stat" data-nav="map" style="--accent: var(--cat-map);">
        <span class="hs-icon">${icon("itinerary")}</span>
        <span class="hs-label">${t("stat_places")}</span>
        <span class="hs-value">${hotels.length + itin.length}</span>
      </div>
      <div class="hero-stat" data-nav="itinerary" style="--accent: var(--cat-itinerary);">
        <span class="hs-icon">${icon("reservations")}</span>
        <span class="hs-label">${t("stat_reservations")}</span>
        <span class="hs-value">${reservationCount}</span>
      </div>
      <div class="hero-stat" data-nav="calendar" style="--accent: var(--cat-calendar);">
        <span class="hs-icon">${icon("calendar")}</span>
        <span class="hs-label">${t("stat_days")}</span>
        <span class="hs-value">${tripDays || "—"}</span>
      </div>
    </div>`;

  // Próximo evento (vuelo o actividad) más cercano, para la tarjeta
  // destacada bajo "Resumen del viaje".
  const structuredEvents = [];
  itin.forEach((i) => {
    if (!i.date) return;
    structuredEvents.push({ key: `${i.date} ${i.time || ""}`, date: i.date, time: i.time, icon: "itinerary", title: i.title || t("activity_fallback") });
  });
  flights.forEach((f) => {
    if (!f.date) return;
    structuredEvents.push({ key: `${f.date} ${f.time || ""}`, date: f.date, time: f.time, icon: "flights", title: t("flight_to", { dest: f.destination || trip.destination }) });
  });
  structuredEvents.sort((a, b) => a.key.localeCompare(b.key));
  const nextEvent = structuredEvents.find((e) => e.key >= `${today} `) || structuredEvents[structuredEvents.length - 1];

  // Tira de fotos del viaje: la del propio viaje + las de hoteles y
  // actividades que ya tengan una guardada.
  const stripPhotos = [trip.photo_url, ...hotels.map((h) => h.photo_url), ...itin.map((i) => i.photo_url)]
    .filter(Boolean)
    .slice(0, 6);

  const summaryPanelHtml = h`
    <div class="panel summary-panel">
      <h3>${icon("heart", "panel-icon")} ${t("summary_title")}</h3>
      <p style="font-size:13.5px; color:var(--muted); line-height:1.6; margin:0 0 12px;">
        ${trip.notes ? escapeHtml(trip.notes) : t("summary_placeholder")}
      </p>
      ${
        stripPhotos.length
          ? `<div class="photo-strip">${stripPhotos.map((p) => `<img src="${escapeHtml(p)}" alt="" loading="lazy" />`).join("")}</div>`
          : ""
      }
      ${
        nextEvent
          ? `<div class="event-row" data-nav="calendar" style="margin-top:14px; background:var(--brand-soft); box-shadow:none;">
               <span class="event-icon">${icon(nextEvent.icon)}</span>
               <div class="event-body">
                 <p class="exp-sub" style="margin:0; color:var(--muted); font-size:11px;">${t("next_event")}</p>
                 <p class="event-title">${escapeHtml(nextEvent.title)}</p>
                 <p class="exp-sub" style="margin:2px 0 0;">${formatDatePretty(nextEvent.date)}${nextEvent.time ? ` · ${nextEvent.time}` : ""}</p>
               </div>
               <span class="event-chevron">${icon("chevron")}</span>
             </div>`
          : ""
      }
    </div>`;

  section(h`
    ${heroStatsHtml}
    ${bannerHtml}
    ${summaryPanelHtml}
    <div class="stat-grid">
      <div class="stat-card" data-nav="flights"><div class="stat-label">${icon("flights","stat-icon")} ${t("stat_flights")}</div><div class="stat-value">${flights.length}</div></div>
      <div class="stat-card" data-nav="transport"><div class="stat-label">${icon("transport","stat-icon")} ${t("stat_transport")}</div><div class="stat-value">${transport.length}</div></div>
      <div class="stat-card" data-nav="hotels"><div class="stat-label">${icon("hotels","stat-icon")} ${t("stat_hotels")}</div><div class="stat-value">${hotels.length}</div></div>
      <div class="stat-card" data-nav="itinerary"><div class="stat-label">${icon("itinerary","stat-icon")} ${t("stat_activities")}</div><div class="stat-value">${itin.length}</div></div>
      <div class="stat-card stat-card-expenses" data-nav="expenses">
        <div class="stat-label">${icon("expenses","stat-icon")} ${t("stat_spent")}</div>
        <div class="stat-value" style="font-size:19px;">${money(totalSpent)}</div>
        ${
          expenses.length
            ? `<div class="mini-expense-list">
                 ${[...expenses]
                   .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
                   .slice(0, 3)
                   .map(
                     (e) => `
                   <div class="mini-expense-row">
                     <span>${escapeHtml(e.description || e.category || "Gasto")}</span>
                     <b>${money(e.amount)}</b>
                   </div>`
                   )
                   .join("")}
               </div>`
            : `<p class="mini-expense-empty">Sin gastos aún</p>`
        }
      </div>
      <div class="stat-card stat-card-discover${trip.photo_url ? " stat-card-discover-photo" : ""}" data-action="discover" ${trip.photo_url ? `style="background-image:url('${trip.photo_url}')"` : ""}>
        <div class="stat-card-discover-icon">
          <svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true">
            <circle cx="45" cy="17" r="8" fill="#ffb703"/>
            <path d="M4 45c6-11 15-17 25-17s19 6 25 17" stroke="#48cae4" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M21 45c1-11 5-18 9-20-2 7-2 13 0 20" fill="#2a9d8f"/>
            <path d="M30 26c5 0 11 3 13 9-6-2-11-2-15 2 0-4 0-8 2-11z" fill="#2a9d8f"/>
            <rect x="8" y="45" width="48" height="4" rx="2" fill="#e9c46a"/>
          </svg>
        </div>
        <div class="stat-label">${t("sections_sheet_discover")}</div>
      </div>
    </div>
    <div class="panel" data-nav="checklist">
      <h3>${icon("checklist","panel-icon")} Checklist</h3>
      <p style="font-size:13.5px; color:var(--muted);">
        ${checklist.length ? `${completedCount}/${checklist.length} tareas completadas (${checklistPct}%)` : "No hay tareas."}
      </p>
    </div>
    ${
      trip.notes
        ? ""
        : ""
    }
  `);
  setFab("");

  root.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      state.section = el.dataset.nav;
      withTransition(renderApp, "forward");
    });
  });
  const discoverEl = root.querySelector('[data-action="discover"]');
  if (discoverEl) {
    discoverEl.addEventListener("click", () => openDiscoverSheet(trip));
  }

  // Foto real del destino de fondo en la tarjeta "Descubre" (se busca
  // en segundo plano y se guarda en el viaje, igual que en "Mis
  // viajes" — así solo se busca una vez por viaje).
  if (!trip.photo_url && trip.destination) {
    findDestinationPhoto(trip.destination).then(async (url) => {
      if (!url) return;
      const tile = root.querySelector('[data-action="discover"]');
      if (tile) {
        tile.classList.add("stat-card-discover-photo");
        tile.style.backgroundImage = `url('${url}')`;
      }
      await Data.put("trips", { ...trip, photo_url: url });
    });
  }
}

// ============================================================
// VUELOS
// ============================================================

async function renderFlights(trip) {
  const flights = await Data.getAllByTrip("flights", trip.id);
  flights.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const list = flights.length
    ? flights
        .map(
          (f) => h`
        <div class="ticket cat-flights" data-id="${f.id}">
          ${stub(icon("flights"), f.date, f.photo_url)}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(f.airline || "Vuelo")} ${escapeHtml(f.flight_number || "")}</p>
              <span class="ticket-amount">${f.time || ""}</span>
            </div>
            <p class="ticket-meta"><span class="mono">${escapeHtml(f.origin || "?")} → ${escapeHtml(f.destination || "?")}</span></p>
            ${f.return_date ? `<p class="ticket-meta">Vuelta: ${formatDatePretty(f.return_date)}</p>` : ""}
            ${f.notes ? `<p class="ticket-meta">${escapeHtml(f.notes)}</p>` : ""}
            <div class="ticket-actions">
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`
        )
        .join("")
    : emptyState("✈️", t("empty_flights"));

  section(list);
  setFab(fabBtn());

  wireTicketActions("flights", flights, (f) => openFlightForm(trip, f));
  document.getElementById("fab-add").addEventListener("click", () => openFlightForm(trip));
  fetchStubPhotos("flights", flights, "airline", "airline");
}

function openFlightForm(trip, flight) {
  showFormModal({
    title: flight ? "Editar vuelo" : "Nuevo vuelo",
    initial: flight,
    fields: [
      { name: "airline", label: "Aerolínea", half: true },
      { name: "flight_number", label: "Nº de vuelo", half: true },
      { name: "origin", label: "Origen", half: true },
      { name: "destination", label: "Destino", half: true },
      { name: "date", label: "Fecha", type: "date", half: true, required: true },
      { name: "time", label: "Hora", type: "time", half: true },
      { name: "return_date", label: "Fecha de vuelta (si aplica)", type: "date" },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    onDelete: flight ? () => deleteAndRefresh("flights", flight.id, "Vuelo eliminado") : null,
    onSave: (values) => saveAndRefresh("flights", trip.id, flight, values, "Vuelo guardado"),
  });
}

// ============================================================
// HOTELES
// ============================================================

async function renderHotels(trip) {
  const hotels = await Data.getAllByTrip("hotels", trip.id);
  hotels.sort((a, b) => (a.check_in || "").localeCompare(b.check_in || ""));

  const list = hotels.length
    ? hotels
        .map(
          (hotel) => h`
        <div class="ticket cat-hotels" data-id="${hotel.id}">
          ${stub(icon("hotels"), hotel.check_in, hotel.photo_url)}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(hotel.name || "Hotel")}</p>
              ${hotel.price ? `<span class="ticket-amount">${money(hotel.price)}</span>` : ""}
            </div>
            ${hotel.address ? `<p class="ticket-meta">${escapeHtml(hotel.address)}</p>` : ""}
            <p class="ticket-meta">${formatDatePretty(hotel.check_in)} → ${formatDatePretty(hotel.check_out)}</p>
            ${hotel.booking_code ? `<p class="ticket-meta"><span class="mono">${escapeHtml(hotel.booking_code)}</span></p>` : ""}
            ${hotel.notes ? `<p class="ticket-meta">${escapeHtml(hotel.notes)}</p>` : ""}
            <div class="ticket-actions">
              ${hotel.address ? `<button data-act="map">🗺️ Mapa</button>` : ""}
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`
        )
        .join("")
    : emptyState("🏨", t("empty_hotels"));

  section(list);
  setFab(fabBtn());

  wireTicketActions("hotels", hotels, (hotel) => openHotelForm(trip, hotel), (hotel) => openMapsAppPicker({ type: "point", location: hotel.address }));
  document.getElementById("fab-add").addEventListener("click", () => openHotelForm(trip));
  fetchStubPhotos("hotels", hotels, "name", "hotel");
}

function openHotelForm(trip, hotel) {
  showFormModal({
    title: hotel ? "Editar hotel" : "Nuevo hotel",
    initial: hotel,
    fields: [
      { name: "name", label: "Nombre", required: true },
      { name: "address", label: "Dirección" },
      { name: "check_in", label: "Entrada", type: "date", half: true },
      { name: "check_in_time", label: "Hora de entrada (opcional)", type: "time", half: true },
      { name: "check_out", label: "Salida", type: "date", half: true },
      { name: "booking_code", label: "Código de reserva", half: true },
      { name: "price", label: "Precio (€)", type: "number", half: true },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    onDelete: hotel ? () => deleteAndRefresh("hotels", hotel.id, "Hotel eliminado") : null,
    onSave: (values) => saveAndRefresh("hotels", trip.id, hotel, values, "Hotel guardado"),
  });
}

// ============================================================
// ITINERARIO
// ============================================================

let itinDayFilter = null; // null = aún no elegido → se usa el primer día

async function renderItinerary(trip) {
  const items = await Data.getAllByTrip("itinerary", trip.id);
  // Agrupamos por fecha; dentro de cada día se respeta el orden manual
  // (arrastrable) si existe, si no, se ordena por hora.
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const byDate = {};
  const noDate = [];
  for (const item of items) {
    if (!item.date) { noDate.push(item); continue; }
    if (!byDate[item.date]) byDate[item.date] = [];
    byDate[item.date].push(item);
  }
  const dates = Object.keys(byDate).sort();

  if (!dates.length && !noDate.length) {
    const aiRow = isAiCopilotConfigured()
      ? `<div class="ai-actions-row"><button class="btn btn-primary" id="ai-generate-empty">✨ Generar itinerario con IA</button></div>`
      : "";
    section(aiRow + emptyState("📍", t("empty_itinerary_general")));
    setFab(fabBtn());
    document.getElementById("fab-add").addEventListener("click", () => openItineraryForm(trip));
    document
      .getElementById("ai-generate-empty")
      ?.addEventListener("click", () => openAiPlannerSheet(trip, (updated) => renderItinerary(updated || trip)));
    return;
  }

  // Chips de día (Día 1, Día 2…), como en la maqueta: seleccionan un
  // único día a la vez. Si hay actividades sin fecha, se agrupan en
  // un chip final "Sin fecha".
  if (itinDayFilter === null || (itinDayFilter !== "__nodate" && !dates.includes(itinDayFilter))) {
    itinDayFilter = dates[0] || "__nodate";
  }
  if (itinDayFilter === "__nodate" && !noDate.length) itinDayFilter = dates[0] || "__nodate";

  const chipsHtml = `
    <div class="day-chip-row">
      ${dates
        .map(
          (d, i) => `
        <button class="day-chip ${itinDayFilter === d ? "active" : ""}" data-itin-day="${d}">
          <span class="dc-num">Día ${i + 1}</span>
          <span class="dc-date">${formatDatePretty(d).replace(/\s+\d{4}$/, "")}</span>
        </button>`
        )
        .join("")}
      ${
        noDate.length
          ? `<button class="day-chip ${itinDayFilter === "__nodate" ? "active" : ""}" data-itin-day="__nodate">
               <span class="dc-num">Sin fecha</span>
               <span class="dc-date">${noDate.length} actividad${noDate.length === 1 ? "" : "es"}</span>
             </button>`
          : ""
      }
    </div>`;

  const activeItems = itinDayFilter === "__nodate" ? noDate : byDate[itinDayFilter] || [];
  const dayIndex = dates.indexOf(itinDayFilter) + 1;

  const bannerPhoto = activeItems.find((i) => i.photo_url)?.photo_url || trip.photo_url;
  const dayLabel =
    itinDayFilter === "__nodate"
      ? "Actividades sin fecha"
      : `Día ${dayIndex} - ${capitalize(formatWeekdayLong(itinDayFilter))}`;

  const bannerHtml = `
    <div class="day-banner">
      ${bannerPhoto ? `<img src="${escapeHtml(bannerPhoto)}" alt="" />` : ""}
      <div>
        <p class="day-banner-title">${dayLabel}</p>
        <p class="day-banner-sub">${icon("sun")} ${activeItems.length} actividad${activeItems.length === 1 ? "" : "es"}</p>
      </div>
    </div>`;

  const aiMeta = itinDayFilter !== "__nodate" ? trip.ai_plan?.byDate?.[itinDayFilter] : null;
  const aiActionsHtml = isAiCopilotConfigured()
    ? `<div class="ai-actions-row">
         <button class="btn btn-ghost btn-sm" id="ai-generate-day">✨ Generar todo el itinerario</button>
         ${
           itinDayFilter !== "__nodate"
             ? `<button class="btn btn-ghost btn-sm" id="ai-regenerate-day">🔄 Regenerar este día</button>`
             : ""
         }
       </div>`
    : "";
  const aiRecosHtml =
    aiMeta && aiMeta.restaurants && aiMeta.restaurants.length
      ? `<div class="panel ai-day-card" style="margin-bottom:12px;">
           <h3>🍽️ Recomendaciones de la IA para hoy</h3>
           <div style="display:flex; flex-wrap:wrap; gap:6px;">
             ${aiMeta.restaurants
               .map(
                 (r) =>
                   `<span class="tag-chip" style="background:var(--cat-hotels-a); color:var(--cat-hotels);">${escapeHtml(
                     r.name
                   )}${r.priceRange ? ` · ${escapeHtml(r.priceRange)}` : ""}</span>`
               )
               .join(" ")}
           </div>
         </div>`
      : "";

  function timelineRow(item, isLast) {
    const type = classifyActivity(item);
    return h`
      <div class="tl-row tl-item" data-id="${item.id}">
        <div class="tl-rail drag-handle">
          <div class="tl-dot" style="background:${type.color};">${icon(type.icon)}</div>
          ${isLast ? "" : `<div class="tl-line"></div>`}
        </div>
        <div class="tl-content">
          <div class="tl-cat-icon" style="background:${type.soft}; color:${type.color};">${icon(type.icon)}</div>
          <div class="tl-info">
            <p class="tl-time">${item.time || ""}</p>
            <p class="tl-title">${escapeHtml(item.title || "Actividad")}</p>
            <span class="tag-chip" style="background:${type.soft}; color:${type.color};">${type.label}</span>
            ${item.location ? `<p class="tl-addr">${escapeHtml(item.location)}</p>` : ""}
            ${item.notes ? `<p class="tl-addr">${escapeHtml(item.notes)}</p>` : ""}
            <div class="ticket-actions" style="margin-top:8px;">
              ${item.location ? `<button data-act="map">🗺️ Mapa</button>` : ""}
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️</button>
            </div>
          </div>
          ${item.photo_url ? `<img class="tl-thumb" src="${escapeHtml(item.photo_url)}" alt="" loading="lazy" />` : `<div class="tl-thumb"></div>`}
        </div>
      </div>`;
  }

  const listHtml = activeItems.length
    ? `<div class="timeline drag-list" data-date="${itinDayFilter === "__nodate" ? "" : itinDayFilter}">${activeItems
        .map((it, i) => timelineRow(it, i === activeItems.length - 1))
        .join("")}</div>`
    : emptyState("📍", t("empty_itinerary_day"));

  section(chipsHtml + bannerHtml + aiActionsHtml + aiRecosHtml + listHtml);
  setFab(fabBtn());

  wireTicketActions("itinerary", items, (item) => openItineraryForm(trip, item), (item) => openMapsAppPicker({ type: "point", location: item.location }));
  wireDragReorder("itinerary", items);
  root.querySelectorAll("[data-itin-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      itinDayFilter = btn.dataset.itinDay;
      renderItinerary(trip);
    });
  });
  document
    .getElementById("ai-generate-day")
    ?.addEventListener("click", () => openAiPlannerSheet(trip, (updated) => renderItinerary(updated || trip)));
  document.getElementById("ai-regenerate-day")?.addEventListener("click", () => {
    const dayNum = dayIndex || null;
    openAiDayRegenerateSheet(trip, itinDayFilter, dayNum, (updated) => renderItinerary(updated || trip));
  });
  document.getElementById("fab-add").addEventListener("click", () =>
    openItineraryForm(trip, null, itinDayFilter !== "__nodate" ? itinDayFilter : null)
  );
  fetchStubPhotos("itinerary", items, (item) => item.location || item.title);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Formatea "2026-08-12" a "martes, 12 de agosto" para la cabecera del día.
function formatWeekdayLong(isoDate) {
  const [y, m, d] = (isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return isoDate || "";
  const dt = new Date(y, m - 1, d);
  const weekdays = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${weekdays[dt.getDay()]}, ${d} de ${months[m - 1]}`;
}

function openItineraryForm(trip, item, defaultDate) {
  showFormModal({
    title: item ? "Editar actividad" : "Nueva actividad",
    initial: item || (defaultDate ? { date: defaultDate } : null),
    fields: [
      { name: "title", label: "Título", required: true },
      { name: "date", label: "Fecha", type: "date", half: true, required: true },
      { name: "time", label: "Hora", type: "time", half: true },
      { name: "location", label: "Lugar", half: true },
      {
        name: "type", label: "Tipo", type: "select", half: true,
        options: ["Detectar automático", "Restaurante", "Museo", "Monumento", "Naturaleza", "Compras", "Alojamiento"],
      },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    onDelete: item ? () => deleteAndRefresh("itinerary", item.id, "Actividad eliminada") : null,
    onSave: (values) =>
      saveAndRefresh(
        "itinerary",
        trip.id,
        item,
        item ? values : { ...values, order: Date.now() },
        "Actividad guardada"
      ),
  });
}

// ============================================================
// TRANSPORTE
// ============================================================

async function renderTransport(trip) {
  const items = await Data.getAllByTrip("transport", trip.id);
  items.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const list = items.length
    ? items
        .map((t) => {
          const type = t.type || "Otro";
          const isFlight = type === "Avión";
          const accent = TRANSPORT_COLORS[type] || "var(--cat-transport)";
          const stubHtml = isFlight
            ? `<div class="ticket-stub"><div class="stub-icon brand-logo-badge">${icon("plane")}</div></div>`
            : stub(icon(TRANSPORT_STUB_ICONS[type] || "transport"), t.date);
          return h`
        <div class="ticket cat-transport" data-id="${t.id}" style="--accent-a:${accent}; --accent-b:${accent}; --accent:${accent};">
          ${stubHtml}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(type)}${t.company ? ` · ${escapeHtml(t.company)}` : ""}</p>
              ${t.price ? `<span class="ticket-amount">${money(t.price)}</span>` : ""}
            </div>
            <p class="ticket-meta"><span class="mono">${escapeHtml(t.origin || "?")} → ${escapeHtml(t.destination || "?")}</span>${t.time ? ` · ${t.time}` : ""}</p>
            ${t.booking_code ? `<p class="ticket-meta"><span class="mono">${escapeHtml(t.booking_code)}</span></p>` : ""}
            ${t.notes ? `<p class="ticket-meta">${escapeHtml(t.notes)}</p>` : ""}
            <div class="ticket-actions">
              ${t.origin || t.destination ? `<button data-act="map">🗺️ Ruta</button>` : ""}
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`;
        })
        .join("")
    : emptyState("🚗", t("empty_transport"));

  section(list);
  setFab(fabBtn());

  wireTicketActions(
    "transport",
    items,
    (t) => openTransportForm(trip, t),
    (t) => openMapsAppPicker({ type: "route", origin: t.origin, destination: t.destination })
  );
  document.getElementById("fab-add").addEventListener("click", () => openTransportForm(trip));
}

function openTransportForm(trip, t) {
  showFormModal({
    title: t ? "Editar transporte" : "Nuevo transporte",
    initial: t,
    fields: [
      { name: "type", label: "Tipo", type: "select", options: ["Avión", "Tren", "Bus", "Coche", "Barco", "Otro"], half: true },
      { name: "company", label: "Compañía", half: true },
      { name: "origin", label: "Origen", half: true },
      { name: "destination", label: "Destino", half: true },
      { name: "date", label: "Fecha", type: "date", half: true },
      { name: "time", label: "Hora", type: "time", half: true },
      { name: "booking_code", label: "Código de reserva", half: true },
      { name: "price", label: "Precio (€)", type: "number", half: true },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    onDelete: t ? () => deleteAndRefresh("transport", t.id, "Transporte eliminado") : null,
    onSave: (values) => saveAndRefresh("transport", trip.id, t, values, "Transporte guardado"),
  });
}

// ============================================================
// RESERVAS
// ============================================================

async function renderReservations(trip) {
  const items = await Data.getAllByTrip("reservations", trip.id);
  items.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const list = items.length
    ? items
        .map(
          (r) => h`
        <div class="ticket cat-reservations" data-id="${r.id}">
          ${stub(icon("reservations"), r.date, r.photo_url)}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(r.name || r.type || "Reserva")}</p>
              ${r.price ? `<span class="ticket-amount">${money(r.price)}</span>` : ""}
            </div>
            <p class="ticket-meta">${escapeHtml(r.type || "")}${r.time ? ` · ${r.time}` : ""}${r.location ? ` · ${escapeHtml(r.location)}` : ""}</p>
            ${r.booking_code ? `<p class="ticket-meta"><span class="mono">${escapeHtml(r.booking_code)}</span></p>` : ""}
            ${r.notes ? `<p class="ticket-meta">${escapeHtml(r.notes)}</p>` : ""}
            <div class="ticket-actions">
              ${r.location ? `<button data-act="map">🗺️ Mapa</button>` : ""}
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`
        )
        .join("")
    : emptyState("🎟️", t("empty_reservations"));

  section(list);
  setFab(fabBtn());

  wireTicketActions("reservations", items, (r) => openReservationForm(trip, r), (r) => openMapsAppPicker({ type: "point", location: r.location }));
  document.getElementById("fab-add").addEventListener("click", () => openReservationForm(trip));
  fetchStubPhotos("reservations", items, "location");
}

function openReservationForm(trip, r) {
  showFormModal({
    title: r ? "Editar reserva" : "Nueva reserva",
    initial: r,
    fields: [
      { name: "type", label: "Tipo", type: "select", options: ["Restaurante", "Actividad", "Entrada", "Otro"], half: true },
      { name: "name", label: "Nombre", half: true, required: true },
      { name: "date", label: "Fecha", type: "date", half: true },
      { name: "time", label: "Hora", type: "time", half: true },
      { name: "location", label: "Lugar" },
      { name: "booking_code", label: "Código de reserva", half: true },
      { name: "price", label: "Precio (€)", type: "number", half: true },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    onDelete: r ? () => deleteAndRefresh("reservations", r.id, "Reserva eliminada") : null,
    onSave: (values) => saveAndRefresh("reservations", trip.id, r, values, "Reserva guardada"),
  });
}

// ============================================================
// GASTOS
// ============================================================

const EXPENSE_CATEGORIES = ["Transporte", "Alojamiento", "Comida", "Ocio", "Compras", "Otros"];

const EXPENSE_CATEGORY_META = {
  Alojamiento: { color: "var(--exp-alojamiento)", soft: "var(--exp-alojamiento-soft)", icon: "hotels" },
  Comida: { color: "var(--exp-comida)", soft: "var(--exp-comida-soft)", icon: "reservations" },
  Transporte: { color: "var(--exp-transporte)", soft: "var(--exp-transporte-soft)", icon: "transport" },
  Ocio: { color: "var(--exp-ocio)", soft: "var(--exp-ocio-soft)", icon: "itinerary" },
  Compras: { color: "var(--exp-compras)", soft: "var(--exp-compras-soft)", icon: "wallet" },
  Otros: { color: "var(--exp-otros)", soft: "var(--exp-otros-soft)", icon: "notes" },
};

let expenseTab = "resumen"; // "resumen" | "categoria"

async function renderExpenses(trip) {
  const items = await Data.getAllByTrip("expenses", trip.id);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const total = items.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const budget = parseFloat(trip.budget || 0);
  const pct = budget > 0 ? Math.round((total / budget) * 100) : 0;

  const byCategory = {};
  items.forEach((e) => {
    const cat = e.category || "Otros";
    byCategory[cat] = (byCategory[cat] || 0) + parseFloat(e.amount || 0);
  });
  const slices = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const colorsForDonut = {};
  Object.keys(EXPENSE_CATEGORY_META).forEach((k) => (colorsForDonut[k] = EXPENSE_CATEGORY_META[k].color));

  const donutHtml = slices.length ? donutChart(slices, total, colorsForDonut) : "";
  const legendHtml = slices
    .map(
      ([cat, amount]) => `
        <div>
          <i style="background:${colorsForDonut[cat] || "var(--muted)"}"></i>
          <span>${escapeHtml(cat)}</span>
          <b>${money(amount)} (${total ? Math.round((amount / total) * 100) : 0}%)</b>
        </div>`
    )
    .join("");

  const totalCardHtml = h`
    <div class="expense-total-card">
      <p class="et-label">Gasto total</p>
      <p class="et-amount">${money(total)}</p>
      ${
        budget > 0
          ? `<div class="progress-track"><div class="progress-fill ${total > budget ? "over" : ""}" style="width:${Math.min(100, pct)}%"></div></div>
             <div class="et-progress-row"><span>${pct}% del presupuesto</span><span>${money(budget)}</span></div>`
          : `<p style="font-size:12.5px; color:var(--muted); margin-top:6px;">Sin presupuesto establecido</p>`
      }
    </div>`;

  const categoryPanelHtml = slices.length
    ? h`
      <div class="panel">
        <h3>Por categoría</h3>
        <div class="donut-wrap">
          ${donutHtml}
          <div class="donut-legend">${legendHtml}</div>
        </div>
      </div>`
    : `<p style="color:var(--muted); font-size:13px; padding:8px 2px;">Todavía no hay gastos para repartir por categoría.</p>`;

  const recentHtml = items.length
    ? items
        .slice(0, expenseTab === "resumen" ? 6 : items.length)
        .map((e) => {
          const meta = EXPENSE_CATEGORY_META[e.category] || EXPENSE_CATEGORY_META.Otros;
          return h`
        <div class="expense-row" data-id="${e.id}">
          <span class="exp-icon" style="background:${meta.soft}; color:${meta.color};">${icon(meta.icon)}</span>
          <div class="exp-info">
            <p class="exp-title">${escapeHtml(e.description || e.category || "Gasto")}</p>
            <p class="exp-sub">${formatDatePretty(e.date)}${e.category ? ` · ${escapeHtml(e.category)}` : ""}</p>
          </div>
          <span class="exp-amount">${money(e.amount)}</span>
        </div>`;
        })
        .join("")
    : emptyState("💶", t("empty_expenses"));

  section(h`
    <div class="segmented">
      <button data-tab="resumen" class="${expenseTab === "resumen" ? "active" : ""}">Resumen</button>
      <button data-tab="categoria" class="${expenseTab === "categoria" ? "active" : ""}">Por categoría</button>
    </div>
    ${expenseTab === "resumen" ? totalCardHtml : categoryPanelHtml}
    <div class="section-title-row">
      <p class="section-title">Gastos recientes</p>
      <button class="btn-icon-inline" id="open-currency-converter" title="Convertir moneda">🔁</button>
    </div>
    <div>${recentHtml}</div>
  `);
  setFab(fabBtn());

  root.querySelectorAll(".segmented [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      expenseTab = btn.dataset.tab;
      renderExpenses(trip);
    });
  });

  root.querySelectorAll(".expense-row").forEach((row) => {
    const id = parseInt(row.dataset.id, 10);
    const item = items.find((i) => i.id === id);
    if (item) row.addEventListener("click", () => openExpenseForm(trip, item));
  });
  document.getElementById("fab-add").addEventListener("click", () => openExpenseForm(trip));
  const converterBtn = document.getElementById("open-currency-converter");
  if (converterBtn) {
    converterBtn.addEventListener("click", async () => {
      if (!(await isPro())) {
        toast("El conversor de moneda es una función Pro");
        return;
      }
      openCurrencyConverterSheet(trip);
    });
  }
}

// ------------------------------------------------------------
// CONVERSOR DE MONEDA (Pro) — convierte un importe en otra moneda a
// euros, y opcionalmente lo pasa como gasto nuevo ya en EUR.
// ------------------------------------------------------------

function openCurrencyConverterSheet(trip) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const byCode = (code) => ALL_CURRENCIES.find((c) => c.code === code);
  const topChips = TOP_CURRENCIES.filter((code) => code !== "EUR");
  let selected = byCode(topChips[0]); // USD por defecto

  const chipsHtml = topChips
    .map((code) => `<button type="button" class="currency-chip" data-code="${code}">${code}</button>`)
    .join("");

  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">🔁 Conversor de moneda</h2>
      <p style="color:var(--muted); font-size:12.5px; margin-top:-10px;">
        Tipos de cambio del Banco Central Europeo. Todos los gastos
        del viaje se guardan en euros, así que aquí conviertes antes
        de apuntarlo.
      </p>
      <div class="field">
        <label>Importe</label>
        <input type="number" id="conv-amount" step="0.01" placeholder="0.00" />
      </div>
      <div class="field">
        <label>Moneda de origen</label>
        <div class="currency-chip-row">${chipsHtml}</div>
        <input type="search" id="conv-search" placeholder="O busca cualquier otra moneda…" autocomplete="off" style="margin-top:8px;" />
        <div class="currency-search-results" id="conv-search-results"></div>
        <p class="currency-selected" id="conv-selected"></p>
      </div>
      <div id="conv-result" style="min-height:34px; font-size:20px; font-weight:700; color:var(--brand); margin:10px 0;"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="conv-close">Cerrar</button>
        <button type="button" class="btn btn-primary" id="conv-use" disabled>Usar en un gasto nuevo</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#conv-close").addEventListener("click", () => overlay.remove());

  const amountEl = overlay.querySelector("#conv-amount");
  const searchEl = overlay.querySelector("#conv-search");
  const searchResultsEl = overlay.querySelector("#conv-search-results");
  const selectedEl = overlay.querySelector("#conv-selected");
  const chipEls = [...overlay.querySelectorAll(".currency-chip")];
  const resultEl = overlay.querySelector("#conv-result");
  const useBtn = overlay.querySelector("#conv-use");
  let lastConverted = null;

  function updateSelectedLabel() {
    chipEls.forEach((btn) => btn.classList.toggle("is-selected", btn.dataset.code === selected.code));
    selectedEl.textContent = `Convirtiendo desde: ${selected.label} (${selected.code})`;
  }

  function selectCurrency(currency) {
    selected = currency;
    searchEl.value = "";
    searchResultsEl.innerHTML = "";
    updateSelectedLabel();
    recalc();
  }

  chipEls.forEach((btn) => {
    btn.addEventListener("click", () => selectCurrency(byCode(btn.dataset.code)));
  });

  searchEl.addEventListener("input", () => {
    const q = searchEl.value.trim().toLowerCase();
    if (q.length < 1) {
      searchResultsEl.innerHTML = "";
      return;
    }
    const matches = ALL_CURRENCIES.filter(
      (c) => c.code !== "EUR" && (c.label.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    ).slice(0, 8);
    searchResultsEl.innerHTML = matches.length
      ? matches
          .map(
            (c) => `<button type="button" class="currency-result" data-code="${c.code}">
              <span>${escapeHtml(c.label)}</span><span class="currency-result-code">${c.code}</span>
            </button>`
          )
          .join("")
      : `<p class="currency-result-empty">Sin resultados para "${escapeHtml(searchEl.value.trim())}"</p>`;
    searchResultsEl.querySelectorAll(".currency-result").forEach((btn) => {
      btn.addEventListener("click", () => selectCurrency(byCode(btn.dataset.code)));
    });
  });

  async function recalc() {
    const amount = parseFloat(amountEl.value || 0);
    if (!amount) {
      resultEl.textContent = "";
      useBtn.disabled = true;
      lastConverted = null;
      return;
    }
    resultEl.textContent = "Calculando…";
    const converted = await convertCurrency(amount, selected.code, "EUR");
    if (converted === null) {
      resultEl.innerHTML = `<span style="color:var(--rose); font-size:13px; font-weight:400;">No se pudo obtener el tipo de cambio para esta moneda (revisa tu conexión e inténtalo de nuevo).</span>`;
      useBtn.disabled = true;
      lastConverted = null;
      return;
    }
    lastConverted = converted;
    resultEl.textContent = money(converted);
    useBtn.disabled = false;
  }

  updateSelectedLabel();
  amountEl.addEventListener("input", recalc);

  useBtn.addEventListener("click", () => {
    if (lastConverted === null) return;
    overlay.remove();
    openExpenseForm(trip, null, {
      amount: Math.round(lastConverted * 100) / 100,
      date: todayString(),
      description: `Pago en ${selected.label}`,
    });
  });
}

function openExpenseForm(trip, e, prefill) {
  showFormModal({
    title: e ? "Editar gasto" : "Nuevo gasto",
    initial: e || prefill || null,
    fields: [
      { name: "description", label: "Descripción", required: true },
      { name: "category", label: "Categoría", type: "select", options: EXPENSE_CATEGORIES, half: true },
      { name: "amount", label: "Importe (€)", type: "number", half: true, required: true },
      { name: "date", label: "Fecha", type: "date", default: todayString() },
    ],
    onDelete: e ? () => deleteAndRefresh("expenses", e.id, "Gasto eliminado") : null,
    onSave: (values) => saveAndRefresh("expenses", trip.id, e, values, "Gasto guardado"),
  });
}

// ============================================================
// CHECKLIST
// ============================================================

async function renderChecklist(trip) {
  const items = await Data.getAllByTrip("checklist", trip.id);
  items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const list = items.length
    ? `<div class="drag-list" data-date="">${items
        .map(
          (item) => h`
        <div class="ticket compact cat-checklist ${item.completed ? "done" : ""}" data-id="${item.id}">
          <div class="drag-handle">⠿</div>
          <div class="ticket-stub">
            <input type="checkbox" data-act="toggle" ${item.completed ? "checked" : ""}
              style="width:24px;height:24px;accent-color:var(--brand);" />
          </div>
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title" style="white-space:normal;">${escapeHtml(item.task)}</p>
            </div>
            <div class="ticket-actions">
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`
        )
        .join("")}</div>`
    : emptyState("☑️", t("empty_checklist"));

  section(h`
    <div class="pill-row">
      <button id="btn-load-basics">＋ Cargar lista básica</button>
    </div>
    ${list}
    ${items.length ? `<p style="text-align:center; color:var(--muted); font-size:12px; margin-top:6px;">Mantén pulsado ⠿ para reordenar</p>` : ""}
  `);
  setFab(fabBtn());
  wireDragReorder("checklist", items);

  root.querySelectorAll('[data-act="toggle"]').forEach((box) => {
    box.addEventListener("change", async (e) => {
      const id = parseInt(e.target.closest(".ticket").dataset.id, 10);
      const item = items.find((i) => i.id === id);
      await Data.put("checklist", { ...item, completed: e.target.checked ? 1 : 0 });
      await renderApp();
    });
  });

  root.querySelectorAll('[data-act="delete"]').forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const id = parseInt(e.target.closest(".ticket").dataset.id, 10);
      if (await confirmAction("¿Eliminar esta tarea?")) {
        await deleteAndRefresh("checklist", id, "Tarea eliminada");
      }
    });
  });

  document.getElementById("btn-load-basics").addEventListener("click", async () => {
    await Data.addDefaultChecklistItems(trip.id);
    toast("Lista básica cargada");
    await renderApp();
  });

  document.getElementById("fab-add").addEventListener("click", () => {
    showFormModal({
      title: "Nueva tarea",
      fields: [{ name: "task", label: "Tarea", required: true }],
      onSave: (values) =>
        saveAndRefresh("checklist", trip.id, null, { ...values, completed: 0, order: Date.now() }, "Tarea añadida"),
    });
  });
}

// ============================================================
// CALENDARIO
// ============================================================

let calCursor = null; // {year, month} — mes visible actualmente

async function renderCalendar(trip) {
  const [flights, hotels, itin, transport, reservations] = await Promise.all([
    Data.getAllByTrip("flights", trip.id),
    Data.getAllByTrip("hotels", trip.id),
    Data.getAllByTrip("itinerary", trip.id),
    Data.getAllByTrip("transport", trip.id),
    Data.getAllByTrip("reservations", trip.id),
  ]);

  const eventsByDate = {};
  const push = (date, text) => {
    if (!date) return;
    if (!eventsByDate[date]) eventsByDate[date] = [];
    eventsByDate[date].push(text);
  };

  flights.forEach((f) => push(f.date, `✈️ ${f.time || ""} ${f.airline || ""} ${f.origin || ""} → ${f.destination || ""}`));
  hotels.forEach((hh) => {
    push(hh.check_in, `🏨 Entrada — ${hh.name || ""}`);
    push(hh.check_out, `🏨 Salida — ${hh.name || ""}`);
  });
  itin.forEach((i) => push(i.date, `📍 ${i.time || ""} ${i.title || ""}`));
  transport.forEach((t) => push(t.date, `${TRANSPORT_ICONS[t.type] || "🚗"} ${t.time || ""} ${t.origin || ""} → ${t.destination || ""}`));
  reservations.forEach((r) => push(r.date, `${RESERVATION_ICONS[r.type] || "🎟️"} ${r.time || ""} ${r.name || ""}`));

  if (!calCursor) {
    const base = trip.start_date ? new Date(trip.start_date) : new Date();
    calCursor = { year: base.getFullYear(), month: base.getMonth() };
  }

  const { year, month } = calCursor;
  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = todayString();

  let cells = "";
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasEvents = !!eventsByDate[iso];
    const isToday = iso === todayIso;
    const inTripRange = trip.start_date && trip.end_date && iso >= trip.start_date && iso <= trip.end_date;
    cells += h`
      <div class="cal-day ${isToday ? "today" : ""} ${inTripRange ? "in-range" : ""}" data-date="${iso}">
        <span>${d}</span>
        ${hasEvents ? `<span class="dot"></span>` : ""}
      </div>`;
  }

  const dowLabels = ["L", "M", "X", "J", "V", "S", "D"];

  const sortedDates = Object.keys(eventsByDate)
    .filter((iso) => iso.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
    .sort();

  const agendaHtml = sortedDates.length
    ? sortedDates
        .map(
          (iso) => h`
        <div class="cal-agenda-day">${formatDatePretty(iso)}</div>
        ${eventsByDate[iso].map((t) => `<div class="agenda-line">${escapeHtml(t)}</div>`).join("")}
      `
        )
        .join("")
    : `<p style="color:var(--muted); font-size:13.5px; margin-top:16px;">Sin eventos este mes.</p>`;

  section(h`
    <div class="cal-header">
      <button class="icon-btn" id="cal-prev">‹</button>
      <span class="cal-month">${monthNames[month]} ${year}</span>
      <button class="icon-btn" id="cal-next">›</button>
    </div>
    <div class="cal-grid">
      ${dowLabels.map((l) => `<div class="cal-dow">${l}</div>`).join("")}
      ${cells}
    </div>
    ${agendaHtml}
  `);
  setFab("");

  document.getElementById("cal-prev").addEventListener("click", async () => {
    calCursor.month -= 1;
    if (calCursor.month < 0) { calCursor.month = 11; calCursor.year -= 1; }
    await renderCalendar(trip);
  });
  document.getElementById("cal-next").addEventListener("click", async () => {
    calCursor.month += 1;
    if (calCursor.month > 11) { calCursor.month = 0; calCursor.year += 1; }
    await renderCalendar(trip);
  });
}

// ============================================================
// MAPA INTERACTIVO (OpenStreetMap / Leaflet)
// ============================================================

let mapDayFilter = "all";
let leafletInstance = null;

const KIND_ICON = { hotel: "🏨", itinerary: "📍", reservation: "🎟️", transport: "🚗" };
const KIND_SVG = {
  hotel: icon("hotels"),
  itinerary: icon("itinerary"),
  reservation: icon("reservations"),
  transport: icon("transport"),
};

async function collectMapPins(trip) {
  const [hotels, itin, reservations, transport] = await Promise.all([
    Data.getAllByTrip("hotels", trip.id),
    Data.getAllByTrip("itinerary", trip.id),
    Data.getAllByTrip("reservations", trip.id),
    Data.getAllByTrip("transport", trip.id),
  ]);

  const pins = [];
  hotels.forEach((hh) => {
    if (!hh.address) return;
    if (hh.check_in) pins.push({ kind: "hotel", text: hh.address, date: hh.check_in, time: hh.check_in_time || "14:00", title: `Entrada: ${hh.name || "Hotel"}` });
    if (hh.check_out) pins.push({ kind: "hotel", text: hh.address, date: hh.check_out, time: "11:00", title: `Salida: ${hh.name || "Hotel"}` });
  });
  itin.forEach((i) => {
    if (!i.location) return;
    pins.push({ kind: "itinerary", text: i.location, date: i.date, time: i.time || "12:00", title: i.title || "Actividad" });
  });
  reservations.forEach((r) => {
    if (!r.location) return;
    pins.push({ kind: "reservation", text: r.location, date: r.date, time: r.time || "12:00", title: r.name || r.type || "Reserva" });
  });
  transport.forEach((t) => {
    if (t.origin) pins.push({ kind: "transport", text: t.origin, date: t.date, time: t.time || "08:00", title: `Salida — ${t.type || "Transporte"}` });
    if (t.destination) pins.push({ kind: "transport", text: t.destination, date: t.date, time: t.time || "08:01", title: `Llegada — ${t.type || "Transporte"}` });
  });

  return pins;
}

const KIND_LABEL = { hotel: "Alojamiento", itinerary: "Actividad", reservation: "Reserva", transport: "Transporte" };

// Calcula el zoom que hace que unos límites (bounding box) quepan en
// un mapa estático de widthPx×heightPx — la misma cuenta que hace
// Leaflet por dentro para fitBounds(), pero la necesitamos a mano
// porque el mapa estático del PDF no es un Leaflet interactivo.
function zoomForBounds(bounds, widthPx, heightPx) {
  const WORLD_PX = 256;
  const latRad = (lat) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return Math.log((1 + s) / (1 - s)) / 2;
  };
  const zoomForDimension = (mapPx, worldFraction) =>
    Math.floor(Math.log2(mapPx / WORLD_PX / worldFraction));

  const latFraction = (latRad(bounds.north) - latRad(bounds.south)) / Math.PI;
  const lngFraction = (bounds.east - bounds.west) / 360;

  const latZoom = zoomForDimension(heightPx, Math.max(latFraction, 1e-9));
  const lngZoom = zoomForDimension(widthPx, Math.max(lngFraction, 1e-9));
  return Math.max(2, Math.min(latZoom, lngZoom, 17) - 1); // -1 de margen para que no queden pines pegados al borde
}

// ------------------------------------------------------------
// Mapa estático para el PDF, compuesto a mano a partir de teselas
// (en vez de un servicio de "mapa estático" de terceros de un solo
// disparo, que en la práctica resultaba poco fiable — caídas,
// límites de uso, a veces ni cargaba). Se dibujan las teselas una a
// una en un <canvas> y se pintan encima los pines numerados, en el
// mismo orden que la lista de abajo. CARTO Basemaps (gratis, sin
// clave) en vez del tile server que usa el mapa interactivo: ese sí
// envía cabeceras CORS, imprescindibles para poder leer el canvas
// después con toDataURL() sin que el navegador lo bloquee por
// "lienzo contaminado".
// ------------------------------------------------------------

const TILE_SIZE = 256;
const staticTileUrl = (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`;

function lngToWorldX(lng, zoom) {
  return ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, zoom);
}
function latToWorldY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (0.5 - merc / (2 * Math.PI)) * TILE_SIZE * Math.pow(2, zoom);
}

function loadTileImage(z, x, y) {
  return new Promise((resolve) => {
    const tilesAcross = Math.pow(2, z);
    if (y < 0 || y >= tilesAcross) { resolve(null); return; }
    const wrappedX = ((x % tilesAcross) + tilesAcross) % tilesAcross; // el mapa da la vuelta en x
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = staticTileUrl(z, wrappedX, y);
  });
}

function drawMapPin(ctx, x, y, number) {
  const r = 11;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "#6c5ce7";
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(number), x, y + 1);
}

/**
 * Compone una imagen de mapa (data: URL PNG) de widthPx×heightPx
 * centrada en centerLat/centerLng al zoom dado, con un pin numerado
 * por cada punto de `points` (mismo orden que la lista del PDF).
 * Si ninguna tesela llega a cargar (sin conexión y sin caché),
 * devuelve null — el PDF sigue generándose, solo que sin la imagen.
 */
async function composeStaticMap(centerLat, centerLng, zoom, widthPx, heightPx, points) {
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e8ecf5";
  ctx.fillRect(0, 0, widthPx, heightPx);

  const originX = lngToWorldX(centerLng, zoom) - widthPx / 2;
  const originY = latToWorldY(centerLat, zoom) - heightPx / 2;
  const firstTileX = Math.floor(originX / TILE_SIZE);
  const lastTileX = Math.floor((originX + widthPx) / TILE_SIZE);
  const firstTileY = Math.floor(originY / TILE_SIZE);
  const lastTileY = Math.floor((originY + heightPx) / TILE_SIZE);

  let tilesLoaded = 0;
  const loads = [];
  for (let tx = firstTileX; tx <= lastTileX; tx++) {
    for (let ty = firstTileY; ty <= lastTileY; ty++) {
      loads.push(
        loadTileImage(zoom, tx, ty).then((img) => {
          if (!img) return;
          tilesLoaded++;
          ctx.drawImage(img, tx * TILE_SIZE - originX, ty * TILE_SIZE - originY, TILE_SIZE, TILE_SIZE);
        })
      );
    }
  }
  await Promise.all(loads);
  if (!tilesLoaded) return null; // sin conexión y sin nada en caché: mejor avisar que enseñar un mapa en blanco

  points.forEach((p, i) => {
    const x = lngToWorldX(p.lng, zoom) - originX;
    const y = latToWorldY(p.lat, zoom) - originY;
    if (x < -20 || x > widthPx + 20 || y < -20 || y > heightPx + 20) return; // fuera del recuadro visible
    drawMapPin(ctx, x, y, i + 1);
  });

  try {
    return canvas.toDataURL("image/png");
  } catch (err) {
    return null; // por si algún navegador raro considera el lienzo "contaminado"
  }
}

/**
 * Genera un PDF con el mapa de la pestaña actual (mismos puntos que
 * se ven en el Leaflet interactivo, marcados) y debajo la lista de
 * lugares con su fecha/hora y dirección — pensado para llevarlo sin
 * conexión, ya que un PDF descargado no depende de teselas guardadas
 * ni de que el Service Worker esté listo.
 */
async function exportMapPdf(trip, located, dayLabel) {
  if (!(await isPro())) {
    toast("Guardar el mapa en PDF es una función Pro");
    return;
  }
  if (!window.jspdf) {
    toast("No se pudo generar el PDF (falta cargar una librería). Revisa tu conexión y vuelve a intentarlo.");
    return;
  }
  if (!located.length) {
    toast("No hay lugares localizados todavía para exportar.");
    return;
  }
  toast("Generando PDF…");

  const lats = located.map((p) => p.lat);
  const lngs = located.map((p) => p.lng);
  const bounds = {
    north: Math.max(...lats),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    west: Math.min(...lngs),
  };
  const centerLat = (bounds.north + bounds.south) / 2;
  const centerLng = (bounds.east + bounds.west) / 2;

  const MAP_W = 760;
  const MAP_H = 420;
  const zoom = zoomForBounds(bounds, MAP_W, MAP_H);
  // Pines numerados en el mismo orden que la lista de abajo — con
  // más de ~40 se amontonarían y dejarían de leerse, así que a
  // partir de ahí solo se numeran en la lista, no en el mapa.
  const mapImage = await composeStaticMap(centerLat, centerLng, zoom, MAP_W, MAP_H, located.slice(0, 40));

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Mapa — ${trip.destination || "Viaje"}`, margin, y);
  y += 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(dayLabel, margin, y);
  doc.setTextColor(0);
  y += 18;

  if (mapImage) {
    const imgW = pageW - margin * 2;
    const imgH = (imgW / MAP_W) * MAP_H;
    doc.addImage(mapImage, "PNG", margin, y, imgW, imgH);
    y += imgH + 24;
  } else {
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text("(No se pudo cargar la imagen del mapa sin conexión — la lista de abajo sigue siendo válida.)", margin, y);
    doc.setTextColor(0);
    y += 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Lugares", margin, y);
  y += 18;

  const pageH = doc.internal.pageSize.getHeight();
  located.forEach((p, i) => {
    if (y > pageH - margin - 40) {
      doc.addPage();
      y = margin;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${i + 1}. ${p.title || "Sin título"}`, margin, y);
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    const meta = [KIND_LABEL[p.kind] || "Lugar", p.date ? formatDatePretty(p.date) : "", p.time || ""].filter(Boolean).join(" · ");
    doc.text(meta, margin, y);
    y += 14;
    doc.text(p.text || "", margin, y);
    doc.setTextColor(0);
    y += 22;
  });

  doc.save(`mapa-${(trip.destination || "viaje").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
  toast("PDF descargado");
}

async function renderMap(trip) {
  const pins = await collectMapPins(trip);

  if (!pins.length) {
    section(emptyState("🗺️", t("empty_map")));
    setFab("");
    return;
  }

  const dates = [...new Set(pins.map((p) => p.date).filter(Boolean))].sort();

  const chips = [`<button data-day="all" class="${mapDayFilter === "all" ? "active" : ""}">Todos</button>`]
    .concat(dates.map((d) => `<button data-day="${d}" class="${mapDayFilter === d ? "active" : ""}">${formatDatePretty(d)}</button>`))
    .join("");

  section(h`
    <div class="pill-row">${chips}</div>
    <p id="map-status" style="color:var(--muted); font-size:13px; margin:0 0 10px;">Localizando lugares…</p>
    <div id="leaflet-map" style="height:46vh; border-radius:20px; overflow:hidden; box-shadow:var(--shadow-card);"></div>
    <button class="btn btn-secondary" id="map-download-offline" style="width:100%; margin-top:10px;">${icon("download")} Guardar en PDF para sin conexión (Pro)</button>
    <div id="map-list" style="margin-top:14px;"></div>
  `);
  setFab("");

  root.querySelectorAll("[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      mapDayFilter = btn.dataset.day;
      renderMap(trip);
    });
  });

  const visible = mapDayFilter === "all" ? pins : pins.filter((p) => p.date === mapDayFilter);
  const located = await geocodeAll(visible, (p) => p.text);

  const statusEl = document.getElementById("map-status");
  if (!statusEl) return; // el usuario cambió de pestaña mientras geocodificaba

  if (!located.length) {
    statusEl.textContent = "No se pudo localizar ninguna dirección (revisa tu conexión).";
    return;
  }

  if (leafletInstance) {
    leafletInstance.remove();
    leafletInstance = null;
  }

  const map = L.map("leaflet-map");
  leafletInstance = map;
  L.tileLayer("https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    // Subdominio fijo (en vez de {s} rotando entre a/b/c): así las
    // teselas que ves aquí son exactamente las mismas URLs que se
    // descargan con "Guardar para sin conexión", y el caché coincide.
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);

  const markers = located.map((p, i) => {
    const icon = L.divIcon({
      html: `<div class="tp-map-marker">${i + 1}</div>`,
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 28],
    });
    return L.marker([p.lat, p.lng], { icon })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(p.title)}</strong><br>${p.time || ""}`);
  });

  const listEl = document.getElementById("map-list");
  if (listEl) {
    listEl.innerHTML = located
      .map(
        (p) => `
        <div class="map-sheet-row">
          <span class="map-sheet-icon" style="background:var(--brand-soft); color:var(--brand);">${KIND_SVG[p.kind] || icon("compass")}</span>
          <div class="map-sheet-info">
            <p class="map-sheet-title">${escapeHtml(p.title)}</p>
            <p class="map-sheet-sub">${p.time || ""}${p.date ? ` · ${formatDatePretty(p.date)}` : ""}</p>
          </div>
        </div>`
      )
      .join("");
  }

  const bounds = L.latLngBounds(located.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds.pad(0.25));

  const downloadBtn = document.getElementById("map-download-offline");
  if (downloadBtn) {
    const dayLabel = mapDayFilter === "all" ? "Todos los días" : formatDatePretty(mapDayFilter);
    downloadBtn.addEventListener("click", () => exportMapPdf(trip, located, dayLabel));
  }

  if (mapDayFilter !== "all" && located.length >= 2) {
    statusEl.textContent = "Calculando ruta…";
    const ordered = [...located].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const route = await routeBetween(ordered);
    if (route) {
      L.polyline(route.coords, { color: "#5b6ef5", weight: 4, opacity: 0.85 }).addTo(map);
      const h = Math.floor(route.durationMin / 60);
      const m = Math.round(route.durationMin % 60);
      statusEl.textContent = `Ruta del día: ${route.distanceKm.toFixed(1)} km · ${h > 0 ? h + " h " : ""}${m} min en coche`;
    } else {
      statusEl.textContent = `${located.length} lugares localizados. No se pudo calcular la ruta (revisa tu conexión).`;
    }
  } else {
    statusEl.textContent = `${located.length} de ${visible.length} lugares localizados en el mapa.`;
  }
}

// ============================================================
// AYUDANTES COMPARTIDOS
// ============================================================

function emptyState(emoji, text) {
  return h`<div class="empty-state"><div class="emoji">${emoji}</div><p>${text}</p></div>`;
}

function fabBtn() {
  return `<button class="fab" id="fab-add">＋</button>`;
}

function wireTicketActions(storeName, items, onEdit, onMap) {
  root.querySelectorAll(".ticket, .tl-item").forEach((card) => {
    const id = parseInt(card.dataset.id, 10);
    const item = items.find((i) => i.id === id);
    if (!item) return;

    const editBtn = card.querySelector('[data-act="edit"]');
    if (editBtn) editBtn.addEventListener("click", () => onEdit(item));

    const deleteBtn = card.querySelector('[data-act="delete"]');
    if (deleteBtn)
      deleteBtn.addEventListener("click", async () => {
        if (await confirmAction("¿Eliminar este elemento?")) {
          await deleteAndRefresh(storeName, id, "Eliminado");
        }
      });

    const mapBtn = card.querySelector('[data-act="map"]');
    if (mapBtn && onMap) mapBtn.addEventListener("click", () => onMap(item));

    card.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      onEdit(item);
    });
  });
}

// Activa arrastrar-y-soltar (SortableJS) en cada `.drag-list` de la
// pantalla actual, y persiste el nuevo orden en IndexedDB al soltar.
function wireDragReorder(storeName, items, opts = {}) {
  if (typeof Sortable === "undefined") return; // sin conexión la primera vez
  root.querySelectorAll(".drag-list").forEach((list) => {
    Sortable.create(list, {
      handle: ".drag-handle",
      ...opts,
      animation: 150,
      ghostClass: "drag-ghost",
      onEnd: async () => {
        const ids = Array.from(list.children).map((el) => parseInt(el.dataset.id, 10));
        let order = Date.now();
        for (const id of ids) {
          const item = items.find((i) => i.id === id);
          if (item) await Data.put(storeName, { ...item, order: order++ });
        }
        toast("Orden actualizado");
      },
    });
  });
}

// Campos cuyo cambio invalida la foto real guardada (se buscará de nuevo).
const PHOTO_QUERY_FIELDS = ["address", "location", "airline", "title", "company", "type", "name"];

async function saveAndRefresh(storeName, tripId, existing, values, message) {
  if (existing) {
    const merged = { ...existing, ...values };
    const queryChanged = PHOTO_QUERY_FIELDS.some(
      (field) => field in values && existing[field] !== values[field]
    );
    if (merged.photo_url && queryChanged) {
      delete merged.photo_url;
    }
    await Data.put(storeName, merged);
  } else {
    await Data.add(storeName, { ...values, trip_id: tripId });
  }
  toast(message);
  await renderApp();
}

async function deleteAndRefresh(storeName, id, message) {
  await Data.delete(storeName, id);
  toast(message);
  await renderApp();
}

// ============================================================
// VISTA DE IMPRESIÓN (sustituye a la exportación PDF con ReportLab)
// ============================================================

async function renderPrintArea(trip) {
  const [flights, hotels, itin, transport, reservations, expenses, checklist] = await Promise.all([
    Data.getAllByTrip("flights", trip.id),
    Data.getAllByTrip("hotels", trip.id),
    Data.getAllByTrip("itinerary", trip.id),
    Data.getAllByTrip("transport", trip.id),
    Data.getAllByTrip("reservations", trip.id),
    Data.getAllByTrip("expenses", trip.id),
    Data.getAllByTrip("checklist", trip.id),
  ]);

  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);

  const table = (headers, rows) => h`
    <table style="width:100%; border-collapse:collapse; margin-bottom:18px; font-size:13px;">
      <thead><tr>${headers.map((hd) => `<th style="text-align:left; border-bottom:1px solid #999; padding:4px;">${hd}</th>`).join("")}</tr></thead>
      <tbody>${rows
        .map((r) => `<tr>${r.map((c) => `<td style="padding:4px; border-bottom:1px solid #ddd;">${escapeHtml(c)}</td>`).join("")}</tr>`)
        .join("")}</tbody>
    </table>`;

  const html = h`
    <h1 style="font-family:Georgia,serif;">${escapeHtml(trip.name)}</h1>
    <p>${escapeHtml(trip.destination)} · ${formatDatePretty(trip.start_date)} → ${formatDatePretty(trip.end_date)}</p>
    ${trip.notes ? `<p><em>${escapeHtml(trip.notes)}</em></p>` : ""}

    <h2>Vuelos</h2>
    ${flights.length ? table(["Fecha","Hora","Aerolínea","Nº","Origen","Destino"], flights.map((f) => [f.date,f.time,f.airline,f.flight_number,f.origin,f.destination])) : "<p>Sin vuelos.</p>"}

    <h2>Hoteles</h2>
    ${hotels.length ? table(["Nombre","Dirección","Entrada","Salida","Precio"], hotels.map((hh) => [hh.name,hh.address,hh.check_in,hh.check_out,money(hh.price)])) : "<p>Sin hoteles.</p>"}

    <h2>Itinerario</h2>
    ${itin.length ? table(["Fecha","Hora","Título","Lugar"], itin.map((i) => [i.date,i.time,i.title,i.location])) : "<p>Sin actividades.</p>"}

    <h2>Transporte</h2>
    ${transport.length ? table(["Fecha","Tipo","Origen","Destino","Precio"], transport.map((t) => [t.date,t.type,t.origin,t.destination,money(t.price)])) : "<p>Sin transportes.</p>"}

    <h2>Reservas</h2>
    ${reservations.length ? table(["Fecha","Tipo","Nombre","Lugar","Precio"], reservations.map((r) => [r.date,r.type,r.name,r.location,money(r.price)])) : "<p>Sin reservas.</p>"}

    <h2>Gastos (total: ${money(total)})</h2>
    ${expenses.length ? table(["Fecha","Categoría","Descripción","Importe"], expenses.map((e) => [e.date,e.category,e.description,money(e.amount)])) : "<p>Sin gastos.</p>"}

    <h2>Checklist</h2>
    ${checklist.length ? table(["Estado","Tarea"], checklist.map((c) => [c.completed ? "OK" : "Pendiente", c.task])) : "<p>Sin tareas.</p>"}
  `;

  document.getElementById("print-area").innerHTML = html;
}

export { TABS, renderSection, renderPrintArea };
