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
import { TABS, renderSection, renderPrintArea } from "./sections.js";

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

function confirmAction(message) {
  return window.confirm(message);
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

// ============================================================
// ESTRUCTURA DE UN VIAJE (topbar + tabbar + contenido)
// ============================================================

async function renderTripShell() {
  const trip = await Data.get("trips", state.tripId);
  if (!trip) {
    state.tripId = null;
    await renderApp();
    return;
  }

  const tabsHtml = TABS.map(
    (t) => h`
      <button class="tab-btn ${state.section === t.id ? "active" : ""}" data-tab="${t.id}">
        <span class="tab-icon">${t.icon}</span>
        <span>${t.label}</span>
      </button>`
  ).join("");

  root.innerHTML = h`
    <div class="topbar">
      <button class="icon-btn" id="btn-back">←</button>
      <div class="topbar-titles">
        <p class="topbar-eyebrow">${escapeHtml(trip.name)}</p>
        <h1 class="topbar-title">${escapeHtml(trip.destination)}</h1>
      </div>
      <button class="icon-btn" id="btn-trip-menu">⋮</button>
    </div>
    <div class="view" id="section-content"></div>
    <div id="fab-slot"></div>
    <div class="tabbar">
      <div class="tabbar-inner">${tabsHtml}</div>
    </div>
    <div id="print-area"></div>
  `;

  root.querySelector("#btn-back").addEventListener("click", () => {
    if (state.section !== "dashboard") {
      state.section = "dashboard";
    } else {
      state.tripId = null;
    }
    renderApp();
  });

  root.querySelector("#btn-trip-menu").addEventListener("click", () => {
    openTripMenu(trip);
  });

  root.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.section = btn.dataset.tab;
      renderApp();
    });
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
    if (confirmAction(`Se eliminará "${trip.destination}" y todo su contenido (vuelos, hoteles, itinerario...). ¿Continuar?`)) {
      await Data.deleteTripCascade(trip.id);
      toast("Viaje eliminado");
      state.tripId = null;
      await renderApp();
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
        .map((trip) => {
          const days = daysUntil(trip.start_date);
          let countdown = "";
          if (days === null) countdown = "";
          else if (days > 0) countdown = `Faltan ${days} día${days === 1 ? "" : "s"}`;
          else if (days === 0) countdown = "¡Es hoy!";
          else if (trip.end_date && daysUntil(trip.end_date) >= 0)
            countdown = "En curso";
          else countdown = "Finalizado";

          return h`
            <div class="trip-card" data-id="${trip.id}">
              <p class="trip-dest">${escapeHtml(trip.destination)}</p>
              <p class="trip-name">${escapeHtml(trip.name)}</p>
              <span class="trip-dates">${formatDatePretty(trip.start_date)} → ${formatDatePretty(trip.end_date)}</span>
              <p class="trip-countdown">${countdown}</p>
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
      <button class="icon-btn" id="btn-backup" title="Copia de seguridad">⇅</button>
      <button class="icon-btn ${currentUser() ? "logged-in" : ""}" id="btn-account" title="Cuenta">👤</button>
      <button class="icon-btn" id="btn-security" title="Seguridad">🔒</button>
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
      renderApp();
    });
  });

  root.querySelector("#fab-new-trip").addEventListener("click", () => openTripForm());
  root.querySelector("#btn-backup").addEventListener("click", () => openBackupSheet());
  root.querySelector("#btn-security").addEventListener("click", () => openSecuritySheet());
  root.querySelector("#btn-account").addEventListener("click", () => openAccountSheet());
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
        await Data.put("trips", { ...trip, ...values });
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
    if (!confirmAction("Esto sustituirá todos los datos actuales por los del archivo. ¿Continuar?")) return;
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

export { state, root, h, toast, refresh, showFormModal, confirmAction, renderApp, openTripForm };

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
      const current = prompt("Introduce tu PIN actual:");
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
      const current = prompt("Introduce tu PIN para confirmar que quieres quitarlo:");
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

function promptNewPin() {
  const pin = prompt("Elige un PIN (4 a 6 dígitos):");
  if (pin === null) return;
  if (!/^\d{4,6}$/.test(pin)) {
    toast("El PIN debe tener entre 4 y 6 números");
    return;
  }
  const confirmPin = prompt("Repite el PIN:");
  if (confirmPin !== pin) {
    toast("No coincide, inténtalo de nuevo");
    return;
  }
  setPin(pin).then(() => toast("PIN activado"));
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
    if (!confirmAction("Esto sustituirá los datos de este dispositivo por los de la nube. ¿Continuar?")) return;
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
