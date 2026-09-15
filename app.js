import { Data, DEFAULT_CHECKLIST_ITEMS } from "./db.js";
import {
  money,
  todayString,
  escapeHtml,
  formatDatePretty,
  daysBetween,
  daysUntil,
  openMaps,
  openMapsMultiple,
  download,
} from "./utils.js";
import { isPinSet, setPin, removePin, verifyPin } from "./lock.js";
import {
  currentUser,
  onAuthChange,
  signUp,
  signIn,
  signOutUser,
  pushToCloud,
  pullFromCloud,
  cloudHasBackup,
} from "./cloud.js";
import { renderSection, renderPrintArea } from "./sections.js";
import { findDestinationPhoto } from "./photo.js";
import { icon } from "./icons.js";

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
  setTimeout(() => el.remove(), 2200);
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
function showFormModal({ title, fields, initial, onSave, onDelete, deleteLabel }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${escapeHtml(title)}</h2>
      <form id="modal-form">
        ${renderFieldsGrouped(fields, initial)}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
        ${
          onDelete
            ? `<div class="modal-actions"><button type="button" class="btn btn-danger" id="modal-delete">${escapeHtml(
                deleteLabel || "Eliminar"
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
          <button type="button" class="btn btn-ghost" id="prompt-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="prompt-ok">Aceptar</button>
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
          <button type="button" class="btn btn-ghost" id="confirm-cancel">Cancelar</button>
          <button type="button" class="btn btn-primary" id="confirm-ok">Confirmar</button>
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
// RENDER PRINCIPAL / ROUTER
// ============================================================

async function renderApp() {
  if (state.tripId === null) {
    await renderHome();
  } else {
    await renderTripShell();
  }
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
  document.documentElement.dataset.navDir = direction;
  if (document.startViewTransition) {
    document.startViewTransition(() => renderFn());
  } else {
    renderFn();
  }
}

/**
 * Navegación "atrás": del detalle de una sección al resumen del
 * viaje, o del resumen a la lista de viajes. La usan tanto el botón
 * ← del topbar como el gesto de deslizar desde el borde izquierdo.
 */
function goBack() {
  if (document.querySelector(".modal-overlay") || document.getElementById("lock-overlay")) return;
  if (state.tripId === null) return;
  if (state.section !== "dashboard") {
    state.section = "dashboard";
  } else {
    state.tripId = null;
  }
  withTransition(renderApp, "back");
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

  root.innerHTML = h`
    <div class="topbar">
      <button class="icon-btn" id="btn-back">←</button>
      <div class="topbar-titles">
        <p class="topbar-eyebrow">${escapeHtml(trip.name)}</p>
        <h1 class="topbar-title">${escapeHtml(trip.destination)}</h1>
      </div>
      <button class="icon-btn ${currentUser() ? "logged-in" : ""}" id="btn-settings" title="Ajustes">⚙️</button>
      <button class="icon-btn" id="btn-trip-menu">⋮</button>
    </div>
    <div class="view no-tabbar" id="section-content"></div>
    <div id="fab-slot"></div>
    <div id="print-area"></div>
  `;

  root.querySelector("#btn-back").addEventListener("click", () => goBack());

  root.querySelector("#btn-settings").addEventListener("click", () => openSettingsSheet());

  root.querySelector("#btn-trip-menu").addEventListener("click", () => {
    openTripMenu(trip);
  });

  await renderSection(trip);
}

function openTripMenu(trip) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">${escapeHtml(trip.destination)}</h2>
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-edit">✏️ Editar viaje</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="mn-print">🖨️ Exportar / Imprimir</button></div>
      <div class="modal-actions"><button class="btn btn-danger" id="mn-delete">🗑️ Eliminar viaje</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="mn-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#mn-close").addEventListener("click", () => overlay.remove());
  overlay.querySelector("#mn-edit").addEventListener("click", () => {
    overlay.remove();
    openTripForm(trip);
  });
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
}

// ============================================================
// PANTALLA DE INICIO — LISTA DE VIAJES
// ============================================================

async function renderHome() {
  const trips = await Data.getAll("trips");
  trips.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  const cardsHtml = trips.length
    ? trips
        .map((trip, i) => {
          const days = daysUntil(trip.start_date);
          let countdown = "";
          if (days === null) countdown = "";
          else if (days > 0) countdown = `Faltan ${days} día${days === 1 ? "" : "s"}`;
          else if (days === 0) countdown = "¡Es hoy!";
          else if (trip.end_date && daysUntil(trip.end_date) >= 0)
            countdown = "En curso";
          else countdown = "Finalizado";

          return h`
            <div class="trip-card trip-color-${(i % 6) + 1}" data-id="${trip.id}">
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
              <p class="trip-dest">${escapeHtml(trip.destination)}</p>
              <p class="trip-name">${escapeHtml(trip.name)}</p>
              <span class="trip-dates">${formatDatePretty(trip.start_date)} → ${formatDatePretty(trip.end_date)}</span>
            </div>`;
        })
        .join("")
    : h`
        <div class="empty-state">
          <div class="emoji">🧳</div>
          <p>Todavía no tienes ningún viaje.<br>Toca el botón + para crear el primero.</p>
        </div>`;

  root.innerHTML = h`
    <div class="topbar">
      <div class="topbar-titles">
        <p class="topbar-eyebrow">TRAVEL PLANNER</p>
        <h1 class="topbar-title">Mis viajes</h1>
      </div>
      <button class="icon-btn ${currentUser() ? "logged-in" : ""}" id="btn-settings" title="Ajustes">⚙️</button>
    </div>
    <div class="view no-tabbar">
      ${cardsHtml}
    </div>
    <button class="fab" id="fab-new-trip">＋</button>
  `;

  root.querySelectorAll(".trip-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.tripId = parseInt(card.dataset.id, 10);
      state.section = "dashboard";
      withTransition(renderApp, "forward");
    });
  });

  root.querySelector("#fab-new-trip").addEventListener("click", () => openTripForm());
  root.querySelector("#btn-settings").addEventListener("click", () => openSettingsSheet());

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

function openTripForm(trip) {
  showFormModal({
    title: trip ? "Editar viaje" : "Nuevo viaje",
    initial: trip,
    fields: [
      { name: "name", label: "Nombre del viaje", required: true, placeholder: "Ej. Escapada de verano" },
      { name: "destination", label: "Destino", required: true, placeholder: "Ej. Lisboa, Portugal" },
      { name: "start_date", label: "Fecha de inicio", type: "date", half: true, required: true },
      { name: "end_date", label: "Fecha de fin", type: "date", half: true, required: true },
      { name: "budget", label: "Presupuesto (€)", type: "number", step: "0.01" },
      { name: "notes", label: "Notas", type: "textarea" },
    ],
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
        <button class="btn btn-secondary" id="btn-export">⬇️ Exportar copia (.json)</button>
      </div>
      <div class="modal-actions">
        <label class="btn btn-secondary" style="display:flex;">
          ⬆️ Importar copia
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
    download(`travelplanner-backup-${stamp}.json`, JSON.stringify(dump, null, 2));
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

export { state, root, h, toast, refresh, showFormModal, confirmAction, renderApp, openTripForm, withTransition, installSwipeBack };

// ============================================================
// SEGURIDAD — PIN de bloqueo local
// ============================================================

async function openSecuritySheet() {
  const hasPin = await isPinSet();

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Seguridad</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Un PIN local pide un código cada vez que abres la app o vuelves a ella
        tras cambiar de app. Solo vive en este dispositivo — si lo olvidas,
        no hay forma de recuperarlo salvo borrar los datos de la app.
      </p>
      <div class="modal-actions" style="margin-top:16px;">
        <button class="btn btn-secondary" id="sec-toggle">
          ${hasPin ? "🔁 Cambiar PIN" : "🔒 Activar PIN"}
        </button>
      </div>
      ${hasPin ? `<div class="modal-actions"><button class="btn btn-danger" id="sec-remove">Quitar PIN</button></div>` : ""}
      <div class="modal-actions"><button class="btn btn-ghost" id="sec-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#sec-close").addEventListener("click", () => overlay.remove());

  overlay.querySelector("#sec-toggle").addEventListener("click", async () => {
    overlay.remove();
    if (hasPin) {
      const current = await promptModal({ title: "Introduce tu PIN actual", inputType: "password", inputMode: "numeric" });
      if (current === null) return;
      const ok = await verifyPin(current);
      if (!ok) {
        toast("PIN incorrecto");
        return;
      }
    }
    promptNewPin();
  });

  if (hasPin) {
    overlay.querySelector("#sec-remove").addEventListener("click", async () => {
      overlay.remove();
      const current = await promptModal({ title: "Confirma tu PIN", message: "Para quitarlo, introduce tu PIN actual.", inputType: "password", inputMode: "numeric" });
      if (current === null) return;
      const ok = await verifyPin(current);
      if (!ok) {
        toast("PIN incorrecto");
        return;
      }
      await removePin();
      toast("PIN desactivado");
    });
  }
}

async function promptNewPin() {
  const pin = await promptModal({ title: "Elige un PIN", message: "Entre 4 y 6 números.", inputType: "password", inputMode: "numeric" });
  if (pin === null) return;
  if (!/^\d{4,6}$/.test(pin)) {
    toast("El PIN debe tener entre 4 y 6 números");
    return;
  }
  const confirmPin = await promptModal({ title: "Repite el PIN", inputType: "password", inputMode: "numeric" });
  if (confirmPin !== pin) {
    toast("No coincide, inténtalo de nuevo");
    return;
  }
  await setPin(pin);
  toast("PIN activado");
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
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn btn-primary" id="acc-push">⬆️ Subir copia a la nube</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="acc-pull">⬇️ Descargar copia de la nube</button>
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
      <div class="field" style="margin-top:14px;">
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

  overlay.querySelector("#auth-login").addEventListener("click", async () => {
    errorEl.textContent = "";
    const { user, error } = await signIn(emailEl.value.trim(), passEl.value);
    if (error) { errorEl.textContent = error; return; }
    overlay.remove();
    await afterLogin(user);
  });

  overlay.querySelector("#auth-signup").addEventListener("click", async () => {
    errorEl.textContent = "";
    const { user, error } = await signUp(emailEl.value.trim(), passEl.value);
    if (error) { errorEl.textContent = error; return; }
    overlay.remove();
    // Cuenta recién creada: subimos lo que ya haya en este dispositivo.
    toast("Cuenta creada, subiendo tus datos…");
    await pushToCloud();
    await renderApp();
  });
}

async function afterLogin(user) {
  const hasBackup = await cloudHasBackup();
  if (!hasBackup) {
    toast("Sesión iniciada. Subiendo tus datos de este dispositivo…");
    await pushToCloud();
    await renderApp();
    return;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Ya tienes una copia en la nube</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6;">
        Hay datos guardados de antes en tu cuenta. ¿Qué quieres hacer?
      </p>
      <div class="modal-actions">
        <button class="btn btn-primary" id="merge-pull">⬇️ Usar los datos de la nube (sustituye los de este móvil)</button>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="merge-push">⬆️ Usar los datos de este móvil (sustituye los de la nube)</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#merge-pull").addEventListener("click", async () => {
    overlay.remove();
    await pullFromCloud();
    toast("Datos de la nube cargados");
    await renderApp();
  });
  overlay.querySelector("#merge-push").addEventListener("click", async () => {
    overlay.remove();
    await pushToCloud();
    toast("Tus datos de este móvil se han subido");
    await renderApp();
  });
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
      <h2 class="modal-title">Ajustes</h2>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-account">👤 ${currentUser() ? "Mi cuenta" : "Iniciar sesión"}</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-backup">☁️ Copiar / restaurar datos</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-profile">🧳 Mi perfil</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-theme">🌗 Tema</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-notifications">🔔 Notificaciones</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-security">🔒 Seguridad (PIN)</button></div>
      <div class="modal-actions"><button class="btn btn-secondary" id="st-privacy">📄 Política de privacidad</button></div>
      <div class="modal-actions"><button class="btn btn-ghost" id="st-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#st-close").addEventListener("click", () => overlay.remove());

  const go = (id, fn) =>
    overlay.querySelector(id).addEventListener("click", () => {
      overlay.remove();
      fn();
    });
  go("#st-account", openAccountSheet);
  go("#st-backup", openBackupSheet);
  go("#st-profile", openProfileSheet);
  go("#st-theme", openThemeSheet);
  go("#st-notifications", openNotificationsSheet);
  go("#st-security", openSecuritySheet);
  go("#st-privacy", openPrivacyPolicySheet);
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
const NOTIF_LAST_KEY = "notifications_last_date";

async function openNotificationsSheet() {
  const enabledRaw = await Data.settingGet(NOTIF_KEY);
  const enabled = enabledRaw === true || enabledRaw === 1;
  const permission = "Notification" in window ? Notification.permission : "unsupported";

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Notificaciones</h2>
      <p style="color:var(--muted); font-size:13.5px; line-height:1.6; margin-top:-8px;">
        Si las activas, la app te avisará cuando tengas un vuelo o una actividad
        programada para hoy. Se generan en este dispositivo, sin servidor externo.
      </p>
      ${permission === "unsupported" ? `<p style="color:var(--muted); font-size:13px;">Tu navegador no admite notificaciones.</p>` : ""}
      ${permission === "denied" ? `<p style="color:var(--rose); font-size:13px;">Están bloqueadas en el navegador. Actívalas desde los ajustes del sitio.</p>` : ""}
      <div class="modal-actions" style="margin-top:10px;">
        <button class="btn ${enabled ? "btn-danger" : "btn-primary"}" id="notif-toggle" ${permission === "unsupported" ? "disabled" : ""}>
          ${enabled ? "🔕 Desactivar notificaciones" : "🔔 Activar notificaciones"}
        </button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" id="notif-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#notif-close").addEventListener("click", () => overlay.remove());

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

/** Revisa, como máximo una vez al día, si hay vuelos o actividades de
 * hoy en cualquier viaje y lanza una notificación local si es así.
 * Se llama al arrancar la app; nunca rompe nada si falla (sin
 * permiso, navegador sin soporte, etc.). */
async function checkAndNotifyToday() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const enabled = await Data.settingGet(NOTIF_KEY);
    if (!enabled) return;

    const today = todayString();
    const lastNotified = await Data.settingGet(NOTIF_LAST_KEY);
    if (lastNotified === today) return;

    const trips = await Data.getAll("trips");
    const parts = [];
    for (const trip of trips) {
      const [flights, itin] = await Promise.all([
        Data.getAllByTrip("flights", trip.id),
        Data.getAllByTrip("itinerary", trip.id),
      ]);
      const todayFlights = flights.filter((f) => f.date === today);
      const todayEvents = itin.filter((i) => i.date === today);
      if (todayFlights.length) parts.push(`✈️ ${todayFlights.length} vuelo(s) en ${trip.destination}`);
      if (todayEvents.length) parts.push(`📍 ${todayEvents.length} actividad(es) en ${trip.destination}`);
    }
    if (!parts.length) return;

    new Notification("TravelPlanner", { body: parts.join(" · ") });
    await Data.settingSet(NOTIF_LAST_KEY, today);
  } catch (err) {
    // sin permiso, sin soporte, o cualquier fallo: no pasa nada
  }
}

// ------------------------------------------------------------
// POLÍTICA DE PRIVACIDAD
// ------------------------------------------------------------

const PRIVACY_POLICY_TEXT = `
Última actualización: ${new Date().getFullYear()}

1. Qué datos guarda TravelPlanner
Los datos de tus viajes (vuelos, hoteles, itinerario, transporte, reservas,
gastos y checklist) se guardan en tu propio dispositivo, en el
almacenamiento local del navegador (IndexedDB). No se envían a ningún
servidor salvo que actives voluntariamente la copia en la nube.

2. Cuenta y copia en la nube (opcional)
Si creas una cuenta (email y contraseña), tus datos se guardan también en
Firebase (Google) bajo tu usuario, para poder recuperarlos en otro
dispositivo. Puedes cerrar sesión y eliminar tu cuenta cuando quieras. Sin
cuenta, la app funciona igualmente de forma 100% local.

3. Servicios externos que puede consultar la app
Para mostrar mapas, calcular rutas, o encontrar fotos e imágenes reales de
tus vuelos, hoteles, actividades y transportes, la app envía consultas
puntuales (por ejemplo, un nombre de lugar o de aerolínea) a servicios
públicos de terceros: OpenStreetMap/Nominatim y OSRM (mapas y rutas), y
Wikipedia/Openverse (fotos). Estas consultas no incluyen tu identidad ni el
resto de tus datos, solo el texto necesario para la búsqueda.

4. Notificaciones
Si activas los avisos, se generan en tu propio dispositivo a partir de tus
datos guardados localmente. No implican el envío de información a
servidores externos.

5. PIN de bloqueo
El PIN, si lo activas, se guarda cifrado (hash) únicamente en tu
dispositivo. Nadie más que tú puede verlo ni recuperarlo.

6. Tus derechos
Puedes exportar, importar o borrar tus datos en cualquier momento desde
Ajustes → Copiar / restaurar datos, o eliminar tu cuenta desde
Ajustes → Mi cuenta. No compartimos tus datos con terceros con fines
comerciales ni mostramos publicidad dentro de la app.

7. Contacto
Si tienes dudas sobre tus datos o esta política, puedes escribirnos a
[tu email de contacto aquí].
`.trim();

function openPrivacyPolicySheet() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = h`
    <div class="modal-sheet">
      <div class="modal-handle"></div>
      <h2 class="modal-title">Política de privacidad</h2>
      <div style="max-height:50vh; overflow-y:auto; font-size:13px; line-height:1.7; color:var(--muted-dark); white-space:pre-wrap; margin:4px 0 16px;">${escapeHtml(PRIVACY_POLICY_TEXT)}</div>
      <div class="modal-actions"><button class="btn btn-primary" id="privacy-close">Entendido</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#privacy-close").addEventListener("click", () => overlay.remove());
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
    ongoing = 0;
  const destinations = new Set();
  let totalSpent = 0;

  for (const trip of trips) {
    if (trip.destination) destinations.add(trip.destination.trim().toLowerCase());
    if (trip.start_date > today) upcoming++;
    else if (trip.end_date && trip.end_date < today) past++;
    else ongoing++;

    const expenses = await Data.getAllByTrip("expenses", trip.id);
    totalSpent += expenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0);
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
      <div class="stat-grid" style="margin-top:14px;">
        <div class="stat-card"><div class="stat-label">🧳 Viajes</div><div class="stat-value">${trips.length}</div></div>
        <div class="stat-card"><div class="stat-label">🌍 Destinos</div><div class="stat-value">${destinations.size}</div></div>
        <div class="stat-card"><div class="stat-label">🔜 Próximos</div><div class="stat-value">${upcoming}</div></div>
        <div class="stat-card"><div class="stat-label">✅ Realizados</div><div class="stat-value">${past}</div></div>
        <div class="stat-card"><div class="stat-label">💶 Gastado total</div><div class="stat-value" style="font-size:17px;">${money(totalSpent)}</div></div>
      </div>
      <p style="color:var(--muted); font-size:12.5px; text-align:center; margin-top:16px;">
        Aquí irán apareciendo más cosas a medida que uses la app (insignias, países visitados, preferencias de viaje...).
      </p>
      <div class="modal-actions" style="margin-top:6px;"><button class="btn btn-ghost" id="profile-close">Cerrar</button></div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => e.target === overlay && overlay.remove());
  overlay.querySelector("#profile-close").addEventListener("click", () => overlay.remove());
}

export { openSettingsSheet, loadTheme, checkAndNotifyToday };
