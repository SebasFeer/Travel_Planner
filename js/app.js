import { Data, DEFAULT_CHECKLIST_ITEMS } from "./db.js";
import {
  money,
  todayString,
  escapeHtml,
  formatDatePretty,
  daysBetween,
  daysUntil,
  mapsQueryUrl,
  mapsRouteUrl,
  download,
} from "./utils.js";
import { isPinSet, setPin, removePin, verifyPin, isBiometricAvailable, isBiometricEnabled, enableBiometric, disableBiometric } from "./lock.js";
import {
  currentUser,
  onAuthChange,
  signUp,
  signIn,
  signInWithGoogle,
  signOutUser,
  pushToCloud,
  pullFromCloud,
  cloudHasBackup,
  saveBirthDate,
  getBirthDate,
  shareTrip,
  joinSharedTrip,
  refreshSharedTrip,
  getIdToken,
} from "./cloud.js";
import { isPro, setPro } from "./pro.js";
// TEMPORAL — interruptor de mock local del Copiloto IA, ver ai-copilot.js
import {
  isAiCopilotMockEnabled,
  setAiCopilotMockEnabled,
  getAiCopilotMockUrl,
  setAiCopilotMockUrl,
  openAiNewTripSheet,
} from "./ai-copilot.js";
import { getFlightStatus, isFlightStatusConfigured } from "./flightstatus.js";
import { renderSection, renderPrintArea, exportItineraryPdf, exportTripToIcs, openCurrencyConverterSheet } from "./sections.js";
import { findDestinationPhoto } from "./photo.js";
import { icon, brandMark, googleIcon } from "./icons.js";
import { geocode, searchPlaces as searchPlaceSuggestions } from "./geocode.js";
import { LANGUAGES, getLanguage, setLanguage, t } from "./i18n.js";
import { nearbyAttractions, nearbyLodging, searchPlaces } from "./discover.js";

// ============================================================
// ESTADO
// ============================================================

const state = {
  tripId: null,     // null = pantalla de inicio (lista de viajes)
  section: "dashboard",
};

const root = document.getElementById("app");

// ============================================================
// UTILIDADES DE RENDER
// ============================================================

function h(strings, ...values) {
  return strings.reduce(
    (acc, s, i) => acc + s + (values[i] !== undefined ? values[i] : ""),
    ""
  );
}

function toast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }, 2200);
}

async function refresh() {
  await renderApp();
}

// ============================================================
// SISTEMA DE MODALES / FORMULARIOS GENÉRICOS
// ============================================================

function fieldHtml(f, initial) {
  const value = initial ? initial[f.name] : f.default ?? "";
  const id = `f_${f.name}`;

  if (f.type === "textarea") {
    return h`
      <div class="field">
        <label for="${id}">${escapeHtml(f.label)}</label>
        <textarea id="${id}" placeholder="${escapeHtml(f.placeholder || "")}">${escapeHtml(value)}</textarea>
      </div>`;
  }

  if (f.type === "select") {
    const opts = f.options
      .map(
        (o) =>
          `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`
      )
      .join("");
    return h`
      <div class="field">
        <label for="${id}">${escapeHtml(f.label)}</label>
        <select id="${id}">${opts}</select>
      </div>`;
  }

  if (f.type === "checkbox") {
    return h`
      <div class="field-check">
        <input type="checkbox" id="${id}" ${value ? "checked" : ""} />
        <label for="${id}" style="margin:0;">${escapeHtml(f.label)}</label>
      </div>`;
  }

  const inputType = f.type || "text";
  const step = f.type === "number" ? `step="${f.step || "0.01"}"` : "";

  return h`
    <div class="field">
      <label for="${id}">${escapeHtml(f.label)}</label>
      <input type="${inputType}" id="${id}" ${step}
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(f.placeholder || "")}" />
    </div>`;
}

function renderFieldsGrouped(fields, initial) {
  let out = "";
  let i = 0;
  while (i < fields.length) {
    const f = fields[i];
    if (f.half && fields[i + 1] && fields[i + 1].half) {
      out += `<div class="field-row">${fieldHtml(f, initial)}${fieldHtml(
        fields[i + 1],
        initial
      )}</div>`;
      i += 2;
    } else {
      out += fieldHtml(f, initial);
      i += 1;
    }
  }
  return out;
}

function readFieldValue(f) {
  const el = document.getElementById(`f_${f.name}`);
  if (!el) return undefined;
  if (f.type === "checkbox") return el.checked ? 1 : 0;
  if (f.type === "number") return parseFloat(el.value || "0") || 0;
  return el.value.trim();
}

/**
 * Muestra un formulario modal genérico.
 * fields: [{name,label,type,options,half,step,default,required}]
 * Devuelve una promesa; se resuelve al guardar (con los valores),
 * o queda pendiente si se cancela (no se resuelve nunca, no pasa nada).
 */
function showFormModal({ title, fields, initial, onSave, onDelete, deleteLabel, validate }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      <form id="modal-form">
        ${renderFieldsGrouped(fields, initial)}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel">${t("common_cancel")}</button>
          <button type="submit" class="btn btn-primary">${t("common_save")}</button>
        </div>
        ${
          onDelete
            ? `<div class="modal-actions"><button type="button" class="btn btn-danger" id="modal-delete">${escapeHtml(
                deleteLabel || t("common_delete")
              )}</button></div>`
            : ""
        }
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector("#modal-cancel").addEventListener("click", () => {
    overlay.remove();
  });

  if (onDelete) {
    overlay.querySelector("#modal-delete").addEventListener("click", async () => {
      if (confirm("¿Seguro que quieres eliminarlo? No se puede deshacer.")) {
        overlay.remove();
        await onDelete();
      }
    });
  }

  overlay.querySelector("#modal-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const values = {};
    for (const f of fields) {
      values[f.name] = readFieldValue(f);
    }
    for (const f of fields) {
      if (f.required && !values[f.name]) {
        toast(`Falta "${f.label}"`);
        return;
      }
    }
    if (validate) {
      const error = validate(values);
      if (error) {
        toast(error);
        return;
      }
    }
    overlay.remove();
    await onSave(values);
  });

  setTimeout(() => {
    const firstInput = overlay.querySelector("input, select, textarea");
    if (firstInput) firstInput.focus();
  }, 50);
}

// Pide un texto corto al usuario con una ventana propia de la app
// (en vez de window.prompt, que puede fallar al abrir la app desde
// la pantalla de inicio en iOS). Devuelve el texto o null si cancela.
function promptModal({ title, message, inputType = "text", inputMode }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = h`
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        ${message ? `<p style="color:var(--muted); font-size:13.5px; margin-top:-10px;">${escapeHtml(message)}</p>` : ""}
        <div class="field" style="margin-top:14px;">
          <input type="${inputType}" id="prompt-input" ${inputMode ? `inputmode="${inputMode}"` : ""} autocomplete="off" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="prompt-cancel">${t("common_cancel")}</button>
          <button type="button" class="btn btn-primary" id="prompt-ok">${t("common_accept")}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#prompt-input");
    setTimeout(() => input.focus(), 50);

    const finish = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.addEventListener("click", (e) => e.target === overlay && finish(null));
    overlay.querySelector("#prompt-cancel").addEventListener("click", () => finish(null));
    overlay.querySelector("#prompt-ok").addEventListener("click", () => finish(input.value));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") finish(input.value);
    });
  });
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = h`
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <p style="font-size:15px; line-height:1.6; margin:8px 0 20px;">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="confirm-cancel">${t("common_cancel")}</button>
          <button type="button" class="btn btn-primary" id="confirm-ok">${t("common_confirm")}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const finish = (result) => {
      overlay.remove();
      resolve(result);
    };

    overlay.addEventListener("click", (e) => e.target === overlay && finish(false));
    overlay.querySelector("#confirm-cancel").addEventListener("click", () => finish(false));
    overlay.querySelector("#confirm-ok").addEventListener("click", () => finish(true));
  });
}

// ============================================================
// SELECTOR DE APP DE MAPAS ("¿con qué app abrirlo?")
//
// Un sitio web (ni siquiera una PWA instalada) puede consultar qué
// apps hay instaladas en el dispositivo — el navegador no expone esa
// información a propósito, por privacidad. Lo más parecido que se
// puede hacer es justo esto: ofrecer las apps de mapas más usadas
// como opciones, cada una con el enlace propio de esa app (no el de
// Google Maps reescrito) — si está instalada, el sistema operativo
// la abre a ella directamente; si no, abre la versión web de esa
// misma app. Apple Maps solo se ofrece en iOS (en cualquier otro
// sistema ni siquiera tiene versión web que abrir).
// ============================================================

function buildMapsOptions(spec) {
  const isIOS = /iP(hone|ad|od)/i.test(navigator.userAgent);
  const isRoute = spec.type === "route";
  const destText = (isRoute ? spec.destination : spec.location) || "";
  if (!destText.trim()) return [];
  const destEncoded = encodeURIComponent(destText.trim());

  const googleUrl = isRoute ? mapsRouteUrl([spec.origin, spec.destination]) : mapsQueryUrl(spec.location);
  const options = [
    { id: "google", label: "Google Maps", url: googleUrl },
    // Waze/Apple Maps navegan desde la ubicación actual del
    // dispositivo hasta el destino (así funcionan siempre estas
    // apps) — solo Google Maps puede mostrar una ruta entre dos
    // puntos cualquiera sin depender del GPS.
    { id: "waze", label: "Waze", url: `https://waze.com/ul?q=${destEncoded}&navigate=yes` },
  ];
  if (isIOS) {
    const appleUrl = isRoute
      ? `https://maps.apple.com/?saddr=${encodeURIComponent(spec.origin || "")}&daddr=${destEncoded}`
      : `https://maps.apple.com/?q=${destEncoded}`;
    options.push({ id: "apple", label: "Mapas", url: appleUrl });
  }
  return options.filter((o) => o.url);
}

function openMapsAppPicker(spec) {
  const options = buildMapsOptions(spec);
  if (!options.length) {
    toast(spec.type === "route" ? "Falta origen o destino para trazar la ruta." : "Introduce primero un lugar.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">¿Con qué app quieres abrirlo?</h2>
      <div class="maps-app-list">
        ${options
          .map(
            (o, i) => `<button type="button" class="maps-app-option" data-i="${i}">
              <span class="maps-app-option-icon">${icon("map")}</span>
              <span class="maps-app-option-label">${escapeHtml(o.label)}</span>
              ${icon("chevron")}
            </button>`
          )
          .join("")}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelectorAll(".maps-app-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = options[parseInt(btn.dataset.i, 10)];
      if (opt) window.open(opt.url, "_blank", "noopener");
      overlay.remove();
    });
  });
}

// ============================================================
// RENDER PRINCIPAL / ROUTER
// ============================================================

async function renderApp() {
  if (state.tripId === null) {
    await renderHome();
  } else {
    await renderTripShell();
  }
}

// Recuerda hasta dónde se había bajado en cada pantalla (una entrada
// por viaje+sección, o "home" para el inicio), para restaurarlo al
// volver con "atrás" en vez de recargar siempre desde arriba.
// "lastRenderedKey" es justo lo que hay en pantalla ANTES de esta
// navegación — no puede calcularse a partir de `state`, porque quien
// llama a withTransition() ya lo cambió (p.ej. `state.section = tab`)
// antes de invocarla.
const scrollPositions = new Map();
let lastRenderedKey = "home";

function currentViewKey() {
  return state.tripId === null ? "home" : `${state.tripId}::${state.section}`;
}

/**
 * Envuelve un cambio de pantalla con la View Transitions API del
 * navegador para que se sienta como un desplazamiento fluido en vez
 * de un cambio instantáneo. `direction` controla si el CSS anima
 * como "avanzar" (desliza a la izquierda) o "retroceder" (desliza a
 * la derecha). En navegadores sin soporte, simplemente se renderiza
 * al instante como antes — nunca rompe nada.
 */
function withTransition(renderFn, direction = "forward") {
  if (direction === "forward") pushNavState();
  document.documentElement.dataset.navDir = direction;
  scrollPositions.set(lastRenderedKey, window.scrollY);

  const run = async () => {
    await renderFn();
    const key = currentViewKey();
    // Al avanzar, la sección es nueva para el usuario: empieza
    // arriba. Al volver, se restaura donde se había quedado.
    window.scrollTo(0, direction === "back" ? scrollPositions.get(key) || 0 : 0);
    lastRenderedKey = key;
  };

  if (document.startViewTransition) {
    document.startViewTransition(() => run());
  } else {
    run();
  }
}

/**
 * Navegación "atrás": del detalle de una sección al resumen del
 * viaje, o del resumen a la lista de viajes. La usan tanto el botón
 * ← del topbar como el gesto de deslizar desde el borde izquierdo.
 * En vez de cambiar el estado directamente, retrocede una entrada
 * del historial del navegador: así el mismo código sirve también
 * para el botón/gesto "atrás" físico de Android (ver más abajo).
 */
function goBack() {
  if (document.getElementById("lock-overlay")) return; // la pantalla de PIN no se cierra así

  // Si hay una ventana emergente abierta, la cerramos primero (igual
  // que hace el botón físico de Android) en vez de no hacer nada.
  const overlays = document.querySelectorAll(".modal-overlay");
  if (overlays.length) {
    overlays[overlays.length - 1].click();
    return;
  }

  if (state.tripId === null) return;
  history.back();
}

/**
 * Gesto de "deslizar para volver" (como en iOS/Android): si el
 * arrastre empieza muy cerca del borde izquierdo de la pantalla y se
 * mueve claramente hacia la derecha, se interpreta como "atrás".
 */
function installSwipeBack() {
  const EDGE = 24;
  const THRESHOLD = 90;
  let startX = null;
  let startY = null;
  let tracking = false;

  document.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      tracking = t.clientX <= EDGE;
      startX = t.clientX;
      startY = t.clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = Math.abs(t.clientY - startY);
      if (dx > THRESHOLD && dy < 60) {
        goBack();
      }
    },
    { passive: true }
  );
}

/**
 * Botón/gesto "atrás" de Android (o el de cualquier navegador).
 *
 * La app no usa URLs de verdad (todo es una sola pantalla), así que
 * el sistema no tiene forma de saber en qué "página" estás. Para que
 * la flechita de atrás de Android no cierre la app de golpe, cada
 * vez que se avanza a un viaje, a una sección o se abre una ventana
 * emergente, se añade una entrada al historial del navegador
 * (`pushNavState`). Cuando el usuario pulsa atrás, el navegador
 * dispara "popstate": ahí cerramos la ventana emergente que esté
 * abierta o retrocedemos un nivel dentro del viaje, en vez de dejar
 * que Android salga de la aplicación.
 *
 * Las ventanas emergentes también pueden cerrarse de formas que no
 * pasan por el botón atrás (tocar "Guardar", "Cancelar", tocar fuera
 * de ellas...). Para que el historial no se desincronice en esos
 * casos, se vigila también cuándo desaparece un `.modal-overlay` del
 * documento y, si no fue el propio botón atrás quien lo cerró, se
 * consume igualmente una entrada del historial (`history.back()`).
 * Una única bandera evita que ambos caminos se disparen a la vez.
 */
let suppressNextPush = false;
let suppressHistorySync = false;

function pushNavState() {
  if (suppressNextPush) {
    suppressNextPush = false;
    return;
  }
  history.pushState({ tp: Date.now() }, "");
}

function isModalOverlayNode(node) {
  return node.nodeType === 1 && node.classList && node.classList.contains("modal-overlay");
}

function installAndroidBackHandling() {
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (isModalOverlayNode(node)) pushNavState();
      }
      for (const node of m.removedNodes) {
        if (!isModalOverlayNode(node)) continue;
        if (suppressHistorySync) {
          // Ya se cerró desde el propio botón atrás (ver más abajo);
          // esta desaparición ya está contabilizada.
          suppressHistorySync = false;
        } else {
          // Se cerró de otra forma (Guardar, Cancelar, tocar fuera...):
          // consumimos igualmente la entrada que se apiló al abrirla.
          suppressHistorySync = true;
          history.back();
        }
      }
    }
  });
  observer.observe(document.body, { childList: true });

  window.addEventListener("popstate", () => {
    if (suppressHistorySync) {
      suppressHistorySync = false;
      return; // era solo la sincronización de un cierre que ya ocurrió
    }

    const overlays = document.querySelectorAll(".modal-overlay");
    if (overlays.length) {
      suppressHistorySync = true; // el remove() que esto provoque ya está pagado
      overlays[overlays.length - 1].click();
      return;
    }
    if (document.getElementById("lock-overlay")) return; // la pantalla de PIN no se cierra con atrás

    if (state.tripId !== null) {
      if (state.section !== "dashboard") {
        state.section = "dashboard";
      } else {
        state.tripId = null;
      }
      // Nota: withTransition(..., "back") nunca apila una entrada
      // nueva (solo lo hace "forward"), así que aquí NO hay que
      // marcar suppressNextPush — hacerlo dejaba la bandera activada
      // y "robaba" la siguiente navegación hacia delante (p.ej. al
      // volver a entrar a un viaje, esa entrada no se apilaba y el
      // siguiente "atrás" se salía de la app en vez de volver a inicio).
      withTransition(renderApp, "back");
    }
    // Si ya estábamos en el inicio sin nada abierto, no hacemos nada
    // especial: la siguiente pulsación de atrás cierra la app, como
    // es normal en Android.
  });
}

/**
 * Deslizar hacia abajo para cerrar cualquier ventana modal (el asa
 * .modal-handle de arriba ya insinuaba esto, pero no hacía nada).
 * Funciona desde el asa siempre, y desde el resto de la ventana solo
 * si su contenido ya está desplazado hasta arriba del todo — así no
 * le roba el scroll a una lista larga (Mi perfil, Ajustes...) ni al
 * texto de un campo. Al soltar, si se arrastró lo bastante (o con
 * suficiente velocidad aunque no haya llegado al umbral), se cierra
 * exactamente igual que con el botón "Cerrar" (overlay.remove()):
 * toda la lógica que ya depende de esa desaparición del DOM — el
 * subsheet que vuelve a mostrar su padre (openSubSheet), la
 * sincronía con el botón atrás de Android — sigue funcionando sola,
 * sin que este gesto tenga que saber nada de eso.
 */
function installModalSwipeToClose() {
  const DRAG_THRESHOLD = 90; // px arrastrados para cerrar
  const VELOCITY_THRESHOLD = 0.5; // px/ms: un tirón rápido cierra aunque no llegue al umbral

  let sheet = null;
  let startY = 0;
  let lastY = 0;
  let lastT = 0;
  let dy = 0;
  let dragging = false;

  function onStart(e) {
    const handle = e.target.closest(".modal-handle");
    if (handle) {
      sheet = handle.closest(".modal-sheet");
    } else {
      // Los controles propios (botones, campos...) manejan su propio
      // toque; el gesto de cerrar solo arranca sobre el resto del
      // contenido, y solo si ya no queda nada por desplazar arriba.
      if (e.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
      const sheetEl = e.target.closest(".modal-sheet");
      if (!sheetEl || sheetEl.scrollTop > 0) return;
      sheet = sheetEl;
    }
    if (!sheet) return;

    const t = e.touches[0];
    startY = t.clientY;
    lastY = startY;
    lastT = Date.now();
    dy = 0;
    dragging = true;
    sheet.style.transition = "none";
  }

  function onMove(e) {
    if (!dragging || !sheet) return;
    const t = e.touches[0];
    const rawDy = t.clientY - startY;
    if (rawDy <= 0) {
      // Hacia arriba no hace nada especial: se deja pasar (permite
      // seguir con el scroll normal del contenido).
      dy = 0;
      sheet.style.transform = "";
      return;
    }
    dy = rawDy;
    lastY = t.clientY;
    lastT = Date.now();
    sheet.style.transform = `translateY(${dy}px)`;
    e.preventDefault();
  }

  function onEnd() {
    if (!dragging || !sheet) return;
    dragging = false;
    const s = sheet;
    sheet = null;
    const elapsed = Math.max(1, Date.now() - lastT);
    const velocity = dy / elapsed;
    const shouldClose = dy > DRAG_THRESHOLD || velocity > VELOCITY_THRESHOLD;

    s.style.transition = "transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)";
    if (shouldClose) {
      const overlay = s.closest(".modal-overlay");
      s.style.transform = "translateY(100%)";
      setTimeout(() => {
        if (overlay) overlay.remove();
      }, 220);
    } else {
      s.style.transform = "";
    }
  }

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: false });
  document.addEventListener("touchend", onEnd, { passive: true });
  document.addEventListener("touchcancel", onEnd, { passive: true });
}

/**
 * Vuelve a mostrar el splash de bienvenida (logo animado + foto de
 * una maravilla del mundo) cada vez que la app vuelve a primer plano
 * después de haber estado en segundo plano — al abrirla de nuevo
 * desde el multitarea del sistema, por ejemplo. Se apoya en
 * "visibilitychange", que SOLO se dispara cuando el documento pasa
 * de oculto a visible de verdad (minimizar/cambiar de app y volver);
 * navegar DENTRO de la app (entrar a un viaje y volver al inicio,
 * cerrar una ventana modal...) nunca oculta el documento, así que
 * ese caso no puede disparar esto por error — no hace falta ninguna
 * lógica extra para distinguirlos.
 *
 * Reutiliza el splash real de index.html: clona la plantilla que se
 * guardó en window.__TP_SPLASH_TEMPLATE (antes de que index.html
 * retirara la suya) en vez de reconstruir aquí el marcado y las
 * animaciones por segunda vez. Al ser un elemento recién insertado,
 * sus animaciones (el "pop" de entrada, el vuelo del avión...)
 * arrancan solas desde el principio, sin ningún truco para
 * reiniciarlas.
 */
function installReturnSplash() {
  const HOLD_MS = 1300;
  const FADE_MS = 450;
  let active = false;

  document.addEventListener("visibilitychange", () => {
    if (document.hidden || active) return;
    const template = window.__TP_SPLASH_TEMPLATE;
    if (!template) return;

    active = true;
    const splash = template.cloneNode(true);
    // Sin id (y con la clase equivalente en su lugar): así la regla
    // de "recarga dentro de la sesión" — html.tp-skip-splash #splash-screen
    // — no lo apaga a él también si esta sesión tuvo alguna recarga
    // en algún momento (ver comentario junto a esa regla en el CSS).
    splash.removeAttribute("id");
    splash.classList.add("splash-screen-base");
    document.body.appendChild(splash);
    setTimeout(() => {
      splash.classList.add("splash-hide");
      setTimeout(() => {
        splash.remove();
        active = false;
      }, FADE_MS);
    }, HOLD_MS);
  });
}

// ============================================================
// ESTRUCTURA DE UN VIAJE (topbar + contenido)
// La navegación entre secciones (vuelos, hoteles, transporte...)
// se hace desde las tarjetas del Resumen, no desde una barra fija.
// ============================================================

async function renderTripShell() {
  const trip = await Data.get("trips", state.tripId);
  if (!trip) {
    state.tripId = null;
    await renderApp();
    return;
  }

  const isDashboard = state.section === "dashboard";

  // Cabecera grande con la foto del destino (solo en el Resumen); en
  // las secciones internas se mantiene la barra compacta de siempre.
  let headerHtml;
  if (isDashboard) {
    const days = daysUntil(trip.start_date);
    let status = "";
    if (days === null) status = "";
    else if (days > 1) status = t("countdown_days", { n: days });
    else if (days === 1) status = t("countdown_day");
    else if (days === 0) status = t("countdown_starts_today");
    else if (trip.end_date && daysUntil(trip.end_date) >= 0) status = t("countdown_ongoing");
    else status = t("countdown_finished");

    const totalDays = daysBetween(trip.start_date, trip.end_date);

    headerHtml = h`
      <div class="hero hero-trip">
        ${trip.photo_url ? `<img class="hero-photo" src="${escapeHtml(trip.photo_url)}" alt="" />` : ""}
        <div class="hero-top">
          <button class="icon-btn" id="btn-back">←</button>
          <div class="hero-brand"></div>
          <button class="icon-btn ${currentUser() ? "logged-in" : ""}" id="btn-settings" title="${t("settings_tooltip")}">⚙️</button>
          <button class="icon-btn" id="btn-trip-menu">⋮</button>
        </div>
        ${status ? `<span class="hero-trip-status">${status}</span>` : ""}
        <h1 class="hero-trip-title">${escapeHtml(trip.destination)}</h1>
        <p class="hero-trip-meta">
          <span>🗓️ ${formatDatePretty(trip.start_date)} – ${formatDatePretty(trip.end_date)}</span>
          ${totalDays ? `<span>· ${t("trip_days_count", { n: totalDays })}</span>` : ""}
          ${trip.name ? `<span>· ${escapeHtml(trip.name)}</span>` : ""}
        </p>
      </div>`;
  } else {
    const labels = {
      flights: t("section_flights"), hotels: t("section_hotels"), itinerary: t("section_itinerary"),
      transport: t("section_transport"), reservations: t("section_reservations"), expenses: t("section_expenses"),
      checklist: t("section_checklist"), calendar: t("section_calendar"), map: t("section_map"),
    };
    headerHtml = h`
      <div class="topbar">
        <button class="icon-btn" id="btn-back">←</button>
        <div class="topbar-titles">
          <p class="topbar-eyebrow">${escapeHtml(trip.destination)}</p>
          <h1 class="topbar-title">${labels[state.section] || t("section_trip_fallback")}</h1>
        </div>
        <button class="icon-btn ${currentUser() ? "logged-in" : ""}" id="btn-settings" title="Ajustes">⚙️</button>
        <button class="icon-btn" id="btn-trip-menu">⋮</button>
      </div>`;
  }

  root.innerHTML = h`
    ${headerHtml}
    <div class="view has-tabbar" id="section-content"></div>
    <div id="fab-slot"></div>
    ${renderTabbarHtml("trip")}
    <div id="print-area"></div>
  `;

  root.querySelector("#btn-back").addEventListener("click", () => goBack());

  root.querySelector("#btn-settings").addEventListener("click", () => openSettingsSheet());

  root.querySelector("#btn-trip-menu").addEventListener("click", () => {
    openTripMenu(trip);
  });

  bindTabbar(trip);

  await renderSection(trip);
}

// ============================================================
// BARRA INFERIOR DE NAVEGACIÓN
// Inicio · Itinerario · Mapa · Gastos · Más dentro de un viaje;
// Inicio · Viajes · (+) · Mapa · Más en la portada — como en el
// diseño de referencia.
// ============================================================

// Funciones (no arrays fijos) para que las etiquetas se traduzcan al
// idioma actual en cada render, no solo la primera vez que se carga
// el módulo (que es antes de que loadLanguage() haya terminado).
function tabbarHomeItems() {
  return [
    { id: "dashboard", icon: "home", label: t("nav_home") },
    { id: "__trips", icon: "luggage", label: t("nav_trips") },
    { id: "__add", icon: null, label: t("nav_add") },
    { id: "__map", icon: "map", label: t("nav_map") },
    { id: "__more", icon: "more", label: t("nav_more") },
  ];
}

function tabbarTripItems() {
  return [
    { id: "dashboard", icon: "home", label: t("nav_home") },
    { id: "itinerary", icon: "itinerary", label: t("nav_itinerary") },
    { id: "map", icon: "map", label: t("nav_map") },
    { id: "expenses", icon: "expenses", label: t("nav_expenses") },
    { id: "__more", icon: "more", label: t("nav_more") },
  ];
}

function renderTabbarHtml(mode) {
  const items = mode === "home" ? tabbarHomeItems() : tabbarTripItems();
  const buttons = items
    .map((t) => {
      if (t.id === "__add") {
        return `<button class="tab-center" data-tab="__add" aria-label="Añadir"><span>＋</span></button>`;
      }
      const active = state.tripId !== null && state.section === t.id ? "active" : "";
      return `<button class="${active}" data-tab="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`;
    })
    .join("");
  return `<nav class="tabbar">${buttons}</nav>`;
}

function bindHomeTabbar() {
  root.querySelectorAll(".tabbar [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab === "dashboard" || tab === "__trips") {
        root.querySelector("#trip-search")?.focus();
        return;
      }
      if (tab === "__add") {
        openTripForm();
        return;
      }
      if (tab === "__map") {
        const withMap = document.querySelectorAll(".trip-card")[0];
        if (withMap) {
          state.tripId = parseInt(withMap.dataset.id, 10);
          state.section = "map";
          withTransition(renderApp, "forward");
        } else {
          toast("Crea un viaje primero");
        }
        return;
      }
      if (tab === "__more") {
        openSettingsSheet();
      }
    });
  });
}

function bindTabbar(trip) {
  root.querySelectorAll(".tabbar [data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      if (tab === "__more") {
        openSectionsSheet(trip);
        return;
      }

      if (tab === "dashboard") {
        // "Inicio" siempre lleva a la pantalla principal de la app
        // (el listado de "Mis viajes"), no al resumen de este viaje
        // — para eso ya está el resumen que se ve nada más entrar.
        state.tripId = null;
        withTransition(renderApp, "back");
        return;
      }

      if (state.section === tab) return;
      state.section = tab;
      withTransition(renderApp, "forward");
    });
  });
}

/**
 * Hoja "Más": el resto de secciones del viaje que no caben en la
 * barra inferior.
 */
function openSectionsSheet(trip) {
  const items = [
    { id: "flights", icon: "flights", label: t("section_flights") },
    { id: "hotels", icon: "hotels", label: t("section_hotels") },
    { id: "transport", icon: "transport", label: t("section_transport") },
    { id: "reservations", icon: "reservations", label: t("section_reservations") },
    { id: "checklist", icon: "checklist", label: t("section_checklist") },
    { id: "calendar", icon: "calendar", label: t("section_calendar") },
  ];

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${t("sections_sheet_title")}</h2>
      <div class="stat-grid">
        ${items
          .map(
            (it) => `
            <div class="stat-card" data-goto="${it.id}">
              <div class="stat-label">${icon(it.icon, "stat-icon")} ${it.label}</div>
            </div>`
          )
          .join("")}
      </div>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-secondary" id="sheet-discover">${icon("compass")} ${t("sections_sheet_discover")}</button>
        <button class="btn btn-ghost" id="sheet-close">${t("common_close")}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#sheet-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#sheet-discover").addEventListener("click", () => {
    overlay.remove();
    openDiscoverSheet(trip);
  });
  overlay.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => {
      overlay.remove();
      state.section = el.dataset.goto;
      withTransition(renderApp, "forward");
    });
  });
}

function openTripMenu(trip) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${escapeHtml(trip.destination)}</h2>
      ${
        trip.share_code
          ? `<p style="color:var(--muted); font-size:12.5px; margin-top:-10px;">${icon("link", "stat-icon")} Viaje compartido · código ${escapeHtml(trip.share_code)}</p>`
          : ""
      }
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-edit">${icon("edit")} Editar viaje</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-share">${icon("link")} ${trip.share_code ? "Compartir de nuevo" : "Compartir viaje (Pro)"}</button></div>
      ${
        trip.share_code
          ? `<div class="modal-actions"><button class="btn btn-secondary" id="mn-refresh-share">${icon("refresh")} Actualizar desde la nube</button></div>`
          : ""
      }
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-pdf">${icon("download")} Itinerario en PDF (Pro)</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-ics">${icon("calendar")} Exportar a calendario (.ics)</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-print">${icon("printer")} Exportar / Imprimir</button></div>
      <div class="modal-actions"><button class="btn btn-danger" id="mn-delete">${icon("trash")} Eliminar viaje</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="mn-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#mn-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#mn-edit").addEventListener("click", () => {
    overlay.remove();
    openTripForm(trip);
  });
  overlay.querySelector("#mn-share").addEventListener("click", async () => {
    overlay.remove();
    await openShareTripSheet(trip);
  });
  const refreshBtn = overlay.querySelector("#mn-refresh-share");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      overlay.remove();
      toast("Buscando cambios…");
      const res = await refreshSharedTrip(trip.id);
      if (res.ok) {
        toast("Actualizado con la copia compartida");
        await renderApp();
      } else {
        toast(res.error || "No se pudo actualizar");
      }
    });
  }
  overlay.querySelector("#mn-delete").addEventListener("click", async () => {
    overlay.remove();
    if (await confirmAction(`Se eliminará "${trip.destination}" y todo su contenido (vuelos, hoteles, itinerario...). ¿Continuar?`)) {
      await Data.deleteTripCascade(trip.id);
      toast("Viaje eliminado");
      state.tripId = null;
      withTransition(renderApp, "back");
    }
  });
  overlay.querySelector("#mn-print").addEventListener("click", async () => {
    overlay.remove();
    await renderPrintArea(trip);
    setTimeout(() => window.print(), 150);
  });
  overlay.querySelector("#mn-pdf").addEventListener("click", async () => {
    overlay.remove();
    await exportItineraryPdf(trip);
  });
  overlay.querySelector("#mn-ics").addEventListener("click", async () => {
    overlay.remove();
    await exportTripToIcs(trip);
  });
}

// ------------------------------------------------------------
// DESCUBRE (gratis) — lugares de interés y alojamiento cercanos al
// destino del viaje, usando fuentes públicas (Wikipedia + OSM).
// ------------------------------------------------------------

async function openDiscoverSheet(trip) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Descubre ${escapeHtml(trip.destination)}</h2>
      <div class="pill-row" style="margin-top:2px;">
        <button data-tab="popular" class="active">Populares</button>
        <button data-tab="search">Buscar</button>
      </div>
      <div id="discover-panel-popular">
        <div id="discover-body" class="discover-loading">
          <span class="discover-spinner">${icon("compass")}</span>
          <p>Buscando sitios de interés en ${escapeHtml(trip.destination)}…</p>
        </div>
      </div>
      <div id="discover-panel-search" hidden>
        <div class="field" style="margin-top:2px;">
          <input type="text" id="discover-search-input" placeholder="Nombre del sitio (p. ej. &quot;Torre Eiffel&quot;)" />
        </div>
        <button class="btn btn-primary" id="discover-search-btn" style="width:100%;">Buscar</button>
        <div id="discover-search-results" style="margin-top:12px;"></div>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="discover-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#discover-close").addEventListener("click", () => overlay.remove());

  function cardHtml({ name, subtitle, photoUrl }) {
    return h`
      <div class="discover-card" data-name="${escapeHtml(name)}">
        ${photoUrl ? `<img src="${photoUrl}" alt="" class="discover-thumb" />` : `<div class="discover-thumb discover-thumb-empty">🧭</div>`}
        <div class="discover-info">
          <p class="discover-name">${escapeHtml(name)}</p>
          <p class="discover-summary">${escapeHtml(subtitle)}</p>
        </div>
        <button class="discover-add" title="Añadir">➕</button>
      </div>`;
  }

  function wireAddButtons(container) {
    container.querySelectorAll(".discover-add").forEach((btn) => {
      if (btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", async () => {
        const card = btn.closest(".discover-card");
        const name = card.dataset.name;
        btn.disabled = true;
        await Data.add("itinerary", {
          trip_id: trip.id,
          title: name,
          date: trip.start_date || "",
          location: name,
          order: Date.now(),
        });
        toast(`"${name}" añadido al itinerario`);
        btn.textContent = "✅";
      });
    });
  }

  // --- Pestaña "Buscar": un sitio concreto por nombre, para
  // añadirlo directo al itinerario aunque no sea una sugerencia
  // automática de la pestaña "Populares". ---
  const searchInput = overlay.querySelector("#discover-search-input");
  const searchResults = overlay.querySelector("#discover-search-results");

  async function runPlaceSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    searchResults.innerHTML = `
      <div class="discover-loading" style="min-height:90px;">
        <span class="discover-spinner">${icon("compass")}</span>
        <p>Buscando "${escapeHtml(q)}"…</p>
      </div>`;
    const results = await searchPlaces(q, trip.destination);
    if (!overlay.isConnected) return;
    searchResults.innerHTML = results.length
      ? results.map((r) => cardHtml({ name: r.name, subtitle: r.category })).join("")
      : `<p style="color:var(--muted); font-size:12.5px; text-align:center; padding:14px 0;">No encontramos "${escapeHtml(q)}". Prueba con un nombre más concreto.</p>`;
    wireAddButtons(searchResults);
  }

  overlay.querySelector("#discover-search-btn").addEventListener("click", runPlaceSearch);
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runPlaceSearch();
    }
  });

  // --- Cambiar entre "Populares" y "Buscar" ---
  const tabButtons = [...overlay.querySelectorAll(".pill-row button")];
  const panelPopular = overlay.querySelector("#discover-panel-popular");
  const panelSearch = overlay.querySelector("#discover-panel-search");
  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.toggle("active", b === btn));
      const isSearch = btn.dataset.tab === "search";
      panelPopular.hidden = isSearch;
      panelSearch.hidden = !isSearch;
      if (isSearch) searchInput.focus();
    });
  });

  // --- Pestaña "Populares": sugerencias automáticas alrededor del
  // destino del viaje, priorizando sitios con artículo en Wikipedia
  // (la señal gratuita más cercana a "sitio realmente conocido" que
  // hay sin depender de una API de pago). ---
  const coords = await geocode(trip.destination);
  if (!overlay.isConnected) return; // el usuario ya cerró el modal
  const body = overlay.querySelector("#discover-body");

  if (!coords) {
    body.innerHTML = `<p>No se pudo localizar "${escapeHtml(trip.destination)}". Prueba a poner un destino más concreto (p. ej. "Roma, Italia"), o busca un sitio concreto en la pestaña "Buscar".</p>`;
    return;
  }

  // Cada "cargar más" amplía el radio y el límite de búsqueda, y
  // descarta lugares ya mostrados (por nombre) para no duplicar.
  const shownNames = new Set();
  let radiusM = 3000;
  let limit = 10;

  async function loadMore() {
    const loadMoreBtn = overlay.querySelector("#discover-load-more");
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = "Buscando más…";
    }

    const attractions = await nearbyAttractions(coords.lat, coords.lng, { radiusM, limit });
    if (!overlay.isConnected) return;

    const fresh = attractions.filter((a) => !shownNames.has(a.name));
    fresh.forEach((a) => shownNames.add(a.name));

    const list = overlay.querySelector("#discover-list");
    if (fresh.length) {
      list.insertAdjacentHTML(
        "beforeend",
        fresh.map((a) => cardHtml({ name: a.name, subtitle: a.summary || a.category, photoUrl: a.photoUrl })).join("")
      );
      wireAddButtons(list);
    }

    radiusM += 2000;
    limit += 10;

    const footer = overlay.querySelector("#discover-footer");
    if (footer) {
      footer.innerHTML = fresh.length
        ? `<button class="btn btn-ghost" id="discover-load-more">Cargar más sitios</button>`
        : `<p style="color:var(--muted); font-size:12.5px; text-align:center; margin:6px 0 0;">No encontramos más sitios cercanos.</p>`;
      const nextBtn = footer.querySelector("#discover-load-more");
      if (nextBtn) nextBtn.addEventListener("click", loadMore);
    }
  }

  body.outerHTML = `
    <div id="discover-body" style="max-height:48vh; overflow-y:auto;">
      <p class="section-title">Sitios más visitados</p>
      <div id="discover-list"></div>
      <div id="discover-footer" style="padding:10px 0 0;"></div>
    </div>`;

  await loadMore();

  if (!overlay.querySelector("#discover-list").children.length) {
    overlay.querySelector("#discover-body").innerHTML = `<p>No encontramos sugerencias para esta zona ahora mismo (puede que no haya conexión, o que el área tenga poca cobertura en estas fuentes). Prueba a buscar un sitio concreto en la pestaña "Buscar".</p>`;
  }
}

// ------------------------------------------------------------
// COMPARTIR VIAJE (Pro) — genera/renueva un código y lo enseña
// listo para copiar/enviar a quien quieras invitar.
// ------------------------------------------------------------

async function openShareTripSheet(trip) {
  if (!(await hasProAccess())) {
    openRegisterInviteSheet("Compartir viajes con otras personas requiere tener una cuenta.");
    return;
  }
  if (!currentUser()) {
    toast("Inicia sesión primero en Ajustes → Mi cuenta");
    return;
  }

  toast("Generando enlace…");
  const res = await shareTrip(trip.id);
  if (!res.ok) {
    toast(res.error || "No se pudo compartir el viaje");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Viaje compartido</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6;">
        Dale este código (o el QR) a quien quieras invitar. Desde
        Ajustes → Unirme a un viaje compartido, con su propia cuenta
        iniciada, podrá añadirlo a sus viajes escribiéndolo o
        escaneándolo.
      </p>
      <div class="field" style="margin-top:6px;">
        <input type="text" id="share-code-value" value="${escapeHtml(res.code)}" readonly
          style="text-align:center; font-size:22px; letter-spacing:3px; font-weight:700;" />
      </div>
      <div id="share-qr-wrap" style="display:flex; justify-content:center; margin:14px 0;">
        <canvas id="share-qr-canvas"></canvas>
      </div>
      <div class="modal-actions"><button class="btn btn-primary" id="share-copy">📋 Copiar código</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="share-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#share-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#share-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(res.code);
      toast("Código copiado");
    } catch (err) {
      overlay.querySelector("#share-code-value").select();
      toast("Selecciona y copia el código");
    }
  });

  const qrCanvas = overlay.querySelector("#share-qr-canvas");
  if (typeof QRCode !== "undefined" && typeof QRCode.toCanvas === "function") {
    QRCode.toCanvas(qrCanvas, shareCodeToQrText(res.code), { width: 190, margin: 1 }, (err) => {
      if (err) overlay.querySelector("#share-qr-wrap")?.remove();
    });
  } else {
    overlay.querySelector("#share-qr-wrap")?.remove();
  }
}

// Prefijo propio para que el escáner sepa que un QR es de este app
// (y no lo confunda con cualquier otro código que alguien escanee sin
// querer). Al leerlo, se quita el prefijo antes de pasarlo a
// joinSharedTrip; si alguien escanea un QR sin este prefijo, se usa
// el texto tal cual, por si el código se comparte de otra forma.
const SHARE_QR_PREFIX = "TPJOIN:";

function shareCodeToQrText(code) {
  return `${SHARE_QR_PREFIX}${code}`;
}

function shareCodeFromQrText(text) {
  const trimmed = (text || "").trim();
  return trimmed.toUpperCase().startsWith(SHARE_QR_PREFIX) ? trimmed.slice(SHARE_QR_PREFIX.length) : trimmed;
}

/**
 * Escáner de QR genérico con la cámara del dispositivo. Llama a
 * `onResult(text)` en cuanto lee un código y cierra el overlay. Si el
 * navegador no permite cámara, o falla el permiso, avisa con un toast
 * y no llama a `onResult`.
 */
async function openQrScannerSheet(onResult) {
  if (!navigator.mediaDevices?.getUserMedia) {
    toast("Este dispositivo no permite acceder a la cámara desde el navegador");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">📷 Escanear QR</h2>
      <p style="color:var(--muted); font-size:13px; margin-top:-8px;">Apunta la cámara al código QR del viaje.</p>
      <div style="position:relative; border-radius:16px; overflow:hidden; background:#000; aspect-ratio:1/1;">
        <video id="qr-video" playsinline muted style="width:100%; height:100%; object-fit:cover;"></video>
      </div>
      <p id="qr-scan-status" style="color:var(--muted); font-size:12.5px; text-align:center; margin-top:8px;">Buscando código…</p>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" id="qr-cancel">Cancelar</button></div>
    </div>`;
  document.body.appendChild(overlay);

  const video = overlay.querySelector("#qr-video");
  const statusEl = overlay.querySelector("#qr-scan-status");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  let stream = null;
  let rafId = null;
  let stopped = false;

  function stop() {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      stop();
      overlay.remove();
    }
  });
  overlay.querySelector("#qr-cancel").addEventListener("click", () => {
    stop();
    overlay.remove();
  });

  function scanLoop() {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if (result?.data) {
        stop();
        overlay.remove();
        onResult(result.data);
        return;
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  if (typeof jsQR === "undefined") {
    statusEl.textContent = "No se pudo cargar el lector de QR (revisa tu conexión e inténtalo de nuevo).";
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    if (stopped) {
      // Se canceló mientras se pedía el permiso de cámara.
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    video.srcObject = stream;
    await video.play();
    scanLoop();
  } catch (err) {
    statusEl.textContent = "No se pudo acceder a la cámara (revisa los permisos del navegador).";
  }
}

// ------------------------------------------------------------
// UNIRSE A UN VIAJE COMPARTIDO (Pro) — desde Ajustes.
// ------------------------------------------------------------

async function openJoinTripSheet() {
  if (!(await hasProAccess())) {
    openRegisterInviteSheet("Unirte a un viaje compartido requiere tener una cuenta.");
    return;
  }
  if (!currentUser()) {
    toast("Inicia sesión primero en Ajustes → Mi cuenta");
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Unirme a un viaje compartido</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Introduce el código de 6 caracteres que te han pasado, o escanea su QR.
      </p>
      <div class="field">
        <input type="text" id="join-code-input" placeholder="Ej. AB12CD" autocomplete="off"
          style="text-align:center; font-size:20px; letter-spacing:3px; text-transform:uppercase;" />
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-secondary" id="join-scan">📷 Escanear QR</button></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="join-cancel">${t("common_cancel")}</button>
        <button type="button" class="btn btn-primary" id="join-confirm">Unirme</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#join-cancel").addEventListener("click", () => overlay.remove());

  const codeInput = overlay.querySelector("#join-code-input");

  async function doJoin(code) {
    const clean = (code || "").trim();
    if (!clean) {
      toast("Introduce un código");
      return;
    }
    toast("Uniéndote al viaje…");
    const res = await joinSharedTrip(clean);
    if (res.ok) {
      overlay.remove();
      toast("¡Listo! El viaje ya aparece en tu lista");
      await renderApp();
    } else {
      toast(res.error || "No se pudo unir al viaje");
    }
  }

  overlay.querySelector("#join-confirm").addEventListener("click", () => doJoin(codeInput.value));
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doJoin(codeInput.value);
  });
  overlay.querySelector("#join-scan").addEventListener("click", () => {
    openQrScannerSheet((text) => {
      const code = shareCodeFromQrText(text);
      overlay.remove();
      doJoin(code);
    });
  });

  setTimeout(() => codeInput.focus(), 50);
}

// ============================================================
// PANTALLA DE INICIO — LISTA DE VIAJES
// ============================================================

async function renderHome() {
  const trips = await Data.getAll("trips");
  trips.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  // Para cada viaje: nº de actividades (itinerario) y % de checklist
  // completado, para la barra de progreso de la tarjeta.
  const tripStats = {};
  await Promise.all(
    trips.map(async (trip) => {
      const [itin, checklist] = await Promise.all([
        Data.getAllByTrip("itinerary", trip.id),
        Data.getAllByTrip("checklist", trip.id),
      ]);
      const done = checklist.filter((c) => c.completed).length;
      tripStats[trip.id] = {
        activities: itin.length,
        pct: checklist.length ? Math.round((done / checklist.length) * 100) : 0,
      };
    })
  );

  const cardsHtml = trips.length
    ? trips
        .map((trip) => {
          const days = daysUntil(trip.start_date);
          let countdown = "";
          if (days === null) countdown = "";
          else if (days > 1) countdown = t("countdown_days", { n: days });
          else if (days === 1) countdown = t("countdown_day");
          else if (days === 0) countdown = t("countdown_today");
          else if (trip.end_date && daysUntil(trip.end_date) >= 0)
            countdown = t("countdown_ongoing");
          else countdown = t("countdown_finished");

          const tripLen = daysBetween(trip.start_date, trip.end_date);
          const stats = tripStats[trip.id] || { activities: 0, pct: 0 };

          return h`
            <div class="trip-card" data-id="${trip.id}">
              <div class="trip-card-art">
                ${
                  trip.photo_url
                    ? `<img src="${escapeHtml(trip.photo_url)}" alt="" loading="lazy" />`
                    : `<span class="trip-card-art-icon">${icon("compass")}</span>`
                }
                ${
                  countdown
                    ? `<span class="trip-countdown-badge ${days === 0 ? "is-today" : ""}">${countdown}</span>`
                    : ""
                }
              </div>
              <p class="trip-dest"><span class="trip-pin">${icon("pin")}</span> ${escapeHtml(trip.destination)}</p>
              <p class="trip-name">${formatDatePretty(trip.start_date)} – ${formatDatePretty(trip.end_date)}</p>
              <div class="trip-meta-row">
                <span>${icon("clock", "stat-icon")} ${t("trip_days_count", { n: tripLen || 0 })}</span>
                <span>${icon("checklist", "stat-icon")} ${t("trip_activities_count", { n: stats.activities })}</span>
              </div>
              <div class="trip-progress-row">
                <div class="progress-track"><div class="progress-fill" style="width:${stats.pct}%"></div></div>
                <span>${stats.pct}%</span>
              </div>
            </div>`;
        })
        .join("")
    : h`
        <div class="empty-state">
          <div class="emoji">🧳</div>
          <p>${t("empty_trips_line1")}<br>${t("empty_trips_line2")}</p>
        </div>`;

  // Próximos eventos: los vuelos y actividades más cercanos, de
  // cualquier viaje, para tenerlos a mano desde el inicio.
  const upcoming = await collectUpcomingEvents(trips);
  const eventsHtml = upcoming.length
    ? upcoming
        .map(
          (ev) => h`
        <div class="event-row" data-trip="${ev.tripId}">
          <span class="event-icon">${icon(ev.icon)}</span>
          <div class="event-body">
            <p class="event-title">${escapeHtml(ev.title)}</p>
            <p class="event-sub">${formatDatePretty(ev.date)}${ev.time ? ` · ${ev.time}` : ""}</p>
          </div>
          <span class="event-chevron">${icon("chevron")}</span>
        </div>`
        )
        .join("")
    : `<p style="color:var(--muted); font-size:13px; padding:4px 2px; text-shadow:var(--text-halo);">${t("no_upcoming_events")}</p>`;

  const hour = new Date().getHours();
  const loggedInUser = currentUser();
  const firstName = loggedInUser && loggedInUser.displayName ? loggedInUser.displayName.trim().split(/\s+/)[0] : null;
  const greetWord = firstName
    ? t("greet_hello_name", { name: escapeHtml(firstName) })
    : hour < 6 ? t("greet_night") : hour < 13 ? t("greet_morning") : hour < 21 ? t("greet_afternoon") : t("greet_night");

  root.innerHTML = h`
    <div class="hero">
      <svg class="hero-art" viewBox="0 0 200 140" preserveAspectRatio="xMaxYMin meet" fill="none" aria-hidden="true">
        <path d="M70 95 Q 110 45, 175 30" stroke="rgba(255,255,255,0.4)" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 12"/>
        <circle cx="175" cy="30" r="5" fill="rgba(255,255,255,0.5)"/>
        <g transform="translate(70 95) rotate(-30) scale(1.1)"><path d="M16 0 L-14 -9 L-4 0 L-14 9 Z" fill="rgba(255,255,255,0.45)"/></g>
      </svg>
      <div class="hero-top">
        <div class="hero-brand">
          <span class="hero-logo">${brandMark()}</span>
          <div>
            <p class="hero-brand-name">Viajoo</p>
            <p class="hero-brand-tag">${t("brand_tagline")}</p>
          </div>
        </div>
        <button class="icon-btn hero-avatar ${currentUser() ? "logged-in" : ""}" id="btn-settings" title="${t("settings_tooltip")}">🙂</button>
      </div>
      <h1 class="hero-greeting">${greetWord} 👋 <span class="hero-greeting-q">${t("greet_question")}</span></h1>
      <div class="hero-search">
        ${icon("search")}
        <input type="search" id="trip-search" placeholder="${t("search_placeholder")}" autocomplete="off" />
      </div>
      <div class="search-suggestions" id="trip-search-suggestions"></div>
      <button class="ai-plan-cta" id="btn-ai-plan-trip">
        <span class="ai-plan-cta-art">✨</span>
        <span class="ai-plan-cta-text">
          <strong>${t("ai_plan_title")} · Pro</strong>
          <span>${t("ai_plan_subtitle")}</span>
        </span>
        <span class="ai-plan-cta-arrow">${icon("chevron")}</span>
      </button>
    </div>
    <div class="view has-tabbar">
      <div id="destination-search"></div>
      <div class="hero-cta-row">
        <button class="hero-cta" id="fab-new-trip">${t("new_trip")}</button>
        <button class="hero-quick-btn" id="btn-currency-converter" title="${t("currency_converter")}">${icon("wallet")}</button>
      </div>
      <div class="section-title-row">
        <p class="section-title">${t("my_trips")}</p>
        ${trips.length > 3 ? `<button class="see-all" id="see-all-trips">${t("see_all")} ${icon("chevron")}</button>` : ""}
      </div>
      <div class="trip-carousel" id="trip-list">${cardsHtml}</div>
      <div class="section-title-row">
        <p class="section-title">${t("upcoming_events")}</p>
      </div>
      <div id="events-list">${eventsHtml}</div>
    </div>
    <div id="fab-slot"></div>
    ${renderTabbarHtml("home")}
  `;

  const searchEl = root.querySelector("#trip-search");
  const destResultsEl = root.querySelector("#destination-search");
  const suggestEl = root.querySelector("#trip-search-suggestions");

  function renderSuggestions(places) {
    if (!suggestEl) return;
    if (!places.length) {
      suggestEl.innerHTML = "";
      return;
    }
    suggestEl.innerHTML = places
      .map(
        (p, i) => `<button type="button" class="search-suggestion" data-i="${i}">${icon("pin", "stat-icon")}<span>${escapeHtml(p.label)}</span></button>`
      )
      .join("");
    suggestEl.querySelectorAll(".search-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => {
        const place = places[parseInt(btn.dataset.i, 10)];
        if (!place) return;
        searchEl.value = place.label;
        suggestEl.innerHTML = "";
        runDestinationSearch(place.label, destResultsEl, { lat: place.lat, lng: place.lng });
      });
    });
  }

  if (searchEl) {
    // Autocompletar: mientras se escribe, sugiere lugares reales
    // (Nominatim) en vez de obligar a acertar el nombre exacto y
    // pulsar Enter a ciegas — así aparecen sugerencias también para
    // ciudades menos conocidas o escritas de forma distinta.
    let suggestTimer = null;
    let suggestToken = 0;
    searchEl.addEventListener("input", () => {
      const raw = searchEl.value.trim();
      const q = raw.toLowerCase();
      root.querySelectorAll(".trip-card").forEach((card) => {
        const text = card.textContent.toLowerCase();
        card.style.display = !q || text.includes(q) ? "" : "none";
      });
      if (!q && destResultsEl) destResultsEl.innerHTML = "";

      clearTimeout(suggestTimer);
      if (raw.length < 2) {
        if (suggestEl) suggestEl.innerHTML = "";
        return;
      }
      suggestTimer = setTimeout(async () => {
        const myToken = ++suggestToken;
        const places = await searchPlaceSuggestions(raw);
        if (myToken !== suggestToken) return; // el usuario ya siguió escribiendo
        if (searchEl.value.trim() !== raw) return; // respuesta ya obsoleta
        renderSuggestions(places);
      }, 400);
    });
    searchEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const q = searchEl.value.trim();
        if (suggestEl) suggestEl.innerHTML = "";
        if (q) runDestinationSearch(q, destResultsEl);
      }
    });
    searchEl.addEventListener("search", () => {
      // El botón "×" nativo del input dispara este evento con value vacío.
      if (!searchEl.value.trim()) {
        if (destResultsEl) destResultsEl.innerHTML = "";
        if (suggestEl) suggestEl.innerHTML = "";
      }
    });
  }

  root.querySelectorAll(".trip-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.tripId = parseInt(card.dataset.id, 10);
      state.section = "dashboard";
      withTransition(renderApp, "forward");
    });
  });

  root.querySelectorAll(".event-row[data-trip]").forEach((row) => {
    row.addEventListener("click", () => {
      state.tripId = parseInt(row.dataset.trip, 10);
      state.section = "dashboard";
      withTransition(renderApp, "forward");
    });
  });

  const seeAllBtn = root.querySelector("#see-all-trips");
  if (seeAllBtn) {
    seeAllBtn.addEventListener("click", () => {
      root.querySelector(".trip-carousel").classList.toggle("expanded");
      seeAllBtn.classList.toggle("expanded");
    });
  }

  bindHomeTabbar();

  root.querySelector("#fab-new-trip").addEventListener("click", () => openTripForm());
  root.querySelector("#btn-settings").addEventListener("click", () => openSettingsSheet());
  root.querySelector("#btn-ai-plan-trip").addEventListener("click", () => openAiNewTripSheet());
  root.querySelector("#btn-currency-converter").addEventListener("click", async () => {
    if (!(await hasProAccess())) {
      openRegisterInviteSheet("El conversor de moneda requiere tener una cuenta.");
      return;
    }
    openCurrencyConverterSheet();
  });

  // Fotos reales del destino: se buscan en segundo plano (no bloquean
  // el primer pintado) y se guardan en el viaje para no tener que
  // volver a buscarlas — así funciona también sin conexión después.
  trips.forEach((trip) => {
    if (trip.photo_url || !trip.destination) return;
    findDestinationPhoto(trip.destination).then(async (url) => {
      if (!url) return;
      const artEl = root.querySelector(`.trip-card[data-id="${trip.id}"] .trip-card-art`);
      if (artEl) {
        const iconEl = artEl.querySelector(".trip-card-art-icon");
        if (iconEl) iconEl.remove();
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        img.loading = "lazy";
        artEl.prepend(img);
      }
      await Data.put("trips", { ...trip, photo_url: url });
    });
  });
}

/**
 * Reúne los próximos vuelos y actividades de itinerario de todos
 * los viajes (fecha de hoy en adelante), ordenados por fecha, para
 * la sección "Próximos eventos" del inicio.
 */
/**
 * Búsqueda de destino desde el buscador del inicio: geocodifica el
 * texto y sugiere alojamientos y lugares de interés cercanos (datos
 * abiertos de OpenStreetMap/Wikipedia, igual que "Descubre"), con un
 * botón para añadir directamente ese destino como viaje nuevo. Más
 * sugerencias quedan como mejora de pago (Pro), igual que el resto
 * de funciones Pro de la app. (Ordenar la ruta por cercanía es otra
 * función Pro, pero vive en la sección Mapa de cada viaje — ver
 * optimizeRouteOrder en geocode.js — no aquí en el buscador.)
 */
async function runDestinationSearch(query, container, knownCoords) {
  if (!container) return;
  container.innerHTML = h`
    <div class="dest-search-panel discover-loading" style="margin:4px 0 18px;">
      <span class="discover-spinner">${icon("compass")}</span>
      <p>Buscando "${escapeHtml(query)}"…</p>
      <p class="discover-loading-sub">Localizando hoteles y lugares de interés</p>
    </div>`;

  // Si ya sabemos las coordenadas (p. ej. el usuario tocó una
  // sugerencia del autocompletar), nos ahorramos una segunda
  // vuelta a Nominatim — misma búsqueda, la mitad de peticiones.
  const coords = knownCoords || (await geocode(query));
  if (container.innerHTML.indexOf(escapeHtml(query)) === -1) return; // el usuario ya cambió de búsqueda

  if (!coords) {
    container.innerHTML = h`
      <div class="dest-search-panel">
        <p style="font-size:13.5px; color:var(--muted); text-align:center; padding:16px 0;">
          No se pudo localizar "${escapeHtml(query)}". Prueba con un nombre más concreto (p. ej. "Roma, Italia").
        </p>
      </div>`;
    return;
  }

  const pro = await hasProAccess();
  const hotelLimit = pro ? 6 : 3;
  const poiLimit = pro ? 10 : 5;

  const [hotels, attractions] = await Promise.all([
    nearbyLodging(coords.lat, coords.lng, { limit: hotelLimit }),
    nearbyAttractions(coords.lat, coords.lng, { limit: poiLimit }),
  ]);

  const hotelsHtml = hotels.length
    ? hotels
        .map(
          (hotel) => `
        <div class="dest-result-row">
          <span class="dest-result-icon">${icon("hotels")}</span>
          <div class="dest-result-info">
            <p class="dest-result-title">${escapeHtml(hotel.name)}</p>
            <p class="dest-result-sub">${escapeHtml(hotel.typeLabel)}</p>
          </div>
        </div>`
        )
        .join("")
    : `<p class="dest-result-empty">No se encontraron alojamientos cercanos con datos abiertos.</p>`;

  const poiHtml = attractions.length
    ? attractions
        .map(
          (a) => `
        <div class="dest-result-row">
          ${
            a.photoUrl
              ? `<img class="dest-result-thumb" src="${a.photoUrl}" alt="" loading="lazy" />`
              : `<span class="dest-result-icon">${icon("compass")}</span>`
          }
          <div class="dest-result-info">
            <p class="dest-result-title">${escapeHtml(a.name)}</p>
            <p class="dest-result-sub">${escapeHtml(a.category)}</p>
          </div>
        </div>`
        )
        .join("")
    : `<p class="dest-result-empty">No se encontraron lugares de interés con datos abiertos.</p>`;

  container.innerHTML = h`
    <div class="dest-search-panel">
      <div class="dest-search-header">
        <p class="dest-search-title">${icon("pin", "dest-search-pin")} Resultados para "${escapeHtml(query)}"</p>
        <button class="icon-btn" id="dest-search-close" title="Cerrar">✕</button>
      </div>
      <p class="dest-search-label">${icon("hotels", "stat-icon")} Hoteles sugeridos</p>
      <div class="dest-result-list">${hotelsHtml}</div>
      <p class="dest-search-label" style="margin-top:12px;">${icon("compass", "stat-icon")} Lugares de interés</p>
      <div class="dest-result-list">${poiHtml}</div>
      <button class="hero-cta" id="dest-search-add" style="margin-top:14px;">＋ Agregar "${escapeHtml(query)}" a mi lista</button>
      ${
        pro
          ? ""
          : `<button class="dest-search-pro" id="dest-search-pro">🔒 Ver más sugerencias — función Pro</button>`
      }
    </div>`;

  const closeBtn = container.querySelector("#dest-search-close");
  if (closeBtn) closeBtn.addEventListener("click", () => { container.innerHTML = ""; });

  const addBtn = container.querySelector("#dest-search-add");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      openTripForm(null, { destination: query });
      container.innerHTML = "";
    });
  }

  const proBtn = container.querySelector("#dest-search-pro");
  if (proBtn) {
    proBtn.addEventListener("click", () => {
      openRegisterInviteSheet("Ver más sugerencias de destinos requiere tener una cuenta.");
    });
  }
}

async function collectUpcomingEvents(trips) {
  const today = todayString();
  const events = [];
  await Promise.all(
    trips.map(async (trip) => {
      const [flights, itin] = await Promise.all([
        Data.getAllByTrip("flights", trip.id),
        Data.getAllByTrip("itinerary", trip.id),
      ]);
      flights.forEach((f) => {
        if (!f.date || f.date < today) return;
        events.push({
          tripId: trip.id,
          date: f.date,
          time: f.time || "",
          icon: "flights",
          title: `Vuelo a ${f.destination || trip.destination}`,
        });
      });
      itin.forEach((i) => {
        if (!i.date || i.date < today) return;
        events.push({
          tripId: trip.id,
          date: i.date,
          time: i.time || "",
          icon: "itinerary",
          title: i.title || "Actividad",
        });
      });
    })
  );
  events.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  return events.slice(0, 3);
}

// El plan gratis deja crear hasta este número de viajes; a partir de
// ahí, hace falta Pro (viajes ilimitados). Los viajes ya creados
// nunca se bloquean ni se ocultan, solo la creación de uno nuevo.
const FREE_TRIP_LIMIT = 2;

// ------------------------------------------------------------
// ACCESO A FUNCIONES QUE REQUIEREN CUENTA — algunas funciones
// (compartir viaje, copiloto de IA, avisos de vuelo...) piden tener
// una cuenta creada, sin que esto tenga que ver con ningún cobro: es
// solo para llevar la cuenta de quién las usa. El interruptor de
// Ajustes → Modo desarrollador sigue funcionando aparte, como atajo
// para probar sin tener que crear una cuenta.
// ------------------------------------------------------------

async function hasProAccess() {
  return !!currentUser() || (await isPro());
}

// ------------------------------------------------------------
// LÍMITE DE CONSULTAS DE PAGO — el Copiloto de IA y los avisos de
// estado de vuelo, a diferencia del resto de funciones con cuenta,
// llaman a APIs externas de pago desde la Cloud Function (Claude,
// AeroDataBox). Cada cuenta puede usarlas PAID_QUERY_LIMIT veces AL
// DÍA; al intentarlo una vez más se avisa de que las consultas
// ilimitadas llegarán con la futura suscripción.
//
// El contador de aquí abajo es solo un espejo local (Data.settingGet/
// Set, con la fecha de hoy en la clave para que se reinicie solo cada
// día) pensado para no abrir formularios/hacer una llamada de red que
// ya sabemos que va a fallar. La cuenta que de verdad manda vive en
// Firestore, junto al UID, dentro de la propia Cloud Function
// (reserveDailyQuota en functions/index.js): por eso el tope no se
// puede esquivar usando otro dispositivo o borrando los datos locales
// — si el servidor rechaza la llamada por límite (ver
// syncPaidQueryLimitReached), este espejo local se pone al día.
// ------------------------------------------------------------

const PAID_QUERY_LIMIT = 2;

function paidQueryCountKey(feature) {
  const uid = currentUser()?.uid || "anon";
  return `paid_query_count_${feature}_${uid}_${todayString()}`;
}

async function getPaidQueryCount(feature) {
  const raw = await Data.settingGet(paidQueryCountKey(feature));
  return typeof raw === "number" ? raw : 0;
}

async function bumpPaidQueryCount(feature) {
  const count = (await getPaidQueryCount(feature)) + 1;
  await Data.settingSet(paidQueryCountKey(feature), count);
  return count;
}

/** El servidor ha rechazado una llamada por haberse agotado el cupo
 * diario de esta cuenta (posiblemente consumido desde otro
 * dispositivo): pone el espejo local al día, sin más. */
async function markPaidQueryLimitReached(feature) {
  await Data.settingSet(paidQueryCountKey(feature), PAID_QUERY_LIMIT);
}

/** Igual que markPaidQueryLimitReached, pero además muestra el aviso
 * — para cuando el rechazo ocurre en primer plano, en respuesta
 * directa a algo que acaba de tocar la persona. */
async function syncPaidQueryLimitReached(feature, reasonText) {
  await markPaidQueryLimitReached(feature);
  openPaidQueryLimitSheet(reasonText);
}

function openPaidQueryLimitSheet(reasonText) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Límite diario alcanzado</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6;">
        ${escapeHtml(reasonText || `Ya usaste tus ${PAID_QUERY_LIMIT} consultas gratis de hoy para esta función.`)}
      </p>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6;">
        Muy pronto podrás tener consultas ilimitadas con una suscripción.
      </p>
      <div class="modal-actions"><button class="btn btn-primary" id="paid-limit-close">Entendido</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#paid-limit-close").addEventListener("click", () => overlay.remove());
}

/** Comprueba si aún quedan consultas gratis para `feature` ("ai" o
 * "flight"); si no quedan, muestra el aviso y devuelve false. No
 * consume ninguna consulta por sí sola: eso se hace aparte con
 * bumpPaidQueryCount(), justo tras completarse la llamada real. */
async function checkPaidQueryLimit(feature, reasonText) {
  const count = await getPaidQueryCount(feature);
  if (count >= PAID_QUERY_LIMIT) {
    openPaidQueryLimitSheet(reasonText);
    return false;
  }
  return true;
}

// ------------------------------------------------------------
// VENTANA DE REGISTRO — reemplaza a los simples toasts de "esto
// necesita cuenta" allí donde tiene sentido detenerse un momento a
// explicar qué se gana, en vez de solo avisar y seguir. Solo se
// muestra cuando falta iniciar sesión (ver hasProAccess): si ya hay
// cuenta, esta ventana ni se llega a abrir. No menciona "Pro" ni
// ningún cobro — de momento no se cobra nada por nada de esto.
// ------------------------------------------------------------

const ACCOUNT_FEATURES_LIST = [
  "Viajes ilimitados (el plan gratis permite hasta 2 a la vez)",
  "Compartir viajes con código o QR",
  `Copiloto de viajes con IA (${PAID_QUERY_LIMIT} usos gratis al día)`,
  `Avisos de estado de vuelo (${PAID_QUERY_LIMIT} usos gratis al día)`,
  "Ordenar la ruta del mapa por cercanía",
  "Conversor de moneda",
  "Guardar el mapa y el itinerario en PDF",
];

function openRegisterInviteSheet(reasonText) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Regístrate para usar esta función</h2>
      ${reasonText ? `<p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">${escapeHtml(reasonText)}</p>` : ""}
      <p style="color:var(--muted); font-size:13px; line-height:1.6;">
        Estas son algunas de las funciones que se desbloquean al registrarte:
      </p>
      <div class="panel" style="margin-top:4px;">
        ${ACCOUNT_FEATURES_LIST.map(
          (f) =>
            `<p style="font-size:13.5px; margin:7px 0; display:flex; gap:8px; align-items:flex-start;"><span style="color:var(--brand); flex-shrink:0;">✓</span><span>${escapeHtml(f)}</span></p>`
        ).join("")}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" id="register-invite-cta">Crear cuenta / Iniciar sesión</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="register-invite-close">Ahora no</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#register-invite-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#register-invite-cta").addEventListener("click", () => {
    overlay.remove();
    renderAuthForm();
  });
}

async function openTripForm(trip, prefill) {
  if (!trip) {
    const trips = await Data.getAll("trips");
    if (trips.length >= FREE_TRIP_LIMIT && !(await hasProAccess())) {
      openRegisterInviteSheet(`El plan gratis permite tener hasta ${FREE_TRIP_LIMIT} viajes a la vez.`);
      return;
    }
  }
  showFormModal({
    title: trip ? "Editar viaje" : "Nuevo viaje",
    initial: trip || prefill || null,
    fields: [
      { name: "name", label: "Nombre del viaje", required: true, placeholder: "Ej. Escapada de verano" },
      { name: "destination", label: "Destino", required: true, placeholder: "Ej. Lisboa, Portugal" },
      { name: "start_date", label: "Fecha de inicio", type: "date", half: true, required: true },
      { name: "end_date", label: "Fecha de fin", type: "date", half: true, required: true },
      { name: "budget", label: "Presupuesto (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
    validate: (values) => {
      if (values.start_date && values.end_date && values.end_date < values.start_date) {
        return "La fecha de fin no puede ser anterior a la de inicio";
      }
      return null;
    },
    onDelete: trip
      ? async () => {
          await Data.deleteTripCascade(trip.id);
          toast("Viaje eliminado");
          state.tripId = null;
          await renderApp();
        }
      : null,
    deleteLabel: "Eliminar viaje",
    onSave: async (values) => {
      if (trip) {
        const merged = { ...trip, ...values };
        if (trip.destination !== values.destination) delete merged.photo_url;
        await Data.put("trips", merged);
        toast("Viaje actualizado");
      } else {
        const id = await Data.add("trips", values);
        await Data.addDefaultChecklistItems(id);
        toast("Viaje creado");
      }
      await renderApp();
    },
  });
}

// ============================================================
// COPIA DE SEGURIDAD (sustituye a import/export de la versión
// de escritorio; aquí es un JSON en vez de un archivo .db)
// ============================================================

function openBackupSheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Copia de seguridad</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Tus datos se guardan solo en este dispositivo/navegador. Exporta un archivo
        de vez en cuando para no perderlos si borras datos de Safari o cambias de móvil.
      </p>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="btn-export">${icon("download")} Exportar copia (.json)</button>
      </div>
      <div class="modal-actions">
        <label class="btn btn-secondary" style="display:flex;">
          ${icon("upload")} Importar copia
          <input type="file" accept="application/json" id="btn-import" style="display:none;" />
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-close-backup">Cerrar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelector("#btn-close-backup").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#btn-export").addEventListener("click", async () => {
    const dump = await Data.exportAll();
    const stamp = todayString();
    download(`viajoo-backup-${stamp}.json`, JSON.stringify(dump, null, 2));
    toast("Copia exportada");
  });

  overlay.querySelector("#btn-import").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!(await confirmAction("Esto sustituirá todos los datos actuales por los del archivo. ¿Continuar?"))) return;
    const text = await file.text();
    try {
      const dump = JSON.parse(text);
      await Data.importAll(dump);
      toast("Copia importada");
      overlay.remove();
      await renderApp();
    } catch (err) {
      toast("El archivo no es válido");
    }
  });
}

export { state, root, h, toast, refresh, showFormModal, confirmAction, renderApp, openTripForm, withTransition, installSwipeBack, installAndroidBackHandling, installModalSwipeToClose, installReturnSplash, openDiscoverSheet, openMapsAppPicker, openRegisterInviteSheet, hasProAccess, PAID_QUERY_LIMIT, checkPaidQueryLimit, bumpPaidQueryCount, openPaidQueryLimitSheet, syncPaidQueryLimitReached };

// ============================================================
// SEGURIDAD — PIN de bloqueo local
// ============================================================

function switchRowHtml(id, label, checked) {
  return h`
    <div class="switch-row">
      <span class="switch-row-label">${escapeHtml(label)}</span>
      <label class="switch">
        <input type="checkbox" id="${id}" ${checked ? "checked" : ""} />
        <span class="switch-track"></span>
      </label>
    </div>`;
}

async function openSecuritySheet() {
  const hasPin = await isPinSet();
  const bioAvailable = hasPin && (await isBiometricAvailable());
  const bioEnabled = bioAvailable && (await isBiometricEnabled());

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Seguridad</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        El PIN es opcional: mientras no lo actives, la app abre directo.
        Una vez activado, pide un código cada vez que abres la app o
        vuelves a ella tras cambiar de app. Solo vive en este dispositivo
        — si lo olvidas, no hay forma de recuperarlo salvo borrar los
        datos de la app.
      </p>
      ${switchRowHtml("sec-pin-switch", "PIN de bloqueo", hasPin)}
      ${
        hasPin
          ? `<div class="modal-actions" style="margin-top:6px;"><button class="btn btn-secondary" id="sec-change-pin">🔁 Cambiar PIN</button></div>`
          : ""
      }
      ${bioAvailable ? switchRowHtml("sec-bio-switch", "Face ID / huella", bioEnabled) : ""}
      <div class="modal-actions" style="margin-top:16px;"><button class="btn btn-ghost" id="sec-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#sec-close").addEventListener("click", () => overlay.remove());

  const pinSwitch = overlay.querySelector("#sec-pin-switch");
  pinSwitch.addEventListener("change", async () => {
    const turningOn = pinSwitch.checked;
    pinSwitch.disabled = true;
    if (turningOn) {
      const ok = await promptNewPin();
      pinSwitch.disabled = false;
      if (!ok) {
        pinSwitch.checked = false;
        return;
      }
    } else {
      const current = await promptModal({ title: "Confirma tu PIN", message: "Para quitarlo, introduce tu PIN actual.", inputType: "password", inputMode: "numeric" });
      pinSwitch.disabled = false;
      if (current === null) {
        pinSwitch.checked = true;
        return;
      }
      const ok = await verifyPin(current);
      if (!ok) {
        toast("PIN incorrecto");
        pinSwitch.checked = true;
        return;
      }
      await removePin();
      toast("PIN desactivado");
    }
    overlay.remove();
    openSecuritySheet();
  });

  const changePinBtn = overlay.querySelector("#sec-change-pin");
  if (changePinBtn) {
    changePinBtn.addEventListener("click", async () => {
      const current = await promptModal({ title: "Introduce tu PIN actual", inputType: "password", inputMode: "numeric" });
      if (current === null) return;
      const ok = await verifyPin(current);
      if (!ok) {
        toast("PIN incorrecto");
        return;
      }
      overlay.remove();
      await promptNewPin();
      openSecuritySheet();
    });
  }

  if (bioAvailable) {
    const bioSwitch = overlay.querySelector("#sec-bio-switch");
    bioSwitch.addEventListener("change", async () => {
      const turningOn = bioSwitch.checked;
      bioSwitch.disabled = true;
      if (turningOn) {
        const ok = await enableBiometric();
        bioSwitch.disabled = false;
        if (!ok) {
          toast("No se pudo activar (cancelado o no disponible)");
          bioSwitch.checked = false;
          return;
        }
        toast("Face ID / huella activado");
      } else {
        await disableBiometric();
        bioSwitch.disabled = false;
        toast("Face ID / huella desactivado");
      }
    });
  }
}

async function promptNewPin() {
  const pin = await promptModal({ title: "Elige un PIN", message: "Entre 4 y 6 números.", inputType: "password", inputMode: "numeric" });
  if (pin === null) return false;
  if (!/^\d{4,6}$/.test(pin)) {
    toast("El PIN debe tener entre 4 y 6 números");
    return false;
  }
  const confirmPin = await promptModal({ title: "Repite el PIN", inputType: "password", inputMode: "numeric" });
  if (confirmPin !== pin) {
    toast("No coincide, inténtalo de nuevo");
    return false;
  }
  await setPin(pin);
  toast("PIN activado");
  return true;
}

// ============================================================
// CUENTA — email/contraseña + copia en la nube (Firestore)
// ============================================================

async function openAccountSheet() {
  const user = currentUser();

  if (!user) {
    renderAuthForm();
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Tu cuenta</h2>
      <p style="color:var(--muted); font-size:13.5px; margin-top:-10px;">${escapeHtml(user.email)}</p>
      <p style="color:var(--muted); font-size:12.5px; line-height:1.5;">
        ${icon("refresh", "stat-icon")} Sincronización automática activada: tus cambios se guardan solos
        en la nube unos segundos después de hacerlos, y se descargan solos
        al abrir la app en otro dispositivo con esta misma cuenta.
      </p>
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn btn-primary" id="acc-push">${icon("upload")} Forzar subida ahora</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="acc-pull">${icon("download")} Forzar descarga ahora</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" id="acc-logout">Cerrar sesión</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="acc-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#acc-close").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#acc-push").addEventListener("click", async () => {
    toast("Subiendo…");
    const res = await pushToCloud();
    toast(res.ok ? "Copia subida a la nube" : res.error);
  });

  overlay.querySelector("#acc-pull").addEventListener("click", async () => {
    if (!(await confirmAction("Esto sustituirá los datos de este dispositivo por los de la nube. ¿Continuar?"))) return;
    toast("Descargando…");
    const res = await pullFromCloud();
    if (res.ok) {
      toast("Datos actualizados desde la nube");
      overlay.remove();
      await renderApp();
    } else if (res.empty) {
      toast("Todavía no hay ninguna copia en la nube");
    } else {
      toast(res.error);
    }
  });

  overlay.querySelector("#acc-logout").addEventListener("click", async () => {
    await signOutUser();
    toast("Sesión cerrada");
    overlay.remove();
    await renderApp();
  });
}

function renderAuthForm() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Iniciar sesión</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Crea una cuenta para tener una copia de tus viajes en la nube, además de en
        este dispositivo. Es opcional — la app sigue funcionando sin cuenta.
      </p>
      <div class="modal-actions" style="margin-top:14px;">
        <button class="btn btn-secondary" id="auth-google">${googleIcon()} Continuar con Google</button>
      </div>
      <div class="auth-divider"><span>o con tu email</span></div>
      <div class="field">
        <label>Email</label>
        <input type="email" id="auth-email" autocomplete="email" />
      </div>
      <div class="field">
        <label>Contraseña</label>
        <input type="password" id="auth-password" autocomplete="current-password" placeholder="Mínimo 6 caracteres" />
      </div>
      <p id="auth-error" style="color:#ff8b7f; font-size:12.5px; min-height:16px;"></p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="auth-login">Iniciar sesión</button>
      </div>
      <div class="auth-divider"><span>¿Cuenta nueva?</span></div>
      <div class="field">
        <label>${t("auth_firstname_label")}</label>
        <input type="text" id="auth-firstname" autocomplete="given-name" />
      </div>
      <div class="field">
        <label>${t("auth_lastname_label")}</label>
        <input type="text" id="auth-lastname" autocomplete="family-name" />
      </div>
      <div class="field">
        <label>${t("auth_birthdate_label")}</label>
        <input type="date" id="auth-birthdate" autocomplete="bday" />
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="auth-signup">Crear cuenta nueva</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="auth-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#auth-close").addEventListener("click", () => overlay.remove());

  const errorEl = overlay.querySelector("#auth-error");
  const emailEl = overlay.querySelector("#auth-email");
  const passEl = overlay.querySelector("#auth-password");
  const firstNameEl = overlay.querySelector("#auth-firstname");
  const lastNameEl = overlay.querySelector("#auth-lastname");
  const birthdateEl = overlay.querySelector("#auth-birthdate");

  overlay.querySelector("#auth-google").addEventListener("click", async (e) => {
    errorEl.textContent = "";
    const btn = e.currentTarget;
    btn.disabled = true;
    const birthDate = birthdateEl.value || null;
    const { user, error, cancelled, redirecting } = await signInWithGoogle();
    if (redirecting) return; // la página está navegando a Google, no hay más que hacer aquí
    btn.disabled = false;
    if (cancelled) return;
    if (error) { errorEl.textContent = error; return; }
    overlay.remove();
    await afterLogin(user);
    // El nombre ya viene de la cuenta de Google; solo falta la fecha
    // de nacimiento, que Google no comparte, si la escribió.
    if (birthDate) await saveBirthDate(birthDate);
  });

  overlay.querySelector("#auth-login").addEventListener("click", async () => {
    errorEl.textContent = "";
    const { user, error } = await signIn(emailEl.value.trim(), passEl.value);
    if (error) { errorEl.textContent = error; return; }
    overlay.remove();
    await afterLogin(user);
  });

  overlay.querySelector("#auth-signup").addEventListener("click", async () => {
    errorEl.textContent = "";
    const displayName = [firstNameEl.value.trim(), lastNameEl.value.trim()].filter(Boolean).join(" ");
    const birthDate = birthdateEl.value || null;
    const { user, error } = await signUp(emailEl.value.trim(), passEl.value, displayName || undefined);
    if (error) { errorEl.textContent = error; return; }
    overlay.remove();
    // Cuenta recién creada: subimos lo que ya haya en este dispositivo.
    toast("Cuenta creada, subiendo tus datos…");
    await pushToCloud();
    if (birthDate) await saveBirthDate(birthDate);
    await renderApp();
  });
}

async function afterLogin(user) {
  // A lo mejor esfuerzo: se guarda una copia local de la fecha de
  // nacimiento (si la cuenta tiene una) para poder usarla más
  // adelante (p. ej. felicitar el cumpleaños) sin depender de la red.
  getBirthDate()
    .then((birthDate) => birthDate && Data.settingSet("profile_birth_date", birthDate))
    .catch(() => {});

  const hasBackup = await cloudHasBackup();
  if (!hasBackup) {
    toast("Sesión iniciada. Subiendo tus datos de este dispositivo…");
    await pushToCloud();
    await renderApp();
    return;
  }

  // Siempre que ya exista una copia en la nube, se descarga y sustituye
  // los datos de este dispositivo sin preguntar (la nube manda).
  toast("Sesión iniciada. Descargando tus viajes…");
  await pullFromCloud();
  await renderApp();
}

// ============================================================
// AJUSTES (⚙️) — menú principal con acceso a cuenta, copia de
// seguridad, perfil, tema, notificaciones, PIN y privacidad.
// ============================================================

function openSettingsSheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${t("settings_title")}</h2>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-profile">${icon("luggage")} ${t("settings_profile")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-join-shared">${icon("link")} ${t("settings_join_shared")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-config">${icon("settings")} ${t("settings_config")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-dev">${icon("flask")} ${t("settings_dev")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-cache">${icon("cloud")} ${t("settings_cache")}</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="st-close">${t("common_close")}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#st-close").addEventListener("click", () => overlay.remove());

  const go = (id, fn) =>
    overlay.querySelector(id).addEventListener("click", () => {
      openSubSheet(overlay, fn);
    });
  go("#st-profile", openProfileSheet);
  go("#st-join-shared", openJoinTripSheet);
  go("#st-config", openConfigSheet);
  go("#st-dev", openDevModeSheet);
  go("#st-cache", openCacheUsageSheet);
}

// ------------------------------------------------------------
// CONFIGURACIÓN — submenú con copia de seguridad, tema, idioma,
// notificaciones, seguridad y legal, agrupados aparte del menú
// principal de ajustes.
// ------------------------------------------------------------

function openConfigSheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${t("settings_config")}</h2>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-backup">${icon("cloud")} ${t("settings_backup")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-theme">${icon("theme")} ${t("settings_theme")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-language">${icon("globe")} ${t("settings_language")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-notifications">${icon("bell")} ${t("settings_notifications")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-security">${icon("lock")} ${t("settings_security")}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="cfg-legal">${icon("shield")} ${t("settings_privacy")}</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="cfg-close">${t("common_close")}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#cfg-close").addEventListener("click", () => overlay.remove());

  const go = (id, fn) =>
    overlay.querySelector(id).addEventListener("click", () => {
      openSubSheet(overlay, fn);
    });
  go("#cfg-backup", openBackupSheet);
  go("#cfg-theme", openThemeSheet);
  go("#cfg-language", openLanguageSheet);
  go("#cfg-notifications", openNotificationsSheet);
  go("#cfg-security", openSecuritySheet);
  go("#cfg-legal", openLegalSheet);
}

async function openLanguageSheet() {
  const current = await getLanguage();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const opt = (code) =>
    `<button class="btn ${current === code ? "btn-primary" : "btn-secondary"}" data-lang-opt="${code}">${LANGUAGES[code].name}</button>`;
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${icon("globe")} ${t("settings_language")}</h2>
      <p style="color:var(--muted); font-size:12.5px; margin-top:-10px;">${t("lang_system_note")}</p>
      <div class="modal-actions">${opt("es")}</div>
      <div class="modal-actions">${opt("en")}</div>
      <div class="modal-actions">${opt("pt")}</div>
      <div class="modal-actions">${opt("zh")}</div>
      <div class="modal-actions">${opt("ar")}</div>
      <div class="modal-actions"><button class="btn btn-ghost" id="lang-close">${t("common_close")}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#lang-close").addEventListener("click", () => overlay.remove());
  overlay.querySelectorAll("[data-lang-opt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.langOpt;
      await setLanguage(value);
      overlay.remove();
      toast(t("lang_updated"));
      await renderApp();
    });
  });
}

// ------------------------------------------------------------
// USO DE CACHÉ — cuánto espacio ocupa la app en este dispositivo
// (app shell + teselas de mapa vistas) y botón para vaciarlo.
// ------------------------------------------------------------

async function openCacheUsageSheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Uso de caché</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6;">
        Para poder abrir sin conexión, la app guarda en este dispositivo una
        copia de sus propios archivos y de las teselas del mapa que ya has
        visto. Tus viajes NO están aquí — viven aparte, en la base de datos
        local (y en la nube si tienes cuenta), así que vaciar esto nunca
        borra ningún dato tuyo.
      </p>
      <div id="cache-usage-value" style="text-align:center; margin:18px 0;">
        <p style="font-size:28px; font-weight:800; margin:0;">Calculando…</p>
        <p style="color:var(--muted); font-size:12.5px; margin:2px 0 0;">espacio usado en este dispositivo</p>
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" id="cache-clear">${icon("trash")} Vaciar caché ahora</button>
      </div>
      <p style="color:var(--muted); font-size:11.5px; line-height:1.5;">
        Después de vaciarla, la app sigue funcionando igual — solo tendrá
        que volver a descargar sus archivos y las teselas de mapa la
        próxima vez que las necesite (hace falta conexión ese primer momento).
      </p>
      <div class="modal-actions"><button class="btn btn-ghost" id="cache-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#cache-close").addEventListener("click", () => overlay.remove());

  const valueEl = overlay.querySelector("#cache-usage-value");
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const { usage } = await navigator.storage.estimate();
      const mb = (usage || 0) / (1024 * 1024);
      const label = mb < 1 ? `${Math.round(usage / 1024)} KB` : `${mb.toFixed(1)} MB`;
      valueEl.querySelector("p").textContent = label;
    } catch (err) {
      valueEl.querySelector("p").textContent = "—";
    }
  } else {
    valueEl.querySelector("p").textContent = "—";
  }

  overlay.querySelector("#cache-clear").addEventListener("click", async () => {
    if (!(await confirmAction("Se borrará el app shell guardado y el mapa descargado para sin conexión (tus viajes no se tocan). ¿Continuar?"))) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      toast("Caché vaciada");
      overlay.remove();
    } catch (err) {
      toast("No se pudo vaciar la caché");
    }
  });
}

// ------------------------------------------------------------
// MODO DESARROLLADOR — interruptor de "Pro" mientras se construyen
// esas funciones sin tener montado ningún cobro real todavía.
// ------------------------------------------------------------

async function openDevModeSheet() {
  const pro = await isPro();
  const aiMock = isAiCopilotMockEnabled();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Modo desarrollador</h2>
      <p style="color:var(--muted); font-size:12.5px; line-height:1.6;">
        Interruptor temporal para probar las funciones Pro (compartir
        viaje, avisos de vuelo, copiloto de IA, ordenar ruta, viajes
        ilimitados...) sin tener todavía cobros de verdad integrados.
        Cuando se active el pago real, esto se sustituirá por la
        confirmación de la compra.
      </p>
      <div class="modal-actions" style="margin-top:8px;">
        <button class="btn ${pro ? "btn-danger" : "btn-primary"}" id="dev-pro-toggle">
          ${pro ? "🧪 Desactivar modo Pro" : "🧪 Activar modo Pro (pruebas)"}
        </button>
      </div>
      <p style="color:var(--muted); font-size:12.5px; line-height:1.6; margin-top:14px;">
        🤖 <b>Copiloto IA — mock local (TEMPORAL):</b> con esto activado,
        "Generar con IA" usa un servidor de ejemplo
        (js/mock-ai-copilot-server.js) en vez de tu Cloud Function real,
        para probar la interfaz sin gastar créditos de la API.
        ${aiMock ? `URL actual: <code>${escapeHtmlDev(getAiCopilotMockUrl())}</code>.` : ""}
        Si vas a probar desde el móvil contra la app publicada,
        pon aquí la URL de un túnel (ngrok, etc.) que apunte a tu
        ordenador, no "localhost". Quítalo cuando ya no lo necesites.
      </p>
      <div class="modal-actions">
        <button class="btn ${aiMock ? "btn-danger" : "btn-secondary"}" id="dev-ai-mock-toggle">
          ${aiMock ? "🤖 Desactivar mock del Copiloto IA" : "🤖 Activar mock del Copiloto IA (dev)"}
        </button>
      </div>
      ${aiMock ? `<div class="modal-actions"><button class="btn btn-secondary" id="dev-ai-mock-url">${icon("link")} Cambiar URL del mock</button></div>` : ""}
      <div class="modal-actions"><button class="btn btn-ghost" id="dev-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#dev-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#dev-pro-toggle").addEventListener("click", async () => {
    await setPro(!pro);
    toast(!pro ? "Modo Pro activado" : "Modo Pro desactivado");
    overlay.remove();
  });
  overlay.querySelector("#dev-ai-mock-toggle").addEventListener("click", () => {
    if (!aiMock) {
      const url = prompt(
        "URL del mock (usa la de tu túnel ngrok si vas a probar desde el móvil; deja la de localhost si pruebas solo desde este ordenador):",
        getAiCopilotMockUrl()
      );
      if (url === null) return; // canceló
      setAiCopilotMockUrl(url.trim());
    }
    setAiCopilotMockEnabled(!aiMock);
    toast(!aiMock ? "Mock del Copiloto IA activado" : "Mock del Copiloto IA desactivado");
    overlay.remove();
  });
  const urlBtn = overlay.querySelector("#dev-ai-mock-url");
  if (urlBtn) {
    urlBtn.addEventListener("click", () => {
      const url = prompt("Nueva URL del mock:", getAiCopilotMockUrl());
      if (url === null) return;
      setAiCopilotMockUrl(url.trim());
      toast("URL del mock actualizada");
      overlay.remove();
    });
  }
}

// Pequeño escape de texto local para no depender de otro módulo aquí.
function escapeHtmlDev(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Abre un sub-panel de Ajustes ocultando temporalmente `parentOverlay`
 * (el menú principal) en vez de cerrarlo. En cuanto ya no quede
 * ningún otro overlay abierto (el sub-panel se cerró, se guardó algo,
 * o se canceló), el menú de Ajustes vuelve a aparecer solo — así
 * "Cerrar" dentro de un submenú regresa al menú, no a la pantalla de
 * fondo.
 */
function openSubSheet(parentOverlay, openFn) {
  // Con más de un nivel de anidado (p. ej. Ajustes → Perfil → Sesión) hay
  // varios de estos observers activos a la vez sobre el mismo document.body,
  // y el orden en que el navegador dispara sus callbacks no está garantizado.
  // Por eso cada llamada recuerda qué overlays existían ANTES de abrir la
  // suya (incluido cualquier abuelo ya oculto) y solo se fija en si LOS
  // SUYOS propios siguen abiertos, sin depender de si otro observer ya
  // restauró o no un antepasado.
  const before = new Set(document.querySelectorAll(".modal-overlay"));
  parentOverlay.style.display = "none";
  openFn();

  const observer = new MutationObserver(() => {
    const stillOpen = Array.from(document.querySelectorAll(".modal-overlay")).some(
      (el) => el !== parentOverlay && !before.has(el)
    );
    if (!stillOpen) {
      observer.disconnect();
      if (document.body.contains(parentOverlay)) {
        parentOverlay.style.display = "";
      }
    }
  });
  observer.observe(document.body, { childList: true });
}

// ------------------------------------------------------------
// TEMA — claro / oscuro / automático (según el sistema)
// ------------------------------------------------------------

const THEME_KEY = "theme_pref";

function applyTheme(pref) {
  if (pref === "light" || pref === "dark") {
    document.documentElement.dataset.theme = pref;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** Se llama al arrancar la app, antes del primer render, para aplicar
 * el tema guardado y evitar el parpadeo del tema por defecto. */
async function loadTheme() {
  const pref = (await Data.settingGet(THEME_KEY)) || "system";
  applyTheme(pref);
}

async function openThemeSheet() {
  const current = (await Data.settingGet(THEME_KEY)) || "system";
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const opt = (value, label) =>
    `<button class="btn ${current === value ? "btn-primary" : "btn-secondary"}" data-theme-opt="${value}">${label}</button>`;
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Tema</h2>
      <div class="modal-actions">${opt("light", "☀️ Claro")}</div>
      <div class="modal-actions">${opt("dark", "🌙 Oscuro")}</div>
      <div class="modal-actions">${opt("system", "📱 Automático (del sistema)")}</div>
      <div class="modal-actions"><button class="btn btn-ghost" id="theme-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#theme-close").addEventListener("click", () => overlay.remove());
  overlay.querySelectorAll("[data-theme-opt]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const value = btn.dataset.themeOpt;
      await Data.settingSet(THEME_KEY, value);
      applyTheme(value);
      overlay.remove();
      toast("Tema actualizado");
    });
  });
}

// ------------------------------------------------------------
// NOTIFICACIONES — recordatorios locales de vuelos/actividades del
// día (API Notification del navegador, sin servidor propio).
// ------------------------------------------------------------

const NOTIF_KEY = "notifications_enabled";
const FLIGHT_ALERTS_KEY = "flight_alerts_enabled";
const NOTIFIED_SET_KEY = "notified_reminders";
// Este chequeo se repite cada 15 minutos mientras un vuelo esté
// dentro de las 24h previas a su salida (ver checkAndNotifyToday);
// sin guardar el resultado, cada repaso volvería a gastar una de las
// PAID_QUERY_LIMIT consultas gratis del vuelo. Se guarda una vez por
// vuelo (incluido "no se encontró nada") y se reutiliza el resto de
// repasos de esas mismas 24 horas.
const FLIGHT_STATUS_CACHE_KEY = "flight_status_query_cache";

const FLIGHT_LEAD_HOURS = 24;
const HOTEL_RESERVATION_LEAD_HOURS = 24;
// Los hoteles no siempre tienen hora de check-in guardada — si no se
// indicó ninguna, se asume las 14:00 para poder calcular el aviso de
// "24 horas antes". Si se guardó una hora, se usa esa.
const DEFAULT_CHECKIN_HOUR = 14;
const NOTIFIED_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 días

async function openNotificationsSheet() {
  const enabledRaw = await Data.settingGet(NOTIF_KEY);
  const enabled = enabledRaw === true || enabledRaw === 1;
  const permission = "Notification" in window ? Notification.permission : "unsupported";

  const pro = await hasProAccess();
  const flightAlertsRaw = await Data.settingGet(FLIGHT_ALERTS_KEY);
  const flightAlertsOn = flightAlertsRaw === true || flightAlertsRaw === 1;

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Notificaciones</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Si las activas, la app te avisará <b>24 horas antes</b> de cada
        vuelo (con la hora que hayas puesto) y <b>24 horas antes</b>
        del check-in de cada hotel (con su hora si la indicaste, o a
        las 14:00 si no). También avisa si tienes alguna actividad
        programada para hoy. Se generan en este dispositivo, sin
        servidor externo — eso sí, solo mientras tengas la app abierta
        en una pestaña (los navegadores no dejan avisar en segundo
        plano sin un servidor propio detrás).
      </p>
      ${permission === "unsupported" ? `<p style="color:var(--muted); font-size:13px;">Tu navegador no admite notificaciones.</p>` : ""}
      ${permission === "denied" ? `<p style="color:var(--rose); font-size:13px;">Están bloqueadas en el navegador. Actívalas desde los ajustes del sitio.</p>` : ""}
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn ${enabled ? "btn-danger" : "btn-primary"}" id="notif-toggle" ${permission === "unsupported" ? "disabled" : ""}>
          ${enabled ? "🔕 Desactivar notificaciones" : "🔔 Activar notificaciones"}
        </button>
      </div>
      <div class="field-check" style="margin-top:14px;">
        <input type="checkbox" id="flight-alerts-check" ${flightAlertsOn ? "checked" : ""} />
        <label for="flight-alerts-check" style="margin:0;">✈️ Avisos de estado de vuelo (Pro)</label>
      </div>
      <p style="color:var(--muted); font-size:12px; line-height:1.5;">
        ${
          pro
            ? `Añade el retraso y la puerta de embarque a los avisos de hoy, cuando estén disponibles (${PAID_QUERY_LIMIT} usos gratis al día por cuenta; luego, próximamente por suscripción).`
            : "Función Pro — regístrate para activarla."
        }
      </p>
      <div class="modal-actions"><button class="btn btn-ghost" id="notif-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#notif-close").addEventListener("click", () => overlay.remove());

  const flightCheck = overlay.querySelector("#flight-alerts-check");
  flightCheck.addEventListener("change", async () => {
    if (!pro) {
      flightCheck.checked = false;
      overlay.remove();
      openRegisterInviteSheet("Los avisos de estado de vuelo requieren tener una cuenta.");
      return;
    }
    await Data.settingSet(FLIGHT_ALERTS_KEY, flightCheck.checked);
    toast(flightCheck.checked ? "Avisos de vuelo activados" : "Avisos de vuelo desactivados");
  });

  overlay.querySelector("#notif-toggle").addEventListener("click", async () => {
    if (enabled) {
      await Data.settingSet(NOTIF_KEY, false);
      toast("Notificaciones desactivadas");
      overlay.remove();
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("No se concedió permiso para notificar");
      return;
    }
    await Data.settingSet(NOTIF_KEY, true);
    toast("Notificaciones activadas");
    overlay.remove();
    checkAndNotifyToday();
  });
}

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

async function getNotifiedSet() {
  const raw = await Data.settingGet(NOTIFIED_SET_KEY);
  const set = raw && typeof raw === "object" ? raw : {};
  // Limpieza: no dejar que esto crezca para siempre.
  const cutoff = Date.now() - NOTIFIED_TTL_MS;
  for (const key of Object.keys(set)) {
    if (set[key] < cutoff) delete set[key];
  }
  return set;
}

/** Revisa si hay vuelos, reservas de hotel o actividades a punto de
 * empezar y lanza una notificación local por cada aviso que toque
 * (una vez cada uno, nunca se repite). Se llama al arrancar la app y
 * periódicamente mientras esté abierta; nunca rompe nada si falla
 * (sin permiso, navegador sin soporte, etc.). */
async function checkAndNotifyToday() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const enabled = await Data.settingGet(NOTIF_KEY);
    if (!enabled) return;

    const notified = await getNotifiedSet();
    const flightAlertsOn = await Data.settingGet(FLIGHT_ALERTS_KEY);
    const useFlightStatus = flightAlertsOn && (await hasProAccess()) && isFlightStatusConfigured();
    const flightStatusCacheRaw = await Data.settingGet(FLIGHT_STATUS_CACHE_KEY);
    const flightStatusCache = flightStatusCacheRaw && typeof flightStatusCacheRaw === "object" ? flightStatusCacheRaw : {};
    let idToken = null;
    let changed = false;
    let flightStatusCacheChanged = false;

    async function fire(key, body) {
      if (notified[key]) return;
      new Notification("Viajoo", { body });
      notified[key] = Date.now();
      changed = true;
    }

    const today = todayString();
    const trips = await Data.getAll("trips");

    for (const trip of trips) {
      const [flights, hotels, itin] = await Promise.all([
        Data.getAllByTrip("flights", trip.id),
        Data.getAllByTrip("hotels", trip.id),
        Data.getAllByTrip("itinerary", trip.id),
      ]);

      // Vuelos: aviso 24 horas antes de la salida.
      for (const f of flights) {
        const departure = combineDateTime(f.date, f.time, 9);
        if (!isWithinLead(departure, FLIGHT_LEAD_HOURS)) continue;

        let extra = "";
        if (useFlightStatus && f.flight_number) {
          const cacheKey = String(f.id);
          if (cacheKey in flightStatusCache) {
            const info = flightStatusCache[cacheKey];
            if (info) {
              if (info.delayMin > 0) extra += ` · retraso de ${info.delayMin} min`;
              if (info.gate) extra += ` · puerta ${info.gate}`;
            }
          } else if ((await getPaidQueryCount("flight")) >= PAID_QUERY_LIMIT) {
            // Sin ventana emergente (esto corre en segundo plano, cada
            // 15 min): un aviso único en el mismo canal de
            // notificaciones que el resto.
            await fire(
              "paidlimit:flight",
              `✈️ Límite de ${PAID_QUERY_LIMIT} avisos de vuelo con datos en vivo alcanzado hoy. Consultas ilimitadas próximamente con la suscripción.`
            );
          } else {
            if (!idToken) idToken = await getIdToken();
            if (idToken) {
              const info = await getFlightStatus(f.flight_number, f.date, idToken);
              if (info && info.limitReached) {
                // El límite lo acaba de imponer el servidor (por
                // ejemplo, ya se gastó desde otro dispositivo hoy):
                // se sincroniza el espejo local y se avisa una vez,
                // sin marcar este vuelo en caché (mañana vuelve a
                // haber cupo y se reintenta solo).
                await markPaidQueryLimitReached("flight");
                await fire(
                  "paidlimit:flight",
                  `✈️ Límite de ${PAID_QUERY_LIMIT} avisos de vuelo con datos en vivo alcanzado hoy. Consultas ilimitadas próximamente con la suscripción.`
                );
              } else {
                flightStatusCache[cacheKey] = info || null;
                flightStatusCacheChanged = true;
                await bumpPaidQueryCount("flight");
                if (info) {
                  if (info.delayMin > 0) extra += ` · retraso de ${info.delayMin} min`;
                  if (info.gate) extra += ` · puerta ${info.gate}`;
                }
              }
            }
          }
        }
        await fire(
          `flight:${f.id}:24h`,
          `✈️ Tu vuelo ${f.flight_number || ""} (${trip.destination}) sale en 24 horas${extra}`
        );
      }

      // Hoteles: aviso 24 horas antes del check-in. Usa la hora
      // indicada en el registro si se guardó; si no, 14:00 por defecto.
      for (const hRec of hotels) {
        const checkIn = combineDateTime(hRec.check_in, hRec.check_in_time, DEFAULT_CHECKIN_HOUR);
        if (!isWithinLead(checkIn, HOTEL_RESERVATION_LEAD_HOURS)) continue;
        await fire(
          `hotel:${hRec.id}:reserva24h`,
          `🏨 Tu reserva en ${hRec.name} (${trip.destination}) empieza en 24 horas`
        );
      }

      // Actividades de hoy: un aviso simple, una vez por día y viaje.
      const todayEvents = itin.filter((i) => i.date === today);
      if (todayEvents.length) {
        await fire(
          `itin:${trip.id}:${today}`,
          `📍 ${todayEvents.length} actividad(es) hoy en ${trip.destination}`
        );
      }
    }

    if (changed) await Data.settingSet(NOTIFIED_SET_KEY, notified);
    if (flightStatusCacheChanged) await Data.settingSet(FLIGHT_STATUS_CACHE_KEY, flightStatusCache);
  } catch (err) {
    // sin permiso, sin soporte, o cualquier fallo: no pasa nada
  }
}

// ============================================================
// FELICITACIÓN DE CUMPLEAÑOS — usa la fecha de nacimiento guardada en
// el perfil (ver saveBirthDate/profile_birth_date en cloud.js/afterLogin)
// para saludar una vez al año, el día que toque. A propósito NO depende
// del permiso de notificaciones del navegador (mucha gente no lo da):
// el toast en pantalla lo ve todo el mundo con sesión iniciada; la
// notificación del navegador es solo un extra para quien las activó.
// ============================================================
const BIRTHDAY_GREETED_KEY = "birthday_greeted_year";

async function checkBirthday() {
  try {
    const user = currentUser();
    if (!user) return; // solo tiene sentido con cuenta (es su fecha, no la del dispositivo)

    const birthDate = await Data.settingGet("profile_birth_date");
    if (!birthDate) return;
    const [, month, day] = birthDate.split("-").map(Number);
    if (!month || !day) return;

    const now = new Date();
    if (now.getMonth() + 1 !== month || now.getDate() !== day) return;

    const alreadyGreeted = await Data.settingGet(BIRTHDAY_GREETED_KEY);
    if (alreadyGreeted === now.getFullYear()) return;
    await Data.settingSet(BIRTHDAY_GREETED_KEY, now.getFullYear());

    const firstName = user.displayName ? user.displayName.trim().split(/\s+/)[0] : "";
    const message = `🎉 ¡Feliz cumpleaños${firstName ? ", " + firstName : ""}! Que este año venga cargado de viajes.`;
    toast(message);
    if ("Notification" in window && Notification.permission === "granted" && (await Data.settingGet(NOTIF_KEY))) {
      new Notification("Viajoo", { body: message });
    }
  } catch (err) {
    // sin fecha guardada, sin sesión, o cualquier fallo: no pasa nada
  }
}

// ============================================================
// LEGAL — aviso legal (LSSI), privacidad y protección de datos,
// términos de uso, propiedad intelectual, cookies, contacto y
// reclamaciones, condiciones de suscripción, y licencias de
// terceros. Todo bajo Ajustes → Legal.
//
// Los datos identificativos del titular (nombre, DNI/NIF, domicilio,
// email de contacto) van entre corchetes como [PLACEHOLDER]: hay que
// rellenarlos con los datos reales antes de publicar la app, y no se
// han inventado unos de mentira aquí a propósito. Esto no sustituye
// una revisión por un abogado — son plantillas con una estructura
// estándar (LSSI, RGPD/LOPDGDD, normativa de consumidores), no
// asesoría legal.
// ============================================================

function openLegalTextSheet(title, text) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      <div style="max-height:55vh; overflow-y:auto; font-size:13px; line-height:1.7; color:var(--muted-dark); white-space:pre-wrap; margin:4px 0 16px;">${escapeHtml(text)}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="legal-text-close">Entendido</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#legal-text-close").addEventListener("click", () => overlay.remove());
}

const LEGAL_NOTICE_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Identificación del titular
En cumplimiento del deber de información de la Ley 34/2002, de 11 de
julio, de Servicios de la Sociedad de la Información y de Comercio
Electrónico (LSSI-CE), se informa de que Viajoo es un proyecto
personal cuyo titular es:

Titular: [NOMBRE Y APELLIDOS]
DNI/NIF: [DNI/NIF]
Domicilio: [DOMICILIO]
Correo de contacto: [EMAIL DE CONTACTO]

Por ahora Viajoo es una aplicación personal en fase de
desarrollo y pruebas, sin actividad económica real todavía: la
función Pro no cobra nada mientras tanto (ver "Condiciones de
suscripción"). Si eso cambia, este aviso se actualizará con los datos
de actividad económica que correspondan.

2. Objeto
Viajoo es una aplicación web (PWA) para organizar viajes:
itinerario, vuelos, hoteles, gastos, documentos y contenido
relacionado, guardado principalmente en el propio dispositivo de
quien la usa.

3. Condiciones de acceso y uso
El acceso a Viajoo es gratuito, salvo por las funciones
marcadas como "Pro" (ver Condiciones de suscripción). Usar la
aplicación implica aceptar este Aviso Legal, los Términos y
Condiciones de Uso, y la Política de Privacidad.

4. Legislación aplicable y fuero
Estas condiciones se rigen por la legislación española. Para
cualquier controversia que no se resuelva por el canal de contacto y
reclamaciones, y cuando la persona usuaria tenga la condición de
consumidora, se estará a lo dispuesto por la normativa de protección
de consumidores en cuanto a juzgados y tribunales competentes.
`.trim();

const PRIVACY_POLICY_TEXT = `
Última actualización: ${new Date().getFullYear()}

Responsable del tratamiento
[NOMBRE Y APELLIDOS], con DNI/NIF [DNI/NIF] y domicilio en
[DOMICILIO], es quien responde de los datos que trata esta aplicación.
Puedes escribir a [EMAIL DE CONTACTO] para cualquier duda sobre esta
política o para ejercer tus derechos.

1. Qué datos guarda Viajoo
Los datos de tus viajes (vuelos, hoteles, itinerario, transporte, reservas,
gastos y checklist) se guardan en tu propio dispositivo, en el
almacenamiento local del navegador (IndexedDB). No se envían a ningún
servidor salvo que actives voluntariamente la copia en la nube.

2. Cuenta y copia en la nube
Si creas una cuenta (con email y contraseña, o con tu cuenta de Google),
tus datos se guardan también en Firebase (Google) bajo tu usuario, para
poder recuperarlos en otro dispositivo. Puedes cerrar sesión y eliminar tu
cuenta cuando quieras. Las funciones básicas siguen funcionando sin
cuenta, de forma 100% local; las funciones Pro, en cambio, sí piden tener
una cuenta creada (gratuita, sin ningún cobro todavía) — ver Condiciones
de suscripción Pro.

3. Servicios externos que puede consultar la app
Para mostrar mapas, calcular rutas, encontrar fotos e imágenes reales de
tus vuelos, hoteles, actividades y transportes, descubrir lugares cercanos,
o convertir monedas, la app envía consultas puntuales (por ejemplo, un
nombre de lugar, unas coordenadas, o los códigos de dos monedas) a
servicios públicos de terceros: OpenStreetMap/Nominatim, OSRM y Overpass
(mapas, rutas y lugares cercanos), Wikipedia/Wikimedia Commons/Openverse
(fotos y descripciones), y Frankfurter/open.er-api (tipos de cambio).
Estas consultas no incluyen tu identidad ni el resto de tus datos, solo el
texto necesario para la búsqueda. Además, a diferencia de esas consultas
puntuales, en cada visita el navegador carga las tipografías de la app
(Plus Jakarta Sans, Inter e IBM Plex Mono) desde Google Fonts
(fonts.googleapis.com); esa carga, como la de cualquier recurso externo,
revela tu dirección IP a Google mientras descarga la fuente (ver también
Cookies y almacenamiento local).

4. Copiloto de viajes con IA (función Pro)
Al generar un itinerario con IA, el destino, las fechas y las preferencias
que escribes se envían a una función de servidor propia (Cloud Function),
que a su vez se los pasa a la API de Anthropic (Claude) para redactar la
propuesta. Solo viaja lo que escribes en ese formulario, nunca el resto de
tus datos guardados; la respuesta no se usa para nada más que mostrarte el
itinerario generado.

5. Avisos de estado de vuelo (función Pro)
Si activas esta función, el número de vuelo y la fecha se envían a una
función de servidor propia, que consulta AeroDataBox/RapidAPI para conocer
retrasos y puerta de embarque. Estos datos no pasan por ningún otro sitio.

6. Viajes compartidos (función Pro)
Si compartes un viaje con un código de 6 dígitos (o su QR, que solo
contiene ese mismo código), sus datos (vuelos, hoteles, itinerario...)
se guardan en un documento de Firestore accesible por quienes tengan
el código, además de en tu copia personal de la nube. Cualquiera con
el código o el QR puede ver y unirse a ese viaje mientras esté activo.
Al escanear un QR para unirte a un viaje, la app usa la cámara del
dispositivo solo mientras la ventana de escaneo está abierta: ese
vídeo nunca se guarda ni se envía a ningún sitio, solo se analiza en
el propio dispositivo para leer el código.

7. Notificaciones
Si activas los avisos, se generan en tu propio dispositivo a partir de tus
datos guardados localmente. No implican el envío de información a
servidores externos.

8. Exportar a PDF o al calendario del dispositivo
El PDF del itinerario y el archivo .ics para el calendario se generan
enteramente en tu dispositivo, a partir de tus datos guardados, y solo
cuando tú pulsas el botón correspondiente — nunca en automático ni en
segundo plano. El archivo .ics no se sincroniza con nada por su cuenta:
tienes que abrirlo tú mismo con tu app de calendario (Google Calendar,
Apple Calendar...) para decidir qué añadir.

9. PIN y desbloqueo biométrico
El PIN es opcional y, si lo activas, se guarda cifrado (hash) únicamente en
tu dispositivo. Si además activas Face ID/huella como atajo, la
verificación la hace tu propio sistema operativo: la app nunca recibe ni
guarda tu huella o tu cara, solo la confirmación de que el gesto se
completó. Nadie más que tú puede ver ni recuperar tu PIN.

10. Analítica y publicidad
Viajoo no usa herramientas de analítica ni de seguimiento, y no
muestra publicidad dentro de la app.

11. Base legal y conservación de tus datos
Tratamos tus datos para prestarte el servicio que pides (organizar tus
viajes) y, cuando das tu consentimiento expreso, para funciones
opcionales concretas (copia en la nube, PIN, biometría, notificaciones,
viajes compartidos). Tus datos se conservan mientras mantengas la app
instalada y, si tienes cuenta, hasta que la elimines o nos pidas que
la borremos.

12. Tus derechos
Tienes derecho a acceder, rectificar, suprimir, limitar y oponerte al
tratamiento de tus datos, y a la portabilidad de los mismos. Como la
mayoría de tus datos viven solo en tu dispositivo, ya ejerces varios de
estos derechos tú mismo desde Ajustes → Copiar / restaurar datos
(exportar o borrar) y Ajustes → Mi cuenta (eliminar la cuenta). Para lo
que no puedas hacer directamente, escríbenos a [EMAIL DE CONTACTO]. Si
consideras que no hemos atendido bien tu solicitud, puedes reclamar ante
la Agencia Española de Protección de Datos (www.aepd.es).

13. Transferencias internacionales
Firebase (Google) y Anthropic pueden tratar datos en servidores fuera
del Espacio Económico Europeo, acogidos a las garantías que exige el
RGPD (cláusulas contractuales tipo u otro mecanismo equivalente que
ofrezca cada proveedor).

14. Menores de edad
Viajoo no está dirigida a menores de 14 años. Si eres menor de
edad, necesitas el consentimiento de tus padres o tutores para crear
una cuenta o activar funciones que impliquen guardar datos en la nube.

15. Contacto
Si tienes dudas sobre tus datos o esta política, puedes escribirnos a
[EMAIL DE CONTACTO].
`.trim();

const TERMS_OF_USE_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Objeto y aceptación
Estas condiciones regulan el uso de Viajoo, una aplicación para
organizar viajes. Al usarla, aceptas estas condiciones, el Aviso Legal
y la Política de Privacidad. Si no estás de acuerdo, no uses la
aplicación.

2. Quién puede usarla
Viajoo no está dirigida a menores de 14 años. Si eres menor de
edad, necesitas el consentimiento de tus padres o tutores para crear
una cuenta.

3. Tu cuenta
Crear una cuenta es opcional. Si lo haces, eres responsable de
mantener segura tu contraseña y de la actividad que ocurra con tu
cuenta. Avísanos en [EMAIL DE CONTACTO] si sospechas un uso no
autorizado.

4. Uso aceptable
Te comprometes a usar Viajoo de forma lícita, sin:
- Intentar acceder a datos de otras personas usuarias sin autorización.
- Usar la función de compartir viajes para distribuir contenido
  ilegal, ofensivo o que infrinja derechos de terceros.
- Interferir con el funcionamiento de la app o de los servicios de
  terceros que consulta (mapas, tipos de cambio, IA...).

5. Contenido que introduces tú
Los datos de tus viajes (destinos, notas, fotos que subas si lo haces...)
son tuyos. Nos das permiso únicamente para procesarlos y mostrártelos a
ti (y a quien invites, si compartes un viaje), nunca para usarlos con
otro fin. Ver también Propiedad intelectual.

6. Disponibilidad del servicio
Viajoo depende en parte de servicios externos gratuitos (mapas,
tipos de cambio, geocodificación, IA...) que pueden fallar o dejar de
estar disponibles sin previo aviso; la app está pensada para seguir
funcionando con lo que ya tengas guardado localmente aunque eso pase.
No garantizamos que el servicio esté disponible de forma
ininterrumpida.

7. Cambios en la app y en estas condiciones
Podemos añadir, cambiar o retirar funciones, y actualizar estas
condiciones. Si el cambio es importante, avisaremos dentro de la app.
Seguir usando Viajoo después de un cambio implica que lo
aceptas.

8. Limitación de responsabilidad
Viajoo se ofrece "tal cual". Dentro de lo que permite la ley, no
respondemos de decisiones de viaje que tomes basándote en datos de la
app (tipos de cambio, estado de vuelos, itinerarios generados por
IA...) ni de fallos de los servicios externos que consulta. Revisa
siempre la información importante (horarios de vuelo, tipos de cambio,
reservas) con la fuente oficial antes de viajar.

9. Terminación
Puedes dejar de usar la app y borrar tus datos cuando quieras (Ajustes
→ Copiar / restaurar datos, o eliminar tu cuenta). Podemos suspender el
acceso a quien incumpla gravemente estas condiciones (por ejemplo,
abusando de la función de compartir viajes).

10. Legislación aplicable
Estas condiciones se rigen por la ley española (ver también Aviso
Legal).
`.trim();

const INTELLECTUAL_PROPERTY_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Titularidad
El código, el diseño, la marca "Viajoo" y los contenidos propios
de la aplicación (textos, iconos e interfaz) son propiedad de
[NOMBRE Y APELLIDOS], salvo el software de terceros con licencia propia
(ver Licencias).

2. Uso permitido
Puedes usar Viajoo para organizar tus propios viajes. No está
permitido copiar, modificar, distribuir o hacer ingeniería inversa de
la aplicación sin permiso, salvo lo que permita la ley o la licencia
del software de terceros que incluye.

3. Tus contenidos
Los datos y contenidos que introduces (notas, fotos que subas si lo
haces, nombres de tus viajes...) siguen siendo tuyos. Ver también la
sección "Contenido que introduces tú" de los Términos y Condiciones.

4. Contenido de terceros mostrado en la app
Algunas fotos, descripciones y datos de mapas que se muestran vienen de
fuentes de terceros con su propia licencia:
- Fotos e imágenes: Wikipedia, Wikimedia Commons y Openverse, bajo las
  licencias abiertas que indique cada imagen (mayoritariamente
  Creative Commons).
- Datos de mapas: © colaboradores de OpenStreetMap, licencia Open
  Database License (ODbL).
Estas fuentes se consultan solo para mostrarte información útil sobre
tu destino; no se reclama ninguna propiedad sobre ese contenido.

5. Marcas de terceros
Los nombres de aerolíneas, hoteles, monedas o cualquier otra marca que
escribas, o que aparezca a través de un servicio de terceros
consultado, son propiedad de sus respectivos titulares y se muestran
únicamente porque tú los has introducido o porque provienen de ese
servicio.

6. Reclamaciones de propiedad intelectual
Si crees que algo en la app infringe tus derechos de propiedad
intelectual, escríbenos a [EMAIL DE CONTACTO] con el detalle para poder
revisarlo.
`.trim();

const COOKIES_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Viajoo no usa cookies de rastreo ni publicitarias
Esta aplicación no coloca cookies propias ni de terceros con fines de
analítica, publicidad o seguimiento entre sitios.

2. Qué guarda tu navegador entonces
En vez de cookies, Viajoo guarda tus datos en dos almacenes
propios del navegador, que solo esta app puede leer y que nunca se
envían a ningún sitio salvo que actives tú la copia en la nube:
- IndexedDB: tus viajes, vuelos, hoteles, gastos, itinerario, y el
  resto de contenido que creas dentro de la app.
- localStorage: ajustes sueltos (por ejemplo, si el modo "Pro" de
  pruebas está activado, o la URL de un mock de desarrollo).
Puedes borrar todo esto en cualquier momento desde los ajustes de tu
navegador ("borrar datos del sitio"), o desde Ajustes → Copiar /
restaurar datos dentro de la app.

3. Fuentes de Google Fonts
Para mostrar su tipografía, la app carga las fuentes Plus Jakarta Sans,
Inter e IBM Plex Mono desde fonts.googleapis.com. Esta petición ocurre
en cada visita (no depende de que actives nada) y, como cualquier
carga desde un servidor externo, revela tu dirección IP a Google
mientras se descarga la fuente. No se usa para publicidad ni para
identificarte.

4. Firebase (si inicias sesión)
Si creas una cuenta o inicias sesión con Google, el SDK de Firebase
puede usar almacenamiento local del navegador (no necesariamente
cookies) para mantener tu sesión iniciada entre visitas. Esto solo
ocurre si decides iniciar sesión.

5. Cómo desactivarlo
Puedes bloquear el almacenamiento local desde los ajustes de tu
navegador, pero ten en cuenta que Viajoo necesita IndexedDB
para guardar tus viajes: si lo bloqueas por completo, la app no podrá
funcionar.
`.trim();

const CONTACT_COMPLAINTS_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Contacto
Para cualquier duda, incidencia o solicitud sobre tus datos, escribe a
[EMAIL DE CONTACTO].

2. Reclamaciones
Si no estás satisfecho con la respuesta, o quieres presentar una
reclamación formal, puedes:
- Pedir la hoja de reclamaciones escribiendo a [EMAIL DE CONTACTO].
- Si eres consumidor de la Unión Europea y la reclamación es sobre una
  compra Pro (cuando exista cobro real), acudir a la plataforma
  europea de resolución de litigios en línea:
  https://ec.europa.eu/consumers/odr
- Si la reclamación es sobre el tratamiento de tus datos personales,
  puedes acudir a la Agencia Española de Protección de Datos
  (www.aepd.es).

3. Tiempo de respuesta
Al ser un proyecto personal, procuramos responder en un plazo
razonable, aunque no podemos garantizar un tiempo fijo mientras no
haya un equipo de soporte dedicado.
`.trim();

const SUBSCRIPTION_TERMS_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Estado actual: sin cobro real, pero con registro obligatorio
Viajoo Pro está todavía en fase de pruebas: no hay ningún
sistema de pago real integrado. Mientras esto sea así, lo único que
hace falta para usar una función Pro es tener una cuenta creada
(gratis, con email o con Google) — no hay ningún cargo. Pedimos el
registro para llevar la cuenta de quién usa estas funciones mientras
se termina de integrar un cobro de verdad; estas condiciones se
aplican de forma orientativa para cuando eso ocurra.

Dos de estas funciones (el copiloto de viajes con IA y los avisos de
estado de vuelo) tienen un coste real por cada consulta a un servicio
externo, así que además del registro tienen un límite de 2 usos
gratis por cuenta AL DÍA. Al superarlo, se avisa de que las consultas
ilimitadas llegarán con la futura suscripción.

2. Qué incluye Pro (cuando se active el cobro real)
Viajes ilimitados, compartir viajes, avisos de estado de vuelo,
copiloto de IA, ordenar rutas por cercanía, conversor de moneda y
exportar en PDF — la lista completa se muestra siempre en la ventana
de suscripción dentro de la app.

3. Precio y forma de pago
Todavía por definir. El precio, la periodicidad (mensual/anual) y el
método de pago se anunciarán con claridad antes de pedir ningún dato
de pago. No se cobrará nada sin tu confirmación expresa.

4. Cancelación
Podrás cancelar la suscripción cuando quieras desde la propia app o
desde la plataforma de pago que se use llegado el momento (por
ejemplo, el sistema de suscripciones de Google Play o de la App
Store, si la app llega a distribuirse por ahí). Cancelar detiene la
renovación, pero no siempre da derecho a devolución del periodo ya
pagado (se explicará en el momento de la compra).

5. Derecho de desistimiento
Si compras Pro como persona consumidora dentro de la Unión Europea,
dispondrás de 14 días naturales para desistir de la compra sin
justificar el motivo, salvo que hayas empezado a usar el contenido
digital de pago con tu consentimiento expreso y renunciando a ese
derecho (algo que se pedirá de forma clara y separada, nunca escondido
en la letra pequeña).

6. Cambios en el precio o en las funciones Pro
Si en el futuro cambia el precio o qué incluye Pro, se avisará con
antelación razonable a quienes ya tengan una suscripción activa.
`.trim();

const THIRD_PARTY_LICENSES_TEXT = `
Última actualización: ${new Date().getFullYear()}

Viajoo usa las siguientes librerías de código abierto y fuentes
de terceros. Se listan aquí en cumplimiento de sus propias licencias,
que exigen dar crédito a su autoría:

- Leaflet — mapa interactivo. Licencia BSD de 2 cláusulas.
  © Vladimir Agafonkin y colaboradores.
- SortableJS — arrastrar y soltar para reordenar listas. Licencia MIT.
  © colaboradores de SortableJS.
- jsPDF — generación del PDF del mapa y del itinerario en el propio
  dispositivo. Licencia MIT. © autores de jsPDF.
- qrcode — generación del código QR para compartir un viaje. Licencia
  MIT. © Ryan Day (soldair) y colaboradores.
- jsQR — lectura de códigos QR con la cámara. Licencia Apache 2.0.
  © Cosmo Wolfe.
- Firebase JS SDK — cuenta, copia en la nube y viajes compartidos
  (Google). Licencia Apache 2.0.
- Datos de mapas de OpenStreetMap — © colaboradores de OpenStreetMap,
  licencia Open Database License (ODbL) 1.0.
- Tipografías Plus Jakarta Sans, Inter e IBM Plex Mono — Google Fonts,
  licencia SIL Open Font License 1.1.

El texto completo de cada licencia está disponible en el repositorio
del proyecto o en la web de cada proyecto correspondiente.
`.trim();

function openLegalSheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${icon("shield")} Legal</h2>
      <p style="color:var(--muted); font-size:12.5px; line-height:1.6; margin-top:-8px;">
        Documentos legales de Viajoo. Son plantillas con una
        estructura estándar, con los datos identificativos del titular
        pendientes de rellenar — no sustituyen la revisión de un
        abogado antes de publicar la app.
      </p>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-notice">${icon("shield")} Aviso legal (LSSI)</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-privacy">${icon("lock")} Privacidad y protección de datos</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-terms">${icon("notes")} Términos y condiciones de uso</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-ip">${icon("edit")} Propiedad intelectual</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-cookies">${icon("settings")} Cookies y almacenamiento local</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-contact">${icon("bell")} Contacto y reclamaciones</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-subscription">${icon("wallet")} Condiciones de suscripción Pro</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="lg-licenses">${icon("link")} Licencias de terceros</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="lg-close">${t("common_close")}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#lg-close").addEventListener("click", () => overlay.remove());

  const go = (id, title, text) =>
    overlay.querySelector(id).addEventListener("click", () => {
      openSubSheet(overlay, () => openLegalTextSheet(title, text));
    });
  go("#lg-notice", "Aviso legal (LSSI)", LEGAL_NOTICE_TEXT);
  go("#lg-privacy", "Privacidad y protección de datos", PRIVACY_POLICY_TEXT);
  go("#lg-terms", "Términos y condiciones de uso", TERMS_OF_USE_TEXT);
  go("#lg-ip", "Propiedad intelectual", INTELLECTUAL_PROPERTY_TEXT);
  go("#lg-cookies", "Cookies y almacenamiento local", COOKIES_TEXT);
  go("#lg-contact", "Contacto y reclamaciones", CONTACT_COMPLAINTS_TEXT);
  go("#lg-subscription", "Condiciones de suscripción Pro", SUBSCRIPTION_TERMS_TEXT);
  go("#lg-licenses", "Licencias de terceros", THIRD_PARTY_LICENSES_TEXT);
}

// ------------------------------------------------------------
// PERFIL — resumen del usuario según sus viajes. Base para ir
// añadiendo más secciones (insignias, países, preferencias...).
// ------------------------------------------------------------

async function openProfileSheet() {
  const trips = await Data.getAll("trips");
  const today = todayString();

  let upcoming = 0,
    past = 0,
    ongoing = 0,
    daysTraveled = 0;
  const cities = new Map(); // clave en minúsculas -> texto original (para no duplicar por mayúsculas)
  const countries = new Map();
  const perYear = new Map(); // año -> { count, spent }
  let totalSpent = 0;

  for (const trip of trips) {
    if (trip.destination) {
      const dest = trip.destination.trim();
      cities.set(dest.toLowerCase(), dest);
      const parts = dest.split(",").map((p) => p.trim()).filter(Boolean);
      const country = parts.length > 1 ? parts[parts.length - 1] : dest;
      if (country) countries.set(country.toLowerCase(), country);
    }

    const duration = trip.start_date && trip.end_date ? (daysBetween(trip.start_date, trip.end_date) || 0) + 1 : 0;

    if (trip.start_date > today) {
      upcoming++;
    } else if (trip.end_date && trip.end_date < today) {
      past++;
      daysTraveled += duration;
    } else {
      ongoing++;
      // Viaje en curso: solo cuentan los días ya vividos, no los que faltan.
      daysTraveled += trip.start_date ? Math.min(duration, (daysBetween(trip.start_date, today) || 0) + 1) : 0;
    }

    const expenses = await Data.getAllByTrip("expenses", trip.id);
    const spent = expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
    totalSpent += spent;

    const year = (trip.start_date || "").slice(0, 4);
    if (year) {
      const y = perYear.get(year) || { count: 0, spent: 0 };
      y.count += 1;
      y.spent += spent;
      perYear.set(year, y);
    }
  }

  const years = [...perYear.keys()].sort((a, b) => b.localeCompare(a));

  function chipList(map) {
    const values = [...map.values()].sort((a, b) => a.localeCompare(b, "es"));
    if (!values.length) return `<p style="color:var(--muted); font-size:12.5px;">Todavía ninguno.</p>`;
    return `<div style="display:flex; flex-wrap:wrap; gap:6px;">${values
      .map((v) => `<span class="tag-chip" style="background:var(--surface-tint); color:var(--muted-dark);">${escapeHtml(v)}</span>`)
      .join("")}</div>`;
  }

  const user = currentUser();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Mi perfil</h2>
      ${
        user
          ? `<p style="color:var(--muted); font-size:13.5px; margin-top:-10px;">${escapeHtml(user.email)}</p>`
          : `<p style="color:var(--muted); font-size:13.5px; margin-top:-10px;">Sin cuenta (datos solo en este dispositivo)</p>`
      }
      <div class="modal-actions" style="margin-top:8px;">
        <button class="btn btn-secondary" id="profile-account">${icon("user")} ${user ? t("settings_account") : t("settings_login")}</button>
      </div>
      <div class="stat-grid" style="margin-top:14px;">
        <div class="stat-card"><div class="stat-label">🧳 Viajes</div><div class="stat-value">${trips.length}</div></div>
        <div class="stat-card"><div class="stat-label">🌍 Países</div><div class="stat-value">${countries.size}</div></div>
        <div class="stat-card"><div class="stat-label">🏙️ Ciudades</div><div class="stat-value">${cities.size}</div></div>
        <div class="stat-card"><div class="stat-label">🔜 Próximos</div><div class="stat-value">${upcoming}</div></div>
        <div class="stat-card"><div class="stat-label">✅ Realizados</div><div class="stat-value">${past}</div></div>
        <div class="stat-card"><div class="stat-label">🗓️ Días viajados</div><div class="stat-value">${daysTraveled}</div></div>
        <div class="stat-card" style="grid-column: 1 / -1;"><div class="stat-label">💶 Gastado total</div><div class="stat-value" style="font-size:20px;">${money(totalSpent)}</div></div>
      </div>

      <div class="section-title-row" style="margin-top:6px;"><p class="section-title">Países visitados</p></div>
      ${chipList(countries)}

      <div class="section-title-row" style="margin-top:14px;"><p class="section-title">Ciudades visitadas</p></div>
      ${chipList(cities)}

      ${
        years.length
          ? `<div class="section-title-row" style="margin-top:14px;"><p class="section-title">Por año</p></div>
             <div class="panel">
               ${years
                 .map(
                   (y) => `
                 <div class="expense-row">
                   <div class="exp-info"><p class="exp-title">${y}</p><p class="exp-sub">${perYear.get(y).count} viaje${
                     perYear.get(y).count === 1 ? "" : "s"
                   }</p></div>
                   <span class="exp-amount">${money(perYear.get(y).spent)}</span>
                 </div>`
                 )
                 .join("")}
             </div>`
          : ""
      }

      <p style="color:var(--muted); font-size:12.5px; text-align:center; margin-top:16px;">
        Aquí irán apareciendo más cosas a medida que uses la app (insignias, preferencias de viaje...).
      </p>
      <div class="modal-actions" style="margin-top:6px;"><button class="btn btn-ghost" id="profile-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#profile-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#profile-account").addEventListener("click", () => {
    openSubSheet(overlay, openAccountSheet);
  });
}

export { openSettingsSheet, loadTheme, checkAndNotifyToday, checkBirthday, installPullToRefresh, afterLogin };

// ============================================================
// DESLIZAR PARA RECARGAR (pull-to-refresh)
// Solo se activa si el gesto empieza con la página ya arriba del
// todo y no hay ningún modal abierto. Muestra un círculo girando en
// la parte superior y, al soltar tras pasar el umbral, recarga la
// página (como pedía el usuario).
// ============================================================

function installPullToRefresh() {
  const THRESHOLD = 70;
  const MAX_PULL = 100;

  const indicator = document.createElement("div");
  indicator.className = "ptr-indicator";
  indicator.innerHTML = `<div class="ptr-ring"></div>`;
  document.body.appendChild(indicator);
  const ring = indicator.querySelector(".ptr-ring");

  let startY = null;
  let pulling = false;
  let refreshing = false;

  function reset() {
    pulling = false;
    indicator.classList.remove("ptr-visible");
    indicator.style.transform = "";
    ring.style.transform = "";
  }

  document.addEventListener(
    "touchstart",
    (e) => {
      if (refreshing) return;
      if (window.scrollY > 0) return;
      if (document.querySelector(".modal-overlay") || document.getElementById("lock-overlay")) return;
      startY = e.touches[0].clientY;
      pulling = true;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!pulling || refreshing) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) {
        indicator.classList.remove("ptr-visible");
        return;
      }
      const pull = Math.min(dy, MAX_PULL);
      indicator.classList.add("ptr-visible");
      indicator.style.transform = `translate(-50%, ${-60 + pull}px)`;
      ring.style.transform = `rotate(${pull * 3}deg)`;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchend",
    (e) => {
      if (!pulling || refreshing) {
        pulling = false;
        return;
      }
      const dy = e.changedTouches[0].clientY - startY;
      pulling = false;
      if (dy > THRESHOLD) {
        refreshing = true;
        indicator.classList.add("ptr-visible", "ptr-spinning");
        indicator.style.transform = "translate(-50%, 14px)";
        ring.style.transform = "";
        setTimeout(() => location.reload(), 350);
      } else {
        reset();
      }
    },
    { passive: true }
  );
}
