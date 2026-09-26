// ============================================================
// features/export.js — Exportar el viaje desde la web.
//
// exportPdf: en la app, exportItineraryPdf() (js/sections.js) dibuja
//   el PDF con jsPDF y renderPrintArea() rellena #print-area para
//   window.print(). En la web se hace lo segundo con el contenido y
//   el orden del primero: portada, notas, Vuelos, Hoteles, Itinerario
//   (por días), Transporte, Reservas, Gastos (con total) y Checklist.
//   Se monta un contenedor oculto (.vjx-print) que solo se ve al
//   imprimir (ver f-discover-currency-export.css) y se abre el
//   diálogo del navegador, donde se elige "Guardar como PDF". El
//   título del documento pasa a ser el nombre de archivo de la app
//   (itinerario-<destino>) para que el PDF se guarde con ese nombre.
//
// exportIcs: copia exacta de exportTripToIcs() (mismos eventos,
//   mismo contenido y mismo nombre de archivo), con descarga directa.
// ============================================================

import { formatDatePretty, uid, download } from "../../../js/utils.js";

const STORES = ["flights", "hotels", "itinerary", "transport", "reservations", "expenses", "checklist"];

// Mismos colores que PDF_COLORS en js/sections.js
const COLORS = {
  brand: "rgb(108,92,231)",
  flights: "rgb(37,99,235)",
  hotels: "rgb(13,148,136)",
  itinerary: "rgb(108,92,231)",
  transport: "rgb(217,119,6)",
  reservations: "rgb(219,39,119)",
  expenses: "rgb(22,163,74)",
  checklist: "rgb(100,116,139)",
};

const slug = (trip) => (trip.destination || trip.name || "viaje").toLowerCase().replace(/[^a-z0-9]+/g, "-");

// ------------------------------------------------------------
// PDF (imprimir)
// ------------------------------------------------------------

export async function exportPdf(trip, ctx) {
  const { Data, esc, money, toast } = ctx;
  const [flights, hotels, itin, transport, reservations, expenses, checklist] = await Promise.all(
    STORES.map((s) => Data.getAllByTrip(s, trip.id))
  );

  const section = (title, color, inner) =>
    `<div class="vjx-sec" style="--vjx-accent:${color}"><h2>${esc(title)}</h2>${inner}</div>`;
  const empty = (text) => `<p class="vjx-empty">${esc(text)}</p>`;
  const item = (title, subtitle, amount) => `
    <div class="vjx-item">
      <div><b>${esc(title || "(sin título)")}</b>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>
      ${amount ? `<em>${esc(amount)}</em>` : ""}
    </div>`;

  // ---- Vuelos ----
  const flightsHtml = flights.length
    ? flights
        .slice()
        .sort((a, b) => `${a.date || ""}${a.time || ""}`.localeCompare(`${b.date || ""}${b.time || ""}`))
        .map((f) =>
          item(
            [f.origin, f.destination].filter(Boolean).join(" → ") || f.airline || "Vuelo",
            [f.date ? formatDatePretty(f.date) : "", f.time, f.airline, f.flight_number].filter(Boolean).join(" · ")
          )
        )
        .join("")
    : empty("Sin vuelos guardados.");

  // ---- Hoteles ----
  const hotelsHtml = hotels.length
    ? hotels
        .map((hh) =>
          item(
            hh.name || "Hotel",
            [hh.address, hh.check_in && hh.check_out ? `${formatDatePretty(hh.check_in)} → ${formatDatePretty(hh.check_out)}` : ""]
              .filter(Boolean)
              .join(" · "),
            hh.price ? money(hh.price) : ""
          )
        )
        .join("")
    : empty("Sin hoteles guardados.");

  // ---- Itinerario, agrupado por día ----
  const byDate = {};
  const noDate = [];
  itin.forEach((i) => {
    if (!i.date) return noDate.push(i);
    (byDate[i.date] ||= []).push(i);
  });
  const dates = Object.keys(byDate).sort();
  const itinLine = (i) => item(i.title || "Actividad", [i.time, i.location].filter(Boolean).join(" · "));
  const itinHtml =
    !dates.length && !noDate.length
      ? empty("Sin actividades planificadas.")
      : dates
          .map(
            (date, idx) =>
              `<h3>Día ${idx + 1} · ${esc(formatDatePretty(date))}</h3>` +
              byDate[date]
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map(itinLine)
                .join("")
          )
          .join("") + (noDate.length ? `<h3>Sin fecha</h3>${noDate.map(itinLine).join("")}` : "");

  // ---- Transporte ----
  const transportHtml = transport.length
    ? transport
        .map((tr) =>
          item(
            [tr.origin, tr.destination].filter(Boolean).join(" → ") || tr.type || "Trayecto",
            [tr.date ? formatDatePretty(tr.date) : "", tr.type].filter(Boolean).join(" · "),
            tr.price ? money(tr.price) : ""
          )
        )
        .join("")
    : empty("Sin transportes guardados.");

  // ---- Reservas ----
  const reservationsHtml = reservations.length
    ? reservations
        .map((r) =>
          item(
            r.name || "Reserva",
            [r.date ? formatDatePretty(r.date) : "", r.type, r.location].filter(Boolean).join(" · "),
            r.price ? money(r.price) : ""
          )
        )
        .join("")
    : empty("Sin reservas guardadas.");

  // ---- Gastos ----
  const total = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
  const expensesHtml = expenses.length
    ? `<p class="vjx-total">Total: ${esc(money(total))}</p>` +
      expenses
        .slice()
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((e) =>
          item(
            e.description || e.category || "Gasto",
            [e.date ? formatDatePretty(e.date) : "", e.category].filter(Boolean).join(" · "),
            money(e.amount)
          )
        )
        .join("")
    : empty("Sin gastos registrados.");

  // ---- Checklist ----
  const checklistHtml = checklist.length
    ? `<ul class="vjx-check">${checklist
        .map((c) => `<li class="${c.completed ? "done" : ""}">${c.completed ? "[x]" : "[ ]"} ${esc(c.task || "")}</li>`)
        .join("")}</ul>`
    : empty("Sin tareas en la checklist.");

  const dateRange =
    trip.start_date && trip.end_date ? `${formatDatePretty(trip.start_date)} → ${formatDatePretty(trip.end_date)}` : "";

  const html = `
    <div class="vjx-cover" style="background:${COLORS.brand}">
      <h1>${esc(trip.name || trip.destination || "Viaje")}</h1>
      ${trip.destination ? `<p>${esc(trip.destination)}</p>` : ""}
      ${dateRange ? `<p>${esc(dateRange)}</p>` : ""}
    </div>
    ${trip.notes ? `<p class="vjx-notes">${esc(trip.notes)}</p>` : ""}
    ${section("Vuelos", COLORS.flights, flightsHtml)}
    ${section("Hoteles", COLORS.hotels, hotelsHtml)}
    ${section("Itinerario", COLORS.itinerary, itinHtml)}
    ${section("Transporte", COLORS.transport, transportHtml)}
    ${section("Reservas", COLORS.reservations, reservationsHtml)}
    ${section("Gastos", COLORS.expenses, expensesHtml)}
    ${section("Checklist", COLORS.checklist, checklistHtml)}
    <p class="vjx-foot">Viajoo</p>`;

  document.querySelectorAll(".vjx-print").forEach((el) => el.remove());
  const area = document.createElement("div");
  area.className = "vjx-print";
  area.setAttribute("aria-hidden", "true");
  area.innerHTML = html;
  document.body.appendChild(area);

  const prevTitle = document.title;
  document.title = `itinerario-${slug(trip)}`;
  document.documentElement.classList.add("vjx-printing");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.title = prevTitle;
    document.documentElement.classList.remove("vjx-printing");
    area.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  toast('Elige "Guardar como PDF" en la ventana de impresión');
  // Igual que la app: un instante para que el navegador pinte el
  // contenido antes de abrir el diálogo.
  setTimeout(() => {
    // Todos los navegadores actuales lanzan "afterprint" al cerrar el
    // diálogo (Chrome/Firefox/Safari), y ahí se deshace todo.
    window.print();
  }, 150);
}

// ------------------------------------------------------------
// Calendario (.ics) — copia de exportTripToIcs() de js/sections.js
// ------------------------------------------------------------

function icsEscape(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function icsDate(dateStr) {
  return (dateStr || "").replace(/-/g, "");
}

function icsDateTime(dateStr, timeStr) {
  return `${icsDate(dateStr)}T${(timeStr || "00:00").replace(":", "")}00`;
}

function icsNowStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
}

function icsAddDays(dateStr, days) {
  const [y, m, d] = (dateStr || "").split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function icsEvent({ uid: eventUid, summary, description, location, allDay, startDate, startTime, endDate, endTime }) {
  const lines = ["BEGIN:VEVENT", `UID:${eventUid}`, `DTSTAMP:${icsNowStamp()}`];
  if (allDay) {
    lines.push(`DTSTART;VALUE=DATE:${icsDate(startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(endDate || icsAddDays(startDate, 1))}`);
  } else {
    lines.push(`DTSTART:${icsDateTime(startDate, startTime)}`);
    if (endDate) {
      lines.push(`DTEND:${icsDateTime(endDate, endTime || startTime)}`);
    } else {
      const [hh, mm] = (startTime || "00:00").split(":").map(Number);
      const endMinutes = (hh || 0) * 60 + (mm || 0) + 60;
      const endDateAdj = endMinutes >= 24 * 60 ? icsAddDays(startDate, 1) : startDate;
      const endHh = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
      const endMm = String(endMinutes % 60).padStart(2, "0");
      lines.push(`DTEND:${icsDateTime(endDateAdj, `${endHh}:${endMm}`)}`);
    }
  }
  lines.push(`SUMMARY:${icsEscape(summary)}`);
  if (location) lines.push(`LOCATION:${icsEscape(location)}`);
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

export async function exportIcs(trip, ctx) {
  const { Data, toast } = ctx;
  const [flights, hotels, itin, transport, reservations] = await Promise.all(
    ["flights", "hotels", "itinerary", "transport", "reservations"].map((s) => Data.getAllByTrip(s, trip.id))
  );

  const events = [];

  flights.forEach((f) => {
    if (!f.date) return;
    const route = [f.origin, f.destination].filter(Boolean).join(" → ");
    events.push(
      icsEvent({
        uid: uid("flight"),
        summary: `Vuelo${f.flight_number ? ` ${f.flight_number}` : ""}${route ? `: ${route}` : ""}`,
        description: [f.airline, f.notes].filter(Boolean).join(" — "),
        location: route,
        allDay: !f.time,
        startDate: f.date,
        startTime: f.time,
      })
    );
    if (f.return_date) {
      const backRoute = [f.destination, f.origin].filter(Boolean).join(" → ");
      events.push(
        icsEvent({
          uid: uid("flight-return"),
          summary: `Vuelo de vuelta${backRoute ? `: ${backRoute}` : ""}`,
          description: f.airline || "",
          location: backRoute,
          allDay: true,
          startDate: f.return_date,
        })
      );
    }
  });

  hotels.forEach((hh) => {
    if (!hh.check_in) return;
    events.push(
      icsEvent({
        uid: uid("hotel"),
        summary: `Hotel: ${hh.name || "Alojamiento"}`,
        description: hh.notes || "",
        location: hh.address || "",
        allDay: !hh.check_in_time,
        startDate: hh.check_in,
        startTime: hh.check_in_time,
        endDate: hh.check_out || undefined,
        endTime: hh.check_in_time,
      })
    );
  });

  itin.forEach((i) => {
    if (!i.date) return;
    events.push(
      icsEvent({
        uid: uid("itin"),
        summary: i.title || "Actividad",
        description: i.notes || "",
        location: i.location || "",
        allDay: !i.time,
        startDate: i.date,
        startTime: i.time,
      })
    );
  });

  transport.forEach((tr) => {
    if (!tr.date) return;
    const route = [tr.origin, tr.destination].filter(Boolean).join(" → ");
    events.push(
      icsEvent({
        uid: uid("transport"),
        summary: `${tr.type || "Transporte"}${route ? `: ${route}` : ""}`,
        description: [tr.company, tr.notes].filter(Boolean).join(" — "),
        location: route,
        allDay: !tr.time,
        startDate: tr.date,
        startTime: tr.time,
      })
    );
  });

  reservations.forEach((r) => {
    if (!r.date) return;
    events.push(
      icsEvent({
        uid: uid("reservation"),
        summary: r.name || r.type || "Reserva",
        description: [r.type, r.notes].filter(Boolean).join(" — "),
        location: r.location || "",
        allDay: !r.time,
        startDate: r.date,
        startTime: r.time,
      })
    );
  });

  if (!events.length) {
    toast("No hay nada con fecha todavía para exportar al calendario.");
    return;
  }

  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Viajoo//ES", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
  const filename = `calendario-${slug(trip)}.ics`;
  download(filename, ics, "text/calendar");
  toast("Calendario descargado — ábrelo con tu app de calendario para añadirlo");
}
