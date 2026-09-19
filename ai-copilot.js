// ============================================================
// ai-copilot.js — Copiloto de viajes con IA.
//
// Función Pro (como flightstatus.js): llama a tu Cloud Function
// "generateItinerary" (que es quien de verdad habla con Claude, con
// la clave guardada en el servidor). Aquí nunca hay ninguna clave.
// Si algo falla (sin sesión, sin conexión, función no desplegada...)
// avisa con un toast y no rompe nada más de la app.
// ============================================================

import { AI_COPILOT_ENDPOINT } from "./ai-copilot-config.js";
import { getIdToken } from "./cloud.js";
import { Data } from "./db.js";
import { h, toast, state, withTransition, renderApp } from "./app.js";
import { escapeHtml, formatDatePretty, money, daysBetween } from "./utils.js";

// ------------------------------------------------------------
// TEMPORAL — mock local del Copiloto IA (desarrollo, sin gastar
// créditos de la API). Se activa/desactiva en Ajustes → Modo
// desarrollador. Usa localStorage (no Data.settingGet) para poder
// leerse de forma síncrona en isAiCopilotConfigured(). Quitar este
// bloque (y el botón en app.js) cuando ya no haga falta.
// ------------------------------------------------------------
const AI_COPILOT_MOCK_KEY = "ai_copilot_use_mock_DEV";
const AI_COPILOT_MOCK_URL_KEY = "ai_copilot_mock_url_DEV";
const AI_COPILOT_MOCK_URL_DEFAULT = "http://localhost:8787/generateItinerary";

function isAiCopilotMockEnabled() {
  return localStorage.getItem(AI_COPILOT_MOCK_KEY) === "1";
}

function setAiCopilotMockEnabled(value) {
  localStorage.setItem(AI_COPILOT_MOCK_KEY, value ? "1" : "0");
}

// URL del mock: por defecto localhost (probando desde el propio
// ordenador), pero se puede cambiar por una URL de túnel (ngrok,
// Cloudflare Tunnel...) para probar desde el móvil contra la app
// real publicada en GitHub Pages.
function getAiCopilotMockUrl() {
  return localStorage.getItem(AI_COPILOT_MOCK_URL_KEY) || AI_COPILOT_MOCK_URL_DEFAULT;
}

// Normaliza la URL guardada para que siempre acabe en
// "/generateItinerary": es un fallo muy fácil de cometer al pegar la
// URL del túnel/worker sin esa parte (p. ej. solo
// "https://xxx.trycloudflare.com"), y el mock devuelve "Ruta no
// encontrada" en cuanto la ruta no coincide exactamente. Así, se
// pegue como se pegue, siempre se llama a la ruta correcta.
function normalizeMockUrl(url) {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return AI_COPILOT_MOCK_URL_DEFAULT;
  return trimmed.endsWith("/generateItinerary") ? trimmed : `${trimmed}/generateItinerary`;
}

function setAiCopilotMockUrl(url) {
  localStorage.setItem(AI_COPILOT_MOCK_URL_KEY, url || AI_COPILOT_MOCK_URL_DEFAULT);
}

function isAiCopilotConfigured() {
  return isAiCopilotMockEnabled() || !!AI_COPILOT_ENDPOINT;
}

// ------------------------------------------------------------
// Llamada a la Cloud Function (o al mock local si está activo).
// Devuelve el JSON del itinerario o null si algo falló (y ya se ha
// avisado con un toast).
// ------------------------------------------------------------
async function requestItinerary(payload) {
  const useMock = isAiCopilotMockEnabled();
  const endpoint = useMock ? normalizeMockUrl(getAiCopilotMockUrl()) : AI_COPILOT_ENDPOINT;

  const idToken = await getIdToken();
  if (!idToken && !useMock) {
    toast("Inicia sesión en Ajustes → Mi cuenta para usar el Copiloto IA");
    return null;
  }
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      toast(data.error || "El Copiloto IA no ha podido generar el plan.");
      return null;
    }
    return data;
  } catch (err) {
    toast("Sin conexión con el Copiloto IA.");
    return null;
  }
}

// Navega directamente al resumen de un viaje recién creado, igual
// que si se hubiera tocado su tarjeta desde el inicio.
function goToTrip(tripId) {
  state.tripId = tripId;
  state.section = "dashboard";
  withTransition(renderApp, "forward");
}

function addDaysIso(iso, n) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// ------------------------------------------------------------
// Guarda el plan generado en el propio viaje (trip.ai_plan), para
// poder mostrar restaurantes/consejos/presupuesto estimado después
// sin tener que volver a llamar a la IA. No toca vuelos, hoteles ni
// gastos reales: son solo sugerencias.
// ------------------------------------------------------------
async function saveAiPlanMeta(trip, result, { merge } = { merge: true }) {
  const existing = (merge && trip.ai_plan) || {};
  const byDate = { ...(existing.byDate || {}) };
  for (const day of result.days) {
    byDate[day.date] = {
      title: day.title || "",
      restaurants: day.restaurants || [],
      dayNumber: day.dayNumber || null,
    };
  }
  const ai_plan = {
    generatedAt: Date.now(),
    summary: result.summary || existing.summary || "",
    budgetEstimate: result.budgetEstimate || existing.budgetEstimate || null,
    transportTips: result.transportTips || existing.transportTips || "",
    byDate,
  };
  const updated = { ...trip, ai_plan };
  await Data.put("trips", updated);
  return updated;
}

// ------------------------------------------------------------
// Escribe las actividades generadas para un conjunto de días en el
// almacén "itinerary", sustituyendo lo que hubiera antes en esas
// fechas concretas (el resto del itinerario del viaje no se toca).
// ------------------------------------------------------------
async function applyDaysToItinerary(trip, aiDays) {
  const existing = await Data.getAllByTrip("itinerary", trip.id);
  const dates = new Set(aiDays.map((d) => d.date));
  const toDelete = existing.filter((it) => dates.has(it.date));
  for (const item of toDelete) {
    await Data.delete("itinerary", item.id);
  }
  let order = Date.now();
  for (const day of aiDays) {
    for (const item of day.items || []) {
      const costNote = item.estCost ? ` (≈ ${money(item.estCost)})` : "";
      await Data.add("itinerary", {
        trip_id: trip.id,
        date: day.date,
        time: item.time || "",
        title: item.title || "Actividad",
        location: item.location || "",
        notes: [item.notes, costNote].filter(Boolean).join(""),
        order: order++,
      });
    }
  }
}

// ============================================================
// SHEET: generar el itinerario completo del viaje
// ============================================================

function aiLoadingHtml(text) {
  return h`
    <div class="ai-loading">
      <div class="boot-spinner"></div>
      <p>${escapeHtml(text)}</p>
    </div>`;
}

function dayPreviewHtml(day, i) {
  const items = (day.items || [])
    .map(
      (it) => h`
      <div class="ai-item-row">
        <span class="ai-item-time">${escapeHtml(it.time || "")}</span>
        <div class="ai-item-body">
          <p class="ai-item-title">${escapeHtml(it.title || "")}</p>
          ${it.location ? `<p class="ai-item-sub">📍 ${escapeHtml(it.location)}</p>` : ""}
          ${it.notes ? `<p class="ai-item-sub">${escapeHtml(it.notes)}</p>` : ""}
        </div>
        ${it.estCost ? `<span class="ai-item-cost">${money(it.estCost)}</span>` : ""}
      </div>`
    )
    .join("");

  const restaurants = (day.restaurants || [])
    .map(
      (r) => `<span class="tag-chip" style="background:var(--cat-hotels-a); color:var(--cat-hotels);">
        🍽️ ${escapeHtml(r.name)}${r.priceRange ? ` · ${escapeHtml(r.priceRange)}` : ""}
      </span>`
    )
    .join(" ");

  return h`
    <div class="panel ai-day-card">
      <h3>Día ${day.dayNumber || i + 1} · ${formatDatePretty(day.date)}</h3>
      ${day.title ? `<p style="color:var(--muted); font-size:13px; margin:-4px 0 8px;">${escapeHtml(day.title)}</p>` : ""}
      ${items}
      ${restaurants ? `<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">${restaurants}</div>` : ""}
    </div>`;
}

function resultPreviewHtml(result) {
  const b = result.budgetEstimate;
  const budgetHtml = b
    ? h`
      <div class="panel">
        <h3>Presupuesto estimado</h3>
        <p class="et-amount" style="font-size:22px;">${money(b.total || 0)}</p>
        <div class="ai-budget-grid">
          ${b.flights ? `<span>✈️ Vuelos: ${money(b.flights)}</span>` : ""}
          ${b.hotels ? `<span>🏨 Hoteles: ${money(b.hotels)}</span>` : ""}
          ${b.food ? `<span>🍽️ Comida: ${money(b.food)}</span>` : ""}
          ${b.transport ? `<span>🚗 Transporte: ${money(b.transport)}</span>` : ""}
          ${b.activities ? `<span>🎟️ Actividades: ${money(b.activities)}</span>` : ""}
        </div>
      </div>`
    : "";

  return h`
    ${result.summary ? `<p style="color:var(--text); font-size:14px; line-height:1.5; margin-bottom:12px;">${escapeHtml(result.summary)}</p>` : ""}
    ${budgetHtml}
    ${result.transportTips ? `<div class="panel"><h3>Consejos de transporte</h3><p style="font-size:13.5px; color:var(--text); line-height:1.5;">${escapeHtml(result.transportTips)}</p></div>` : ""}
    ${result.days.map((d, i) => dayPreviewHtml(d, i)).join("")}
  `;
}

function openAiPlannerSheet(trip, onApplied) {
  if (!isAiCopilotConfigured()) {
    toast("El Copiloto IA todavía no está desplegado en esta app (ver DEPLOY_AI_COPILOT.md)");
    return;
  }

  const totalDays = trip.start_date && trip.end_date ? (daysBetween(trip.start_date, trip.end_date) || 0) + 1 : null;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">✨ Generar itinerario con IA</h2>
      <p style="color:var(--muted); font-size:13px; margin-top:-8px;">
        ${escapeHtml(trip.destination || trip.name)} ·
        ${totalDays ? `${totalDays} día${totalDays === 1 ? "" : "s"}` : "duración sin definir"}
        ${trip.budget ? ` · presupuesto ${money(trip.budget)}` : ""}
      </p>
      <div class="field">
        <label>¿Qué te gustaría en este viaje?</label>
        <textarea id="ai-interests" rows="3" placeholder="Ej. me gusta la comida local, la tecnología y los templos, ritmo tranquilo por las mañanas..."></textarea>
      </div>
      <div id="ai-planner-body"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="ai-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="ai-generate">✨ Generar itinerario</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#ai-cancel").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#ai-generate").addEventListener("click", async () => {
    if (!totalDays) {
      toast("Antes pon fecha de inicio y fin del viaje (editar viaje)");
      return;
    }
    const interests = overlay.querySelector("#ai-interests").value.trim();
    const body = overlay.querySelector("#ai-planner-body");
    const genBtn = overlay.querySelector("#ai-generate");
    genBtn.disabled = true;
    body.innerHTML = aiLoadingHtml("Diseñando tu itinerario…");

    const result = await requestItinerary({
      mode: "full",
      destination: trip.destination || trip.name,
      startDate: trip.start_date,
      endDate: trip.end_date,
      days: totalDays,
      budget: trip.budget || null,
      currency: "EUR",
      interests,
    });

    genBtn.disabled = false;
    if (!result) {
      body.innerHTML = "";
      return;
    }

    body.innerHTML = resultPreviewHtml(result);
    overlay.querySelector(".modal-actions").innerHTML = `
      <button type="button" class="btn btn-ghost" id="ai-discard">Descartar</button>
      <button type="button" class="btn btn-primary" id="ai-apply">✅ Aplicar al itinerario</button>`;
    overlay.querySelector("#ai-discard").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#ai-apply").addEventListener("click", async () => {
      const ok = confirm(
        "Esto reemplazará las actividades ya guardadas en las fechas del viaje generadas por la IA. ¿Continuar?"
      );
      if (!ok) return;
      await applyDaysToItinerary(trip, result.days);
      const updatedTrip = await saveAiPlanMeta(trip, result, { merge: false });
      overlay.remove();
      toast("Itinerario generado y aplicado");
      if (onApplied) onApplied(updatedTrip);
    });
  });
}

// ============================================================
// SHEET: regenerar un solo día
// ============================================================

function openAiDayRegenerateSheet(trip, dateStr, dayNumber, onApplied) {
  if (!isAiCopilotConfigured()) {
    toast("El Copiloto IA todavía no está desplegado en esta app (ver DEPLOY_AI_COPILOT.md)");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">🔄 Regenerar día con IA</h2>
      <p style="color:var(--muted); font-size:13px; margin-top:-8px;">${formatDatePretty(dateStr)}</p>
      <div class="field">
        <label>¿Algo concreto para este día? (opcional)</label>
        <textarea id="ai-day-instructions" rows="2" placeholder="Ej. quiero algo más tranquilo, o céntralo en museos..."></textarea>
      </div>
      <div id="ai-day-body"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="ai-day-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="ai-day-generate">🔄 Regenerar este día</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#ai-day-cancel").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#ai-day-generate").addEventListener("click", async () => {
    const instructions = overlay.querySelector("#ai-day-instructions").value.trim();
    const body = overlay.querySelector("#ai-day-body");
    const genBtn = overlay.querySelector("#ai-day-generate");
    genBtn.disabled = true;
    body.innerHTML = aiLoadingHtml("Rehaciendo este día…");

    const allDays = trip.ai_plan?.byDate
      ? Object.entries(trip.ai_plan.byDate)
          .filter(([d]) => d !== dateStr)
          .map(([d, meta]) => ({ date: d, dayNumber: meta.dayNumber, title: meta.title }))
      : [];

    const result = await requestItinerary({
      mode: "day",
      destination: trip.destination || trip.name,
      targetDate: dateStr,
      dayNumber,
      budget: trip.budget || null,
      currency: "EUR",
      interests: "",
      instructions,
      context: allDays,
    });

    genBtn.disabled = false;
    if (!result) {
      body.innerHTML = "";
      return;
    }

    body.innerHTML = resultPreviewHtml(result);
    overlay.querySelector(".modal-actions").innerHTML = `
      <button type="button" class="btn btn-ghost" id="ai-day-discard">Descartar</button>
      <button type="button" class="btn btn-primary" id="ai-day-apply">✅ Aplicar este día</button>`;
    overlay.querySelector("#ai-day-discard").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#ai-day-apply").addEventListener("click", async () => {
      await applyDaysToItinerary(trip, result.days);
      const updatedTrip = await saveAiPlanMeta(trip, result, { merge: true });
      overlay.remove();
      toast("Día regenerado");
      if (onApplied) onApplied(updatedTrip);
    });
  });
}

// ============================================================
// SHEET: crear un viaje nuevo desde cero con IA (desde el inicio,
// antes de que exista ningún viaje). A partir de destino + fechas +
// gustos, crea el viaje y le aplica el itinerario generado.
// ============================================================

function openAiNewTripSheet() {
  if (!isAiCopilotConfigured()) {
    toast("El Copiloto IA todavía no está desplegado en esta app (ver DEPLOY_AI_COPILOT.md)");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">✨ Planificar viaje con IA</h2>
      <p style="color:var(--muted); font-size:13px; margin-top:-8px;">
        Dinos destino, fechas y qué te apetece: la IA crea el viaje y te arma el itinerario día a día.
      </p>
      <div class="field">
        <label for="ai-new-destination">Destino</label>
        <input type="text" id="ai-new-destination" placeholder="Ej. Roma, Italia" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="ai-new-start">Fecha de inicio</label>
          <input type="date" id="ai-new-start" />
        </div>
        <div class="field">
          <label for="ai-new-end">Fecha de fin</label>
          <input type="date" id="ai-new-end" />
        </div>
      </div>
      <div class="field">
        <label for="ai-new-budget">Presupuesto (€) — opcional</label>
        <input type="number" step="0.01" id="ai-new-budget" placeholder="Ej. 800" />
      </div>
      <div class="field">
        <label for="ai-new-interests">¿Qué te gustaría en este viaje?</label>
        <textarea id="ai-new-interests" rows="3" placeholder="Ej. comida local, arte, ritmo tranquilo por las mañanas..."></textarea>
      </div>
      <div id="ai-new-body"></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="ai-new-cancel">Cancelar</button>
        <button type="button" class="btn btn-primary" id="ai-new-generate">✨ Crear viaje</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#ai-new-cancel").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#ai-new-generate").addEventListener("click", async () => {
    const destination = overlay.querySelector("#ai-new-destination").value.trim();
    const startDate = overlay.querySelector("#ai-new-start").value;
    const endDate = overlay.querySelector("#ai-new-end").value;
    const budgetRaw = overlay.querySelector("#ai-new-budget").value;
    const interests = overlay.querySelector("#ai-new-interests").value.trim();

    if (!destination) {
      toast("Escribe un destino");
      return;
    }
    if (!startDate || !endDate) {
      toast("Elige fecha de inicio y de fin");
      return;
    }
    const totalDays = (daysBetween(startDate, endDate) || 0) + 1;
    if (totalDays < 1) {
      toast("La fecha de fin debe ser posterior a la de inicio");
      return;
    }

    const body = overlay.querySelector("#ai-new-body");
    const genBtn = overlay.querySelector("#ai-new-generate");
    genBtn.disabled = true;
    body.innerHTML = aiLoadingHtml("Diseñando tu viaje…");

    const budget = budgetRaw ? parseFloat(budgetRaw) : null;
    const result = await requestItinerary({
      mode: "full",
      destination,
      startDate,
      endDate,
      days: totalDays,
      budget,
      currency: "EUR",
      interests,
    });

    genBtn.disabled = false;
    if (!result) {
      body.innerHTML = "";
      return;
    }

    body.innerHTML = resultPreviewHtml(result);
    overlay.querySelector(".modal-actions").innerHTML = `
      <button type="button" class="btn btn-ghost" id="ai-new-discard">Descartar</button>
      <button type="button" class="btn btn-primary" id="ai-new-apply">✅ Crear viaje y aplicar</button>`;
    overlay.querySelector("#ai-new-discard").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#ai-new-apply").addEventListener("click", async () => {
      const tripId = await Data.add("trips", {
        name: destination,
        destination,
        start_date: startDate,
        end_date: endDate,
        budget,
      });
      await Data.addDefaultChecklistItems(tripId);
      let trip = await Data.get("trips", tripId);
      await applyDaysToItinerary(trip, result.days);
      trip = await saveAiPlanMeta(trip, result, { merge: false });
      overlay.remove();
      toast("Viaje creado con IA");
      goToTrip(tripId);
    });
  });
}

export {
  isAiCopilotConfigured,
  openAiPlannerSheet,
  openAiDayRegenerateSheet,
  openAiNewTripSheet,
  isAiCopilotMockEnabled,
  setAiCopilotMockEnabled,
  getAiCopilotMockUrl,
  setAiCopilotMockUrl,
};
