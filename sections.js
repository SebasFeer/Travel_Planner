import { Data, DEFAULT_CHECKLIST_ITEMS } from "./db.js";
import {
  money,
  todayString,
  escapeHtml,
  formatDatePretty,
  daysBetween,
  openMaps,
  openMapsMultiple,
} from "./utils.js";
import { geocodeAll, routeBetween } from "./geocode.js";
import { state, root, h, toast, showFormModal, confirmAction, renderApp } from "./app.js";

// ============================================================
// CONFIGURACIÓN DE PESTAÑAS
// ============================================================

const TABS = [
  { id: "dashboard", icon: "🏠", label: "Resumen" },
  { id: "flights", icon: "✈️", label: "Vuelos" },
  { id: "hotels", icon: "🏨", label: "Hoteles" },
  { id: "itinerary", icon: "📍", label: "Plan" },
  { id: "transport", icon: "🚗", label: "Transporte" },
  { id: "reservations", icon: "🎟️", label: "Reservas" },
  { id: "expenses", icon: "💶", label: "Gastos" },
  { id: "checklist", icon: "☑️", label: "Checklist" },
  { id: "calendar", icon: "🗓️", label: "Calendario" },
  { id: "map", icon: "🗺️", label: "Mapa" },
];

const TRANSPORT_ICONS = {
  Tren: "🚆",
  Bus: "🚌",
  Coche: "🚗",
  Barco: "🚢",
  Otro: "➡️",
};

const RESERVATION_ICONS = {
  Restaurante: "🍽️",
  Actividad: "🧭",
  Entrada: "🎫",
  Otro: "📌",
};

function stub(icon, isoDate) {
  const [y, m, d] = (isoDate || "").split("-");
  const months = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  const monthLabel = m ? months[parseInt(m, 10) - 1] : "";
  return h`
    <div class="ticket-stub">
      <div class="stub-icon">${icon}</div>
      <div class="stub-day">${d ? parseInt(d, 10) : "–"}</div>
      <div class="stub-month">${monthLabel}</div>
    </div>
    <div class="ticket-divider"></div>`;
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
  const [flights, hotels, itin, expenses, checklist, transport, reservations] = await Promise.all([
    Data.getAllByTrip("flights", trip.id),
    Data.getAllByTrip("hotels", trip.id),
    Data.getAllByTrip("itinerary", trip.id),
    Data.getAllByTrip("expenses", trip.id),
    Data.getAllByTrip("checklist", trip.id),
    Data.getAllByTrip("transport", trip.id),
    Data.getAllByTrip("reservations", trip.id),
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
      <p style="font-size:13.5px; color:var(--muted);">
        Presupuesto ${money(budget)} · Gastado ${money(totalSpent)} · Disponible ${money(budget - totalSpent)}
      </p>
      <div class="progress-track"><div class="progress-fill ${over ? "over" : ""}" style="width:${pct}%"></div></div>`;
  } else {
    budgetHtml = `<p style="font-size:13.5px; color:var(--muted);">Gastado ${money(totalSpent)} · Sin presupuesto establecido</p>`;
  }

  section(h`
    ${bannerHtml}
    <div class="stat-grid">
      <div class="stat-card" data-nav="flights"><div class="stat-label">✈️ Vuelos</div><div class="stat-value">${flights.length}</div></div>
      <div class="stat-card" data-nav="hotels"><div class="stat-label">🏨 Hospedajes</div><div class="stat-value">${hotels.length}</div></div>
      <div class="stat-card" data-nav="itinerary"><div class="stat-label">📅 Actividades</div><div class="stat-value">${itin.length}</div></div>
      <div class="stat-card" data-nav="expenses"><div class="stat-label">💶 Gastado</div><div class="stat-value" style="font-size:19px;">${money(totalSpent)}</div></div>
    </div>
    <div class="panel" data-nav="expenses">
      <h3>💰 Presupuesto</h3>
      ${budgetHtml}
    </div>
    <div class="panel" data-nav="checklist">
      <h3>☑️ Checklist</h3>
      <p style="font-size:13.5px; color:var(--muted);">
        ${checklist.length ? `${completedCount}/${checklist.length} tareas completadas (${checklistPct}%)` : "No hay tareas."}
      </p>
    </div>
    <div class="panel" data-nav="calendar">
      <h3>⏰ Próximos eventos</h3>
      ${nextEventsHtml}
    </div>
    ${
      trip.notes
        ? `<div class="panel"><h3>📝 Notas del viaje</h3><p style="font-size:13.5px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(trip.notes)}</p></div>`
        : ""
    }
  `);
  setFab("");

  root.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => {
      state.section = el.dataset.nav;
      renderApp();
    });
  });
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
        <div class="ticket" data-id="${f.id}">
          ${stub("✈️", f.date)}
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
    : emptyState("✈️", "No hay vuelos añadidos todavía.");

  section(list);
  setFab(fabBtn());

  wireTicketActions("flights", flights, (f) => openFlightForm(trip, f));
  document.getElementById("fab-add").addEventListener("click", () => openFlightForm(trip));
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
        <div class="ticket" data-id="${hotel.id}">
          ${stub("🏨", hotel.check_in)}
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
    : emptyState("🏨", "No hay hoteles añadidos todavía.");

  section(list);
  setFab(fabBtn());

  wireTicketActions("hotels", hotels, (hotel) => openHotelForm(trip, hotel), (hotel) => openMaps(hotel.address));
  document.getElementById("fab-add").addEventListener("click", () => openHotelForm(trip));
}

function openHotelForm(trip, hotel) {
  showFormModal({
    title: hotel ? "Editar hotel" : "Nuevo hotel",
    initial: hotel,
    fields: [
      { name: "name", label: "Nombre", required: true },
      { name: "address", label: "Dirección" },
      { name: "check_in", label: "Entrada", type: "date", half: true },
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

  function ticketHtml(item) {
    return h`
      <div class="ticket" data-id="${item.id}">
        <div class="drag-handle">⠿</div>
        ${stub("📍", item.date)}
        <div class="ticket-body">
          <div class="ticket-title-row">
            <p class="ticket-title">${escapeHtml(item.title || "Actividad")}</p>
            <span class="ticket-amount">${item.time || ""}</span>
          </div>
          ${item.location ? `<p class="ticket-meta">${escapeHtml(item.location)}</p>` : ""}
          ${item.notes ? `<p class="ticket-meta">${escapeHtml(item.notes)}</p>` : ""}
          <div class="ticket-actions">
            ${item.location ? `<button data-act="map">🗺️ Mapa</button>` : ""}
            <button data-act="edit">✏️ Editar</button>
            <button data-act="delete" class="danger">🗑️ Eliminar</button>
          </div>
        </div>
      </div>`;
  }

  let html = "";
  for (const date of dates) {
    html += `<p class="section-title">${formatDatePretty(date)}</p>`;
    html += `<div class="drag-list" data-date="${date}">${byDate[date].map(ticketHtml).join("")}</div>`;
  }
  if (noDate.length) {
    html += `<p class="section-title">Sin fecha</p>`;
    html += `<div class="drag-list" data-date="">${noDate.map(ticketHtml).join("")}</div>`;
  }
  if (!dates.length && !noDate.length) {
    html = emptyState("📍", "Todavía no has planificado ninguna actividad.");
  } else {
    html += `<p style="text-align:center; color:var(--muted); font-size:12px; margin-top:6px;">Mantén pulsado ⠿ para reordenar</p>`;
  }

  section(html);
  setFab(fabBtn());

  wireTicketActions("itinerary", items, (item) => openItineraryForm(trip, item), (item) => openMaps(item.location));
  wireDragReorder("itinerary", items);
  document.getElementById("fab-add").addEventListener("click", () => openItineraryForm(trip));
}

function openItineraryForm(trip, item) {
  showFormModal({
    title: item ? "Editar actividad" : "Nueva actividad",
    initial: item,
    fields: [
      { name: "title", label: "Título", required: true },
      { name: "date", label: "Fecha", type: "date", half: true, required: true },
      { name: "time", label: "Hora", type: "time", half: true },
      { name: "location", label: "Lugar" },
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
        .map(
          (t) => h`
        <div class="ticket" data-id="${t.id}">
          ${stub(TRANSPORT_ICONS[t.type] || "🚗", t.date)}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(t.type || "Transporte")}${t.company ? ` · ${escapeHtml(t.company)}` : ""}</p>
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
        </div>`
        )
        .join("")
    : emptyState("🚗", "No hay trayectos añadidos todavía.");

  section(list);
  setFab(fabBtn());

  wireTicketActions(
    "transport",
    items,
    (t) => openTransportForm(trip, t),
    (t) => openMapsMultiple([t.origin, t.destination])
  );
  document.getElementById("fab-add").addEventListener("click", () => openTransportForm(trip));
}

function openTransportForm(trip, t) {
  showFormModal({
    title: t ? "Editar transporte" : "Nuevo transporte",
    initial: t,
    fields: [
      { name: "type", label: "Tipo", type: "select", options: ["Tren", "Bus", "Coche", "Barco", "Otro"], half: true },
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
        <div class="ticket" data-id="${r.id}">
          ${stub(RESERVATION_ICONS[r.type] || "🎟️", r.date)}
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
    : emptyState("🎟️", "No hay reservas añadidas todavía.");

  section(list);
  setFab(fabBtn());

  wireTicketActions("reservations", items, (r) => openReservationForm(trip, r), (r) => openMaps(r.location));
  document.getElementById("fab-add").addEventListener("click", () => openReservationForm(trip));
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

async function renderExpenses(trip) {
  const items = await Data.getAllByTrip("expenses", trip.id);
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  const total = items.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const budget = parseFloat(trip.budget || 0);

  const list = items.length
    ? items
        .map(
          (e) => h`
        <div class="ticket" data-id="${e.id}">
          ${stub("💶", e.date)}
          <div class="ticket-body">
            <div class="ticket-title-row">
              <p class="ticket-title">${escapeHtml(e.description || e.category || "Gasto")}</p>
              <span class="ticket-amount">${money(e.amount)}</span>
            </div>
            <p class="ticket-meta"><span class="mono">${escapeHtml(e.category || "Otros")}</span></p>
            <div class="ticket-actions">
              <button data-act="edit">✏️ Editar</button>
              <button data-act="delete" class="danger">🗑️ Eliminar</button>
            </div>
          </div>
        </div>`
        )
        .join("")
    : emptyState("💶", "No hay gastos registrados todavía.");

  section(h`
    <div class="panel" style="margin-top:0;">
      <h3>Total gastado</h3>
      <p style="font-family:var(--font-display); font-size:26px; font-weight:600;">${money(total)}</p>
      ${
        budget > 0
          ? `<div class="progress-track"><div class="progress-fill ${total > budget ? "over" : ""}" style="width:${Math.min(100, Math.round((total / budget) * 100))}%"></div></div>
             <p style="font-size:12.5px; color:var(--muted); margin-top:6px;">de ${money(budget)} presupuestados</p>`
          : ""
      }
    </div>
    <div style="margin-top:16px;">${list}</div>
  `);
  setFab(fabBtn());

  wireTicketActions("expenses", items, (e) => openExpenseForm(trip, e));
  document.getElementById("fab-add").addEventListener("click", () => openExpenseForm(trip));
}

function openExpenseForm(trip, e) {
  showFormModal({
    title: e ? "Editar gasto" : "Nuevo gasto",
    initial: e,
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
        <div class="ticket compact ${item.completed ? "done" : ""}" data-id="${item.id}">
          <div class="drag-handle">⠿</div>
          <div class="ticket-stub" style="width:52px;">
            <input type="checkbox" data-act="toggle" ${item.completed ? "checked" : ""}
              style="width:24px;height:24px;accent-color:var(--teal);" />
          </div>
          <div class="ticket-divider"></div>
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
    : emptyState("☑️", "No hay tareas todavía.");

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
    if (hh.check_in) pins.push({ kind: "hotel", text: hh.address, date: hh.check_in, time: "15:00", title: `Entrada: ${hh.name || "Hotel"}` });
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

async function renderMap(trip) {
  const pins = await collectMapPins(trip);

  if (!pins.length) {
    section(emptyState("🗺️", "Añade direcciones a tus hoteles, actividades o reservas para verlas en el mapa."));
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
    <div id="leaflet-map" style="height:58vh; border-radius:16px; overflow:hidden;"></div>
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
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  }).addTo(map);

  const markers = located.map((p) => {
    const icon = L.divIcon({
      html: `<div class="map-pin">${KIND_ICON[p.kind] || "📍"}</div>`,
      className: "",
      iconSize: [30, 30],
      iconAnchor: [15, 28],
    });
    return L.marker([p.lat, p.lng], { icon })
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(p.title)}</strong><br>${p.time || ""}`);
  });

  const bounds = L.latLngBounds(located.map((p) => [p.lat, p.lng]));
  map.fitBounds(bounds.pad(0.25));

  if (mapDayFilter !== "all" && located.length >= 2) {
    statusEl.textContent = "Calculando ruta…";
    const ordered = [...located].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    const route = await routeBetween(ordered);
    if (route) {
      L.polyline(route.coords, { color: "#e4a421", weight: 4, opacity: 0.85 }).addTo(map);
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
  root.querySelectorAll(".ticket").forEach((card) => {
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
function wireDragReorder(storeName, items) {
  if (typeof Sortable === "undefined") return; // sin conexión la primera vez
  root.querySelectorAll(".drag-list").forEach((list) => {
    Sortable.create(list, {
      handle: ".drag-handle",
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

async function saveAndRefresh(storeName, tripId, existing, values, message) {
  if (existing) {
    await Data.put(storeName, { ...existing, ...values });
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
