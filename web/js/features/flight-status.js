// ============================================================
// flight-status.js — Estado en vivo de un vuelo (retraso, puerta,
// terminal) en la web.
//
// En la app, el estado en vivo solo aparece dentro del aviso de 24 h
// antes del vuelo (checkAndNotifyToday en js/app.js), usando
// getFlightStatus() de js/flightstatus.js, la función "flight" del
// límite diario y la caché "flight_status_query_cache" (por id de
// vuelo). Aquí se consulta bajo demanda con las mismas piezas:
// misma Cloud Function, mismo token, mismo cupo ("flight") y misma
// caché, que solo se escribe dentro de esas 24 h previas (igual que
// la app), para que el aviso de la app reutilice el dato sin gastar
// otra consulta y nunca se quede con un "sin datos" demasiado viejo.
// ============================================================

import { getFlightStatus, isFlightStatusConfigured } from "../../../js/flightstatus.js";
import { getIdToken } from "../../../js/cloud.js";
import { Data } from "../../../js/db.js";
import { escapeHtml, formatDatePretty } from "../../../js/utils.js";
import {
  PAID_QUERY_LIMIT,
  hasProAccess,
  checkPaidQueryLimit,
  bumpPaidQueryCount,
  syncPaidQueryLimitReached,
  remainingPaidQueries,
  openRegisterInviteSheet,
} from "./paid-limit.js";

const FEATURE = "flight";
const FLIGHT_STATUS_CACHE_KEY = "flight_status_query_cache";
const FLIGHT_LEAD_HOURS = 24;

// Mismo cálculo que combineDateTime/isWithinLead de la app (hora por defecto 09:00).
function combineDateTime(dateStr, timeStr, fallbackHour) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  let hh = fallbackHour;
  let mm = 0;
  if (timeStr) {
    const [h2, m2] = timeStr.split(":").map(Number);
    if (!isNaN(h2)) {
      hh = h2;
      mm = isNaN(m2) ? 0 : m2;
    }
  }
  return new Date(y, m - 1, d, hh, mm, 0);
}
function isWithinLead(target, leadHours) {
  if (!target) return false;
  const diffMs = target.getTime() - Date.now();
  return diffMs > 0 && diffMs <= leadHours * 60 * 60 * 1000;
}

async function readCache() {
  const raw = await Data.settingGet(FLIGHT_STATUS_CACHE_KEY);
  return raw && typeof raw === "object" ? raw : {};
}

// Estados de AeroDataBox → texto en español.
const STATUS_LABELS = {
  Unknown: ["Desconocido", "neutral"],
  Expected: ["Previsto", "ok"],
  EnRoute: ["En vuelo", "ok"],
  CheckIn: ["Facturación abierta", "ok"],
  Boarding: ["Embarcando", "ok"],
  GateClosed: ["Puerta cerrada", "warn"],
  Departed: ["Ha despegado", "ok"],
  Delayed: ["Retrasado", "warn"],
  Approaching: ["Aproximándose", "ok"],
  Arrived: ["Ha aterrizado", "ok"],
  Canceled: ["Cancelado", "bad"],
  Cancelled: ["Cancelado", "bad"],
  Diverted: ["Desviado", "bad"],
  CanceledUncertain: ["Posiblemente cancelado", "bad"],
};

function statusHtml(info) {
  if (!info) {
    return `<div class="cf-fs-empty"><p><b>No hay datos en vivo para este vuelo.</b></p><p class="muted small">Puede que aún falte mucho para la salida, que el número de vuelo no sea correcto o que el servicio no lo tenga. Suele haber datos el mismo día del vuelo.</p></div>`;
  }
  const [label, tone] = STATUS_LABELS[info.status] || [info.status || "Sin estado", "neutral"];
  const delay = info.delayMin > 0 ? `${info.delayMin} min` : "Sin retraso";
  return `
    <div class="cf-fs-status cf-tone-${tone}"><span class="label">Estado</span><strong>${escapeHtml(label)}</strong></div>
    <div class="cf-fs-grid">
      <div><span class="label">Retraso</span><b class="${info.delayMin > 0 ? "cf-warn-ink" : ""}">${escapeHtml(delay)}</b></div>
      <div><span class="label">Puerta</span><b>${escapeHtml(info.gate || "—")}</b></div>
      <div><span class="label">Terminal</span><b>${escapeHtml(info.terminal || "—")}</b></div>
    </div>`;
}

async function openFlightStatus(flight, ctx) {
  const toast = ctx?.toast || ((m) => console.info(m));
  if (!isFlightStatusConfigured()) {
    toast("El estado de vuelos todavía no está desplegado en esta app (ver docs/DEPLOY_FLIGHT_STATUS.md)");
    return;
  }
  if (!(await hasProAccess())) {
    openRegisterInviteSheet("Los avisos de estado de vuelo requieren tener una cuenta.");
    return;
  }
  if (!flight.flight_number || !flight.date) {
    toast("Añade el número y la fecha del vuelo para ver su estado");
    return;
  }

  const cache = await readCache();
  const cacheKey = String(flight.id);
  const hasCached = cacheKey in cache;
  const route = [flight.origin, flight.destination].filter(Boolean).join(" → ");
  const quota = async () => {
    const left = await remainingPaidQueries(FEATURE);
    return `Te queda${left === 1 ? "" : "n"} ${left} de ${PAID_QUERY_LIMIT} consultas gratis hoy.`;
  };

  ctx.openSheet({
    title: "Estado del vuelo",
    html: `
      <div class="cf-fs-head">
        <span class="mono cf-fs-num">${escapeHtml(flight.flight_number)}</span>
        <div>
          <p class="cf-fs-route">${escapeHtml(route || flight.airline || "Vuelo")}</p>
          <p class="muted small">${escapeHtml([flight.airline, formatDatePretty(flight.date), flight.time].filter(Boolean).join(" · "))}</p>
        </div>
      </div>
      <div id="cf-fs-body">${
        hasCached
          ? `${statusHtml(cache[cacheKey])}<p class="muted small cf-fs-note">Último dato guardado en el aviso de 24 h. Puedes consultarlo de nuevo.</p>`
          : `<p class="muted cf-fs-intro">Consulta el estado en vivo: retraso, puerta de embarque y terminal. Cada consulta gasta uno de tus ${PAID_QUERY_LIMIT} usos gratis del día.</p>`
      }</div>
      <div class="cf-actions">
        <span class="muted small cf-quota">${escapeHtml(await quota())}</span>
        <div class="cf-actions-r">
          <button class="btn btn-secondary btn-sm" type="button" data-cancel>Cerrar</button>
          <button class="btn btn-primary btn-sm" type="button" data-check>${hasCached ? "Consultar de nuevo" : "Consultar estado"}</button>
        </div>
      </div>`,
    onMount(root, close) {
      const body = root.querySelector("#cf-fs-body");
      const btn = root.querySelector("[data-check]");
      root.querySelector("[data-cancel]").addEventListener("click", close);
      btn.addEventListener("click", async () => {
        if (!(await checkPaidQueryLimit(FEATURE, `Ya usaste tus ${PAID_QUERY_LIMIT} usos gratis de hoy de los avisos de estado de vuelo.`))) return;
        const idToken = await getIdToken();
        if (!idToken) {
          toast("Inicia sesión en Ajustes → Mi cuenta para ver el estado del vuelo");
          return;
        }
        btn.disabled = true;
        body.innerHTML = `<div class="cf-loading" role="status"><span class="cf-spinner" aria-hidden="true"></span><p>Consultando el vuelo…</p></div>`;
        const info = await getFlightStatus(flight.flight_number, flight.date, idToken);
        if (info && info.limitReached) {
          await syncPaidQueryLimitReached(FEATURE, "Ya usaste tus consultas gratis de hoy de los avisos de estado de vuelo.");
          if (root.isConnected) {
            body.innerHTML = "";
            btn.disabled = false;
            root.querySelector(".cf-quota").textContent = await quota();
          }
          return;
        }
        // Como la app: la consulta cuenta aunque no haya datos.
        await bumpPaidQueryCount(FEATURE);
        if (isWithinLead(combineDateTime(flight.date, flight.time, 9), FLIGHT_LEAD_HOURS)) {
          const fresh = await readCache();
          fresh[cacheKey] = info || null;
          await Data.settingSet(FLIGHT_STATUS_CACHE_KEY, fresh);
        }
        if (!root.isConnected) return;
        const now = new Date();
        body.innerHTML = `${statusHtml(info)}<p class="muted small cf-fs-note">Consultado a las ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}.</p>`;
        btn.disabled = false;
        btn.textContent = "Consultar de nuevo";
        root.querySelector(".cf-quota").textContent = await quota();
      });
    },
  });
}

export { openFlightStatus };
