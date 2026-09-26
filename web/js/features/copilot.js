// ============================================================
// copilot.js — Copiloto de viajes con IA (versión web).
//
// Reimplementa js/ai-copilot.js (que no se puede importar porque
// importa js/app.js): misma Cloud Function (ai-copilot-config.js),
// mismo cuerpo de petición, mismo token (getIdToken), mismo análisis
// de la respuesta y misma forma de guardar las actividades en
// "itinerary" y el plan en trip.ai_plan. Siempre con vista previa y
// "Aplicar" antes de guardar, como la app.
//
//   openCopilot(trip, ctx)  → planificar todo el viaje o regenerar un día
//   openNewTripAI(ctx)      → crear un viaje nuevo desde cero con IA
// ============================================================

import { AI_COPILOT_ENDPOINT } from "../../../js/ai-copilot-config.js";
import { getIdToken } from "../../../js/cloud.js";
import { Data } from "../../../js/db.js";
import { escapeHtml, formatDatePretty, money, daysBetween } from "../../../js/utils.js";
import {
  PAID_QUERY_LIMIT,
  hasProAccess,
  checkPaidQueryLimit,
  bumpPaidQueryCount,
  syncPaidQueryLimitReached,
  remainingPaidQueries,
  openRegisterInviteSheet,
} from "./paid-limit.js";

let toast = (msg) => console.info(msg);

// ------------------------------------------------------------
// Mock de desarrollo de la app (Ajustes → Modo desarrollador). Solo
// se LEE aquí, porque cambia la URL a la que se llama y hace que no
// se gaste cupo. Mismas claves de localStorage que js/ai-copilot.js.
// ------------------------------------------------------------
const AI_COPILOT_MOCK_KEY = "ai_copilot_use_mock_DEV";
const AI_COPILOT_MOCK_URL_KEY = "ai_copilot_mock_url_DEV";
const AI_COPILOT_MOCK_URL_DEFAULT = "http://localhost:8787/generateItinerary";

function lsGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}
function isAiCopilotMockEnabled() {
  return lsGet(AI_COPILOT_MOCK_KEY) === "1";
}
function getAiCopilotMockUrl() {
  return lsGet(AI_COPILOT_MOCK_URL_KEY) || AI_COPILOT_MOCK_URL_DEFAULT;
}
function normalizeMockUrl(url) {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return AI_COPILOT_MOCK_URL_DEFAULT;
  return trimmed.endsWith("/generateItinerary") ? trimmed : `${trimmed}/generateItinerary`;
}
function isAiCopilotConfigured() {
  return isAiCopilotMockEnabled() || !!AI_COPILOT_ENDPOINT;
}

async function checkAiCopilotAccess() {
  if (!isAiCopilotConfigured()) {
    toast("El Copiloto IA todavía no está desplegado en esta app (ver docs/DEPLOY_AI_COPILOT.md)");
    return false;
  }
  if (!(await hasProAccess())) {
    openRegisterInviteSheet("El Copiloto de viajes con IA requiere tener una cuenta.");
    return false;
  }
  if (
    !isAiCopilotMockEnabled() &&
    !(await checkPaidQueryLimit("ai", `Ya usaste tus ${PAID_QUERY_LIMIT} usos gratis de hoy del Copiloto de viajes con IA.`))
  ) {
    return false;
  }
  return true;
}

// Igual que requestItinerary() de la app: devuelve el JSON o null (tras avisar).
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
    if (res.status === 429 || data.error === "LIMIT_REACHED") {
      await syncPaidQueryLimitReached("ai", "Ya usaste tus consultas gratis de hoy del Copiloto de viajes con IA.");
      return null;
    }
    if (!res.ok || !data.ok) {
      toast(data.error || "El Copiloto IA no ha podido generar el plan.");
      return null;
    }
    if (!useMock) await bumpPaidQueryCount("ai");
    return data;
  } catch (err) {
    toast("Sin conexión con el Copiloto IA.");
    return null;
  }
}

// ------------------------------------------------------------
// Guardado — idéntico a saveAiPlanMeta / applyDaysToItinerary.
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

// ------------------------------------------------------------
// Vista previa
// ------------------------------------------------------------
function loadingHtml(text) {
  return `<div class="cf-loading" role="status"><span class="cf-spinner" aria-hidden="true"></span><p>${escapeHtml(text)}</p></div>`;
}

function dayPreviewHtml(day, i) {
  const items = (day.items || [])
    .map(
      (it) => `
      <div class="cf-item">
        <span class="cf-item-time mono">${escapeHtml(it.time || "")}</span>
        <div class="cf-item-body">
          <p class="cf-item-title">${escapeHtml(it.title || "")}</p>
          ${it.location ? `<p class="cf-item-sub">📍 ${escapeHtml(it.location)}</p>` : ""}
          ${it.notes ? `<p class="cf-item-sub">${escapeHtml(it.notes)}</p>` : ""}
        </div>
        ${it.estCost ? `<span class="cf-item-cost mono">${money(it.estCost)}</span>` : ""}
      </div>`
    )
    .join("");
  const restaurants = (day.restaurants || [])
    .map((r) => `<span class="cf-tag">🍽️ ${escapeHtml(r.name)}${r.priceRange ? ` · ${escapeHtml(r.priceRange)}` : ""}</span>`)
    .join("");
  return `
    <div class="cf-card">
      <h3>Día ${escapeHtml(day.dayNumber || i + 1)} · ${escapeHtml(formatDatePretty(day.date))}</h3>
      ${day.title ? `<p class="cf-card-sub">${escapeHtml(day.title)}</p>` : ""}
      ${items || `<p class="muted small">Sin actividades.</p>`}
      ${restaurants ? `<div class="cf-tags">${restaurants}</div>` : ""}
    </div>`;
}

function resultPreviewHtml(result) {
  const b = result.budgetEstimate;
  const budgetHtml = b
    ? `<div class="cf-card">
        <h3>Presupuesto estimado</h3>
        <p class="cf-total mono">${money(b.total || 0)}</p>
        <div class="cf-budget">
          ${b.flights ? `<span>✈️ Vuelos: ${money(b.flights)}</span>` : ""}
          ${b.hotels ? `<span>🏨 Hoteles: ${money(b.hotels)}</span>` : ""}
          ${b.food ? `<span>🍽️ Comida: ${money(b.food)}</span>` : ""}
          ${b.transport ? `<span>🚗 Transporte: ${money(b.transport)}</span>` : ""}
          ${b.activities ? `<span>🎟️ Actividades: ${money(b.activities)}</span>` : ""}
        </div>
      </div>`
    : "";
  return `
    ${result.summary ? `<p class="cf-summary">${escapeHtml(result.summary)}</p>` : ""}
    ${budgetHtml}
    ${result.transportTips ? `<div class="cf-card"><h3>Consejos de transporte</h3><p class="cf-text">${escapeHtml(result.transportTips)}</p></div>` : ""}
    ${(result.days || []).map((d, i) => dayPreviewHtml(d, i)).join("")}`;
}

function validResult(result) {
  if (result && Array.isArray(result.days)) return true;
  toast("El Copiloto IA no ha podido generar el plan.");
  return false;
}

async function quotaNote() {
  if (isAiCopilotMockEnabled()) return "Modo de pruebas (mock): no gasta usos.";
  const left = await remainingPaidQueries("ai");
  return `Te queda${left === 1 ? "" : "n"} ${left} de ${PAID_QUERY_LIMIT} usos gratis hoy.`;
}

function tripDayCount(trip) {
  return trip.start_date && trip.end_date ? (daysBetween(trip.start_date, trip.end_date) || 0) + 1 : null;
}

// ============================================================
// openCopilot — "Todo el viaje" (openAiPlannerSheet) o "Un día"
// (openAiDayRegenerateSheet), elegido con un selector de modo.
// ============================================================
async function openCopilot(trip, ctx) {
  if (ctx?.toast) toast = ctx.toast;
  if (!(await checkAiCopilotAccess())) return;

  // Días que se pueden regenerar: en la app son las fichas de día del
  // itinerario (fechas con actividades), y el número de día es su
  // posición en esa lista (dayIndex en sections.js).
  const items = await Data.getAllByTrip("itinerary", trip.id);
  const dates = [...new Set(items.filter((i) => i.date).map((i) => i.date))].sort();
  const totalDays = tripDayCount(trip);
  const note = await quotaNote();

  const html = `
    <div class="cf-modes" role="tablist" aria-label="Qué quieres hacer">
      <button class="chip-btn" type="button" role="tab" data-mode="full" aria-pressed="true">✨ Todo el viaje</button>
      <button class="chip-btn" type="button" role="tab" data-mode="day" aria-pressed="false" ${dates.length ? "" : "disabled title=\"Aún no hay días con actividades\""}>🔄 Regenerar un día</button>
    </div>
    <p class="muted small cf-meta">
      ${escapeHtml(trip.destination || trip.name)} ·
      ${totalDays ? `${totalDays} día${totalDays === 1 ? "" : "s"}` : "duración sin definir"}
      ${trip.budget ? ` · presupuesto ${money(trip.budget)}` : ""}
    </p>
    <div class="cf-form">
      <label class="field cf-day" hidden>
        <span class="label">Día</span>
        <select id="cf-day-select">${dates
          .map((d, i) => `<option value="${d}">Día ${i + 1} · ${escapeHtml(formatDatePretty(d))}</option>`)
          .join("")}</select>
      </label>
      <label class="field">
        <span class="label" id="cf-text-label">¿Qué te gustaría en este viaje?</span>
        <textarea id="cf-text" rows="3" placeholder="Ej. me gusta la comida local, la tecnología y los templos, ritmo tranquilo por las mañanas..."></textarea>
      </label>
      <p class="muted small cf-warn" id="cf-warn"></p>
    </div>
    <div id="cf-body"></div>
    <div class="cf-actions">
      <span class="muted small cf-quota">${escapeHtml(note)}</span>
      <div class="cf-actions-r">
        <button class="btn btn-secondary btn-sm" type="button" data-cancel>Cancelar</button>
        <button class="btn btn-primary btn-sm" type="button" data-generate>✨ Generar itinerario</button>
      </div>
    </div>`;

  ctx.openSheet({
    title: "Copiloto IA",
    wide: true,
    html,
    onMount(root, close) {
      let mode = "full";
      let result = null;
      const $ = (s) => root.querySelector(s);
      const body = $("#cf-body");
      const form = $(".cf-form");
      const actionsR = $(".cf-actions-r");

      function setMode(m) {
        mode = m;
        result = null;
        body.innerHTML = "";
        form.hidden = false;
        root.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
        $(".cf-day").hidden = m !== "day";
        const label = $("#cf-text-label");
        const ta = $("#cf-text");
        if (m === "day") {
          label.textContent = "¿Algo concreto para este día? (opcional)";
          ta.placeholder = "Ej. quiero algo más tranquilo, o céntralo en museos...";
          ta.rows = 2;
        } else {
          label.textContent = "¿Qué te gustaría en este viaje?";
          ta.placeholder = "Ej. me gusta la comida local, la tecnología y los templos, ritmo tranquilo por las mañanas...";
          ta.rows = 3;
        }
        $("#cf-warn").textContent =
          m === "full" && (!totalDays || totalDays < 1) ? "Antes pon fecha de inicio y fin del viaje (editar viaje)." : "";
        renderGenerateActions();
      }

      function renderGenerateActions() {
        actionsR.innerHTML = `
          <button class="btn btn-secondary btn-sm" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary btn-sm" type="button" data-generate>${mode === "day" ? "🔄 Regenerar este día" : "✨ Generar itinerario"}</button>`;
        actionsR.querySelector("[data-cancel]").addEventListener("click", close);
        actionsR.querySelector("[data-generate]").addEventListener("click", generate);
      }

      function renderApplyActions() {
        actionsR.innerHTML = `
          <button class="btn btn-secondary btn-sm" type="button" data-discard>Descartar</button>
          <button class="btn btn-primary btn-sm" type="button" data-apply>✅ ${mode === "day" ? "Aplicar este día" : "Aplicar al itinerario"}</button>`;
        actionsR.querySelector("[data-discard]").addEventListener("click", close);
        actionsR.querySelector("[data-apply]").addEventListener("click", apply);
      }

      async function generate() {
        const text = $("#cf-text").value.trim();
        let payload;
        if (mode === "full") {
          if (!totalDays || totalDays < 1) {
            toast("Antes pon fecha de inicio y fin del viaje (editar viaje)");
            return;
          }
          payload = {
            mode: "full",
            destination: trip.destination || trip.name,
            startDate: trip.start_date,
            endDate: trip.end_date,
            days: totalDays,
            budget: trip.budget || null,
            currency: "EUR",
            interests: text,
          };
        } else {
          const dateStr = $("#cf-day-select").value;
          const dayIndex = dates.indexOf(dateStr) + 1;
          const fresh = (await Data.get("trips", trip.id)) || trip;
          const allDays = fresh.ai_plan?.byDate
            ? Object.entries(fresh.ai_plan.byDate)
                .filter(([d]) => d !== dateStr)
                .map(([d, meta]) => ({ date: d, dayNumber: meta.dayNumber, title: meta.title }))
            : [];
          payload = {
            mode: "day",
            destination: trip.destination || trip.name,
            targetDate: dateStr,
            dayNumber: dayIndex || null,
            budget: trip.budget || null,
            currency: "EUR",
            interests: "",
            instructions: text,
            context: allDays,
          };
        }
        const genBtn = actionsR.querySelector("[data-generate]");
        genBtn.disabled = true;
        root.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = true));
        body.innerHTML = loadingHtml(mode === "day" ? "Rehaciendo este día…" : "Diseñando tu itinerario…");

        const res = await requestItinerary(payload);
        if (!root.isConnected) return;
        genBtn.disabled = false;
        root.querySelectorAll("[data-mode]").forEach((b) => (b.disabled = b.dataset.mode === "day" && !dates.length));
        $(".cf-quota").textContent = await quotaNote();
        if (!res || !validResult(res)) {
          body.innerHTML = "";
          return;
        }
        result = res;
        form.hidden = true;
        body.innerHTML = `<div class="cf-preview">${resultPreviewHtml(result)}</div>`;
        renderApplyActions();
      }

      async function apply() {
        if (!result) return;
        if (mode === "full") {
          const ok = await ctx.confirmBox(
            "Esto reemplazará las actividades ya guardadas en las fechas del viaje generadas por la IA. ¿Continuar?",
            "Continuar"
          );
          if (!ok) return;
        }
        const btn = actionsR.querySelector("[data-apply]");
        if (btn) btn.disabled = true;
        const fresh = (await Data.get("trips", trip.id)) || trip;
        await applyDaysToItinerary(fresh, result.days);
        await saveAiPlanMeta(fresh, result, { merge: mode === "day" });
        close();
        toast(mode === "day" ? "Día regenerado" : "Itinerario generado y aplicado");
        if (ctx.state?.view === "trip" && ctx.state?.tripId === trip.id) ctx.go("trip", trip.id, "itinerary");
        ctx.render();
      }

      root.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => !b.disabled && setMode(b.dataset.mode)));
      setMode("full");
    },
  });
}

// ============================================================
// openNewTripAI — openAiNewTripSheet: crea el viaje y le aplica el
// itinerario generado.
// ============================================================
async function openNewTripAI(ctx) {
  if (ctx?.toast) toast = ctx.toast;
  if (!(await checkAiCopilotAccess())) return;
  const note = await quotaNote();

  ctx.openSheet({
    title: "Planificar viaje con IA",
    wide: true,
    html: `
      <p class="muted small cf-meta">Dinos destino, fechas y qué te apetece: la IA crea el viaje y te arma el itinerario día a día.</p>
      <div class="cf-form cf-grid">
        <label class="field full"><span class="label">Destino</span><input type="text" id="cf-new-destination" placeholder="Ej. Roma, Italia" /></label>
        <label class="field"><span class="label">Fecha de inicio</span><input type="date" id="cf-new-start" /></label>
        <label class="field"><span class="label">Fecha de fin</span><input type="date" id="cf-new-end" /></label>
        <label class="field full"><span class="label">Presupuesto (€) — opcional</span><input type="number" step="0.01" id="cf-new-budget" placeholder="Ej. 800" /></label>
        <label class="field full"><span class="label">¿Qué te gustaría en este viaje?</span><textarea id="cf-new-interests" rows="3" placeholder="Ej. comida local, arte, ritmo tranquilo por las mañanas..."></textarea></label>
      </div>
      <div id="cf-body"></div>
      <div class="cf-actions">
        <span class="muted small cf-quota">${escapeHtml(note)}</span>
        <div class="cf-actions-r">
          <button class="btn btn-secondary btn-sm" type="button" data-cancel>Cancelar</button>
          <button class="btn btn-primary btn-sm" type="button" data-generate>✨ Crear viaje</button>
        </div>
      </div>`,
    onMount(root, close) {
      const $ = (s) => root.querySelector(s);
      const body = $("#cf-body");
      const actionsR = $(".cf-actions-r");
      $("[data-cancel]").addEventListener("click", close);
      $("#cf-new-start").addEventListener("change", (e) => {
        const end = $("#cf-new-end");
        if (!end.value || end.value < e.target.value) end.value = e.target.value;
      });

      $("[data-generate]").addEventListener("click", async () => {
        const destination = $("#cf-new-destination").value.trim();
        const startDate = $("#cf-new-start").value;
        const endDate = $("#cf-new-end").value;
        const budgetRaw = $("#cf-new-budget").value;
        const interests = $("#cf-new-interests").value.trim();
        if (!destination) return toast("Escribe un destino");
        if (!startDate || !endDate) return toast("Elige fecha de inicio y de fin");
        const totalDays = (daysBetween(startDate, endDate) || 0) + 1;
        if (totalDays < 1) return toast("La fecha de fin debe ser posterior a la de inicio");

        const genBtn = $("[data-generate]");
        genBtn.disabled = true;
        body.innerHTML = loadingHtml("Diseñando tu viaje…");
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
        if (!root.isConnected) return;
        genBtn.disabled = false;
        $(".cf-quota").textContent = await quotaNote();
        if (!result || !validResult(result)) {
          body.innerHTML = "";
          return;
        }
        $(".cf-form").hidden = true;
        body.innerHTML = `<div class="cf-preview">${resultPreviewHtml(result)}</div>`;
        actionsR.innerHTML = `
          <button class="btn btn-secondary btn-sm" type="button" data-discard>Descartar</button>
          <button class="btn btn-primary btn-sm" type="button" data-apply>✅ Crear viaje y aplicar</button>`;
        actionsR.querySelector("[data-discard]").addEventListener("click", close);
        actionsR.querySelector("[data-apply]").addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          const tripId = await Data.add("trips", { name: destination, destination, start_date: startDate, end_date: endDate, budget });
          await Data.addDefaultChecklistItems(tripId);
          let trip = await Data.get("trips", tripId);
          await applyDaysToItinerary(trip, result.days);
          trip = await saveAiPlanMeta(trip, result, { merge: false });
          close();
          toast("Viaje creado con IA");
          ctx.go("trip", tripId);
        });
      });
    },
  });
}

export { openCopilot, openNewTripAI, isAiCopilotConfigured };
