// ============================================================
// paid-limit.js — Límite diario de consultas de pago (Copiloto IA y
// estado de vuelos) y acceso a funciones con cuenta, para la web.
//
// Copia fiel de js/app.js (hasProAccess, PAID_QUERY_LIMIT,
// paidQueryCountKey, checkPaidQueryLimit, bumpPaidQueryCount,
// syncPaidQueryLimitReached, openPaidQueryLimitSheet y
// openRegisterInviteSheet). Usa las MISMAS claves de ajustes
// (Data.settingGet/Set) que la app, así la web y la app comparten el
// contador del día. El tope real lo impone el servidor; esto es solo
// el espejo local para no hacer llamadas que ya sabemos que fallarán.
// ============================================================

import { Data } from "../../../js/db.js";
import { currentUser } from "../../../js/cloud.js";
import { isPro } from "../../../js/pro.js";
import { escapeHtml, todayString } from "../../../js/utils.js";

const PAID_QUERY_LIMIT = 2;

async function hasProAccess() {
  return !!currentUser() || (await isPro());
}

function paidQueryCountKey(feature) {
  const uid = currentUser()?.uid || "anon";
  return `paid_query_count_${feature}_${uid}_${todayString()}`;
}

async function getPaidQueryCount(feature) {
  const raw = await Data.settingGet(paidQueryCountKey(feature));
  return typeof raw === "number" ? raw : 0;
}

async function remainingPaidQueries(feature) {
  return Math.max(0, PAID_QUERY_LIMIT - (await getPaidQueryCount(feature)));
}

async function bumpPaidQueryCount(feature) {
  const count = (await getPaidQueryCount(feature)) + 1;
  await Data.settingSet(paidQueryCountKey(feature), count);
  return count;
}

/** El servidor ha rechazado la llamada por cupo agotado: pone el espejo local al día. */
async function markPaidQueryLimitReached(feature) {
  await Data.settingSet(paidQueryCountKey(feature), PAID_QUERY_LIMIT);
}

/** Igual que markPaidQueryLimitReached, pero además muestra el aviso. */
async function syncPaidQueryLimitReached(feature, reasonText) {
  await markPaidQueryLimitReached(feature);
  openPaidQueryLimitSheet(reasonText);
}

// Ventana con el mismo marcado que openSheet() de web/js/app.js, para
// no depender de ctx (las firmas quedan idénticas a las de la app).
function miniSheet(title, html, onMount) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `
    <div class="modal sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}" style="max-width:480px">
      <div class="sheet-head"><h2>${escapeHtml(title)}</h2><button class="icon-btn" type="button" data-close aria-label="Cerrar">✕</button></div>
      <div class="sheet-body">${html}</div>
    </div>`;
  const onKey = (e) => e.key === "Escape" && close();
  function close() {
    if (!back.isConnected) return;
    back.remove();
    document.removeEventListener("keydown", onKey);
  }
  document.addEventListener("keydown", onKey);
  back.addEventListener("click", (e) => e.target === back && close());
  back.querySelector("[data-close]").addEventListener("click", close);
  document.body.appendChild(back);
  onMount?.(back.querySelector(".sheet-body"), close);
  return close;
}

function openPaidQueryLimitSheet(reasonText) {
  miniSheet(
    "Límite diario alcanzado",
    `<p class="muted pl-text">${escapeHtml(reasonText || `Ya usaste tus ${PAID_QUERY_LIMIT} consultas gratis de hoy para esta función.`)}</p>
     <p class="muted pl-text">Muy pronto podrás tener consultas ilimitadas con una suscripción.</p>
     <div class="pl-actions"><button class="btn btn-primary" type="button" id="paid-limit-close">Entendido</button></div>`,
    (root, close) => root.querySelector("#paid-limit-close").addEventListener("click", close)
  );
}

/** Si ya no quedan consultas gratis para `feature` ("ai" o "flight"),
 * muestra el aviso y devuelve false. No consume ninguna consulta. */
async function checkPaidQueryLimit(feature, reasonText) {
  const count = await getPaidQueryCount(feature);
  if (count >= PAID_QUERY_LIMIT) {
    openPaidQueryLimitSheet(reasonText);
    return false;
  }
  return true;
}

const ACCOUNT_FEATURES_LIST = [
  "Viajes ilimitados (el plan gratis permite hasta 2 a la vez)",
  "Compartir viajes con código o QR",
  `Copiloto de viajes con IA (${PAID_QUERY_LIMIT} usos gratis al día)`,
  `Avisos de estado de vuelo (${PAID_QUERY_LIMIT} usos gratis al día)`,
  "Ordenar la ruta del mapa por cercanía",
  "Conversor de moneda",
  "Guardar el mapa y el itinerario en PDF",
];

// En la web siempre hay sesión, así que esto casi nunca se ve; se
// mantiene por paridad con la app. "Crear cuenta" vuelve a la
// pantalla de acceso (recargando, que la muestra si no hay sesión).
function openRegisterInviteSheet(reasonText) {
  miniSheet(
    "Regístrate para usar esta función",
    `${reasonText ? `<p class="muted pl-text">${escapeHtml(reasonText)}</p>` : ""}
     <p class="muted pl-text small">Estas son algunas de las funciones que se desbloquean al registrarte:</p>
     <ul class="pl-list">${ACCOUNT_FEATURES_LIST.map((f) => `<li><span aria-hidden="true">✓</span>${escapeHtml(f)}</li>`).join("")}</ul>
     <div class="pl-actions">
       <button class="btn btn-ghost" type="button" id="register-invite-close">Ahora no</button>
       <button class="btn btn-primary" type="button" id="register-invite-cta">Crear cuenta / Iniciar sesión</button>
     </div>`,
    (root, close) => {
      root.querySelector("#register-invite-close").addEventListener("click", close);
      root.querySelector("#register-invite-cta").addEventListener("click", () => {
        close();
        location.reload();
      });
    }
  );
}

export {
  PAID_QUERY_LIMIT,
  ACCOUNT_FEATURES_LIST,
  hasProAccess,
  paidQueryCountKey,
  getPaidQueryCount,
  remainingPaidQueries,
  bumpPaidQueryCount,
  markPaidQueryLimitReached,
  syncPaidQueryLimitReached,
  openPaidQueryLimitSheet,
  checkPaidQueryLimit,
  openRegisterInviteSheet,
};
