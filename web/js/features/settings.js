// ============================================================
// features/settings.js — Ajustes de la web. Reúne en una sola
// ventana con pestañas lo que en la app son varios submenús de
// openSettingsSheet / openConfigSheet (js/app.js):
//   Cuenta     -> openAccountSheet   (subir/descargar ahora, cerrar sesión)
//   Perfil     -> openProfileSheet   (estadísticas según tus viajes)
//   Apariencia -> openThemeSheet     (misma clave "theme_pref")
//   Datos      -> openBackupSheet    (mismo JSON de Data.exportAll)
//                 openCacheUsageSheet
//   Legal      -> openLegalSheet     (aquí enlaza a legal.html#…)
//   Avanzado   -> openDevModeSheet   (interruptor Pro de pruebas)
// Se omiten a propósito (ver informe): idioma, notificaciones, PIN /
// Face ID, y el mock del copiloto IA.
// ============================================================

import { signOutUser, pushToCloud, pullFromCloud } from "../../../js/cloud.js";
import { isPro, setPro } from "../../../js/pro.js";
import { daysBetween, download } from "../../../js/utils.js";

// Misma clave y mismos valores que js/app.js (THEME_KEY): como la web
// y la app comparten IndexedDB en el mismo navegador, cambiar el tema
// en un sitio lo cambia en el otro.
const THEME_KEY = "theme_pref";

function applyTheme(pref) {
  if (pref === "light" || pref === "dark") document.documentElement.dataset.theme = pref;
  else delete document.documentElement.dataset.theme;
}

/** Para llamar al arrancar la web (ver informe: hook en web/js/app.js). */
export async function loadTheme(Data) {
  try {
    applyTheme((await Data.settingGet(THEME_KEY)) || "system");
  } catch (e) {}
}

const TABS = [
  { id: "account", label: "Cuenta" },
  { id: "profile", label: "Perfil" },
  { id: "appearance", label: "Apariencia" },
  { id: "data", label: "Datos" },
  { id: "legal", label: "Legal" },
  { id: "advanced", label: "Avanzado" },
];

// Mismo orden y títulos que openLegalSheet; los id son los de
// web/js/legal-texts.js (legal.html#<id>).
const LEGAL_LINKS = [
  ["aviso-legal", "Aviso legal (LSSI)"],
  ["privacidad", "Privacidad y protección de datos"],
  ["terminos", "Términos y condiciones de uso"],
  ["propiedad-intelectual", "Propiedad intelectual"],
  ["cookies", "Cookies y almacenamiento local"],
  ["contacto", "Contacto y reclamaciones"],
  ["suscripcion", "Condiciones de suscripción Pro"],
  ["licencias", "Licencias de terceros"],
];

let lastTab = "account";

export async function openSettings(ctx, opts = {}) {
  const { esc, openSheet } = ctx;
  let tab = opts.tab || lastTab;
  if (!TABS.some((t) => t.id === tab)) tab = "account";

  const html = `
    <div class="stg">
      <nav class="stg-tabs" role="tablist" aria-label="Secciones de ajustes">
        ${TABS.map((t) => `<button type="button" class="chip-btn" role="tab" data-stg-tab="${t.id}" aria-pressed="false">${esc(t.label)}</button>`).join("")}
      </nav>
      <div class="stg-panel" id="stg-panel" role="tabpanel"></div>
    </div>`;

  openSheet({
    title: "Ajustes",
    html,
    wide: true,
    onMount(root, close) {
      const panel = root.querySelector("#stg-panel");
      const show = async (id) => {
        tab = lastTab = id;
        root.querySelectorAll("[data-stg-tab]").forEach((b) => {
          const on = b.dataset.stgTab === id;
          b.setAttribute("aria-pressed", String(on));
          b.setAttribute("aria-selected", String(on));
        });
        panel.innerHTML = `<p class="muted small">Cargando…</p>`;
        const renderers = { account: renderAccount, profile: renderProfile, appearance: renderAppearance, data: renderData, legal: renderLegal, advanced: renderAdvanced };
        await renderers[id](panel, ctx, { close, show });
      };
      root.querySelectorAll("[data-stg-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.stgTab)));
      show(tab);
    },
  });
}

// ------------------------------------------------------------
// Cuenta (openAccountSheet)
// ------------------------------------------------------------
async function renderAccount(panel, ctx, { close }) {
  const { esc, toast, confirmBox, render } = ctx;
  const u = ctx.state.user || {};
  const initial = (u.displayName || u.email || "?").trim().charAt(0).toUpperCase();
  panel.innerHTML = `
    <div class="stg-id">
      <span class="stg-avatar" aria-hidden="true">${esc(initial)}</span>
      <div>
        ${u.displayName ? `<b>${esc(u.displayName)}</b>` : ""}
        <span class="${u.displayName ? "muted small" : ""}">${esc(u.email || "")}</span>
      </div>
    </div>
    <p class="muted small stg-note">⟳ Sincronización automática activada: tus cambios se guardan solos
      en la nube unos segundos después de hacerlos, y se descargan solos
      al abrir la app en otro dispositivo con esta misma cuenta.</p>
    <div class="stg-list">
      <div class="stg-item">
        <div><b>Forzar subida ahora</b><span class="muted small">Sube a la nube lo que hay en este navegador.</span></div>
        <button class="btn btn-secondary btn-sm" type="button" id="stg-push">Subir</button>
      </div>
      <div class="stg-item">
        <div><b>Forzar descarga ahora</b><span class="muted small">Sustituye los datos de este navegador por los de la nube.</span></div>
        <button class="btn btn-secondary btn-sm" type="button" id="stg-pull">Descargar</button>
      </div>
      <div class="stg-item">
        <div><b>Viajes compartidos</b><span class="muted small">Únete a un viaje con el código o el QR que te han pasado.</span></div>
        <button class="btn btn-secondary btn-sm" type="button" id="stg-join">🔗 Unirme</button>
      </div>
    </div>
    <div class="stg-foot">
      <button class="btn btn-danger btn-sm" type="button" id="stg-logout">Cerrar sesión</button>
    </div>`;

  const pushBtn = panel.querySelector("#stg-push");
  pushBtn.addEventListener("click", async () => {
    pushBtn.disabled = true;
    toast("Subiendo…");
    const res = await pushToCloud();
    pushBtn.disabled = false;
    toast(res.ok ? "Copia subida a la nube" : res.error);
  });
  panel.querySelector("#stg-pull").addEventListener("click", async () => {
    if (!(await confirmBox("Esto sustituirá los datos de este dispositivo por los de la nube. ¿Continuar?", "Continuar"))) return;
    toast("Descargando…");
    const res = await pullFromCloud();
    if (res.ok) {
      toast("Datos actualizados desde la nube");
      close();
      await render();
    } else if (res.empty) {
      toast("Todavía no hay ninguna copia en la nube");
    } else {
      toast(res.error);
    }
  });
  panel.querySelector("#stg-join").addEventListener("click", async () => {
    close();
    try {
      (await import("./share.js")).openJoin(ctx);
    } catch (e) {
      toast("No se pudo cargar esta función (revisa tu conexión)");
    }
  });
  panel.querySelector("#stg-logout").addEventListener("click", async () => {
    close();
    await signOutUser();
    toast("Sesión cerrada");
  });
}

// ------------------------------------------------------------
// Perfil (openProfileSheet) — mismas cuentas que la app
// ------------------------------------------------------------
async function renderProfile(panel, ctx) {
  const { Data, esc, money, todayString } = ctx;
  const trips = await Data.getAll("trips");
  const today = todayString();

  let upcoming = 0,
    past = 0,
    ongoing = 0,
    daysTraveled = 0;
  const cities = new Map();
  const countries = new Map();
  const perYear = new Map();
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

  const chipList = (map) => {
    const values = [...map.values()].sort((a, b) => a.localeCompare(b, "es"));
    if (!values.length) return `<p class="muted small">Todavía ninguno.</p>`;
    return `<div class="stg-chips">${values.map((v) => `<span class="stg-chip">${esc(v)}</span>`).join("")}</div>`;
  };
  const stat = (label, value, extra = "") => `<div class="stg-stat ${extra}"><span class="label">${label}</span><b>${value}</b></div>`;

  panel.innerHTML = `
    <div class="stg-stats">
      ${stat("🧳 Viajes", trips.length)}
      ${stat("🌍 Países", countries.size)}
      ${stat("🏙️ Ciudades", cities.size)}
      ${stat("🔜 Próximos", upcoming)}
      ${stat("✅ Realizados", past)}
      ${stat("🗓️ Días viajados", daysTraveled)}
      ${stat("💶 Gastado total", esc(money(totalSpent)), "wide")}
    </div>
    <h3 class="stg-h">Países visitados</h3>
    ${chipList(countries)}
    <h3 class="stg-h">Ciudades visitadas</h3>
    ${chipList(cities)}
    ${
      years.length
        ? `<h3 class="stg-h">Por año</h3>
           <div class="stg-list">${years
             .map((y) => {
               const n = perYear.get(y).count;
               return `<div class="stg-item"><div><b class="mono">${y}</b><span class="muted small">${n} viaje${n === 1 ? "" : "s"}</span></div><span class="mono stg-amount">${esc(money(perYear.get(y).spent))}</span></div>`;
             })
             .join("")}</div>`
        : ""
    }
    <p class="muted small stg-center">Aquí irán apareciendo más cosas a medida que uses la app (insignias, preferencias de viaje...).</p>`;
}

// ------------------------------------------------------------
// Apariencia (openThemeSheet)
// ------------------------------------------------------------
async function renderAppearance(panel, ctx) {
  const { Data, toast } = ctx;
  const current = (await Data.settingGet(THEME_KEY)) || "system";
  const opt = (value, icon, label, sub) => `
    <button type="button" class="stg-theme" data-theme-opt="${value}" aria-pressed="${current === value}">
      <span class="stg-theme-swatch stg-sw-${value}" aria-hidden="true"></span>
      <span><b>${icon} ${label}</b><span class="muted small">${sub}</span></span>
    </button>`;
  panel.innerHTML = `
    <h3 class="stg-h stg-h-first">Tema</h3>
    <div class="stg-themes" role="group" aria-label="Tema">
      ${opt("light", "☀️", "Claro", "Siempre claro")}
      ${opt("dark", "🌙", "Oscuro", "Siempre oscuro")}
      ${opt("system", "💻", "Automático", "Según el sistema")}
    </div>
    <p class="muted small stg-note">El tema se guarda en este navegador y es el mismo que usa la app
      cuando la abres aquí.</p>
    <h3 class="stg-h">Idioma</h3>
    <p class="muted small">La web está solo en español por ahora. El idioma que elijas en la app no cambia la web.</p>`;
  panel.querySelectorAll("[data-theme-opt]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const value = btn.dataset.themeOpt;
      await Data.settingSet(THEME_KEY, value);
      applyTheme(value);
      panel.querySelectorAll("[data-theme-opt]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      toast("Tema actualizado");
    })
  );
}

// ------------------------------------------------------------
// Datos: copia de seguridad (openBackupSheet) + uso de caché
// (openCacheUsageSheet)
// ------------------------------------------------------------
async function renderData(panel, ctx, { close }) {
  const { Data, toast, confirmBox, render, todayString } = ctx;
  panel.innerHTML = `
    <h3 class="stg-h stg-h-first">Copia de seguridad</h3>
    <p class="muted small">Exporta un archivo con todos tus viajes de este navegador. Es el mismo
      formato que la copia de la app, así que puedes importarlo en cualquiera de las dos.</p>
    <div class="stg-row-btns">
      <button class="btn btn-secondary btn-sm" type="button" id="stg-export">⬇ Exportar copia (.json)</button>
      <label class="btn btn-secondary btn-sm stg-file">⬆ Importar copia
        <input type="file" accept="application/json,.json" id="stg-import" />
      </label>
    </div>
    <h3 class="stg-h">Uso de caché</h3>
    <p class="muted small">Para poder abrir sin conexión, la app guarda en este dispositivo una
      copia de sus propios archivos y de las teselas del mapa que ya has
      visto. Tus viajes NO están aquí — viven aparte, en la base de datos
      local (y en la nube si tienes cuenta), así que vaciar esto nunca
      borra ningún dato tuyo.</p>
    <div class="stg-item stg-item-solo">
      <div><b class="mono" id="stg-cache-value">Calculando…</b><span class="muted small">espacio usado en este dispositivo</span></div>
      <button class="btn btn-danger btn-sm" type="button" id="stg-cache-clear">Vaciar caché ahora</button>
    </div>`;

  panel.querySelector("#stg-export").addEventListener("click", async () => {
    const dump = await Data.exportAll();
    download(`viajoo-backup-${todayString()}.json`, JSON.stringify(dump, null, 2));
    toast("Copia exportada");
  });

  const fileInput = panel.querySelector("#stg-import");
  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    if (!(await confirmBox("Esto sustituirá todos los datos actuales por los del archivo. ¿Continuar?", "Importar"))) return;
    const text = await file.text();
    try {
      const dump = JSON.parse(text);
      await Data.importAll(dump);
      toast("Copia importada");
      close();
      await render();
    } catch (err) {
      toast("El archivo no es válido");
    }
  });

  const valueEl = panel.querySelector("#stg-cache-value");
  try {
    const { usage } = await navigator.storage.estimate();
    const mb = (usage || 0) / (1024 * 1024);
    valueEl.textContent = mb < 1 ? `${Math.round((usage || 0) / 1024)} KB` : `${mb.toFixed(1)} MB`;
  } catch (err) {
    valueEl.textContent = "—";
  }
  panel.querySelector("#stg-cache-clear").addEventListener("click", async () => {
    if (!(await confirmBox("Se borrará el app shell guardado y el mapa descargado para sin conexión (tus viajes no se tocan). ¿Continuar?", "Vaciar"))) return;
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      toast("Caché vaciada");
      valueEl.textContent = "—";
    } catch (err) {
      toast("No se pudo vaciar la caché");
    }
  });
}

// ------------------------------------------------------------
// Legal (openLegalSheet) — en la web, los textos viven en legal.html
// ------------------------------------------------------------
async function renderLegal(panel, ctx) {
  const { esc } = ctx;
  panel.innerHTML = `
    <p class="muted small stg-note stg-h-first">Documentos legales de Viajoo. Se abren en una pestaña nueva.</p>
    <div class="stg-list">
      ${LEGAL_LINKS.map(
        ([id, title]) =>
          `<a class="stg-item stg-link" href="legal.html#${id}" target="_blank" rel="noopener"><b>${esc(title)}</b><span class="mono muted" aria-hidden="true">↗</span></a>`
      ).join("")}
    </div>`;
}

// ------------------------------------------------------------
// Avanzado: estado de las funciones de cuenta + interruptor Pro de
// pruebas (openDevModeSheet)
// ------------------------------------------------------------
async function renderAdvanced(panel, ctx, { show }) {
  const { toast } = ctx;
  const pro = await isPro();
  panel.innerHTML = `
    <h3 class="stg-h stg-h-first">Estado de tu cuenta</h3>
    <div class="stg-item stg-item-solo">
      <div><b>${ctx.state.user ? "Funciones de cuenta activas" : "Sin cuenta"}</b>
        <span class="muted small">Compartir viajes, copiloto IA, avisos de vuelo, conversor de moneda, PDF y viajes ilimitados. Por ahora no se cobra nada.</span></div>
      <span class="stg-badge ${ctx.state.user ? "on" : ""}">${ctx.state.user ? "Activas" : "Inactivas"}</span>
    </div>
    <h3 class="stg-h">Modo desarrollador</h3>
    <p class="muted small">Interruptor temporal para probar las funciones Pro (compartir
      viaje, avisos de vuelo, copiloto de IA, ordenar ruta, viajes
      ilimitados...) sin tener todavía cobros de verdad integrados.
      Cuando se active el pago real, esto se sustituirá por la
      confirmación de la compra.</p>
    <div class="stg-item stg-item-solo">
      <div><b>Modo Pro (pruebas)</b><span class="muted small">${pro ? "Activado en este navegador" : "Desactivado"}</span></div>
      <button class="btn ${pro ? "btn-danger" : "btn-primary"} btn-sm" type="button" id="stg-pro">${pro ? "🧪 Desactivar modo Pro" : "🧪 Activar modo Pro (pruebas)"}</button>
    </div>`;
  panel.querySelector("#stg-pro").addEventListener("click", async () => {
    await setPro(!pro);
    toast(!pro ? "Modo Pro activado" : "Modo Pro desactivado");
    show("advanced");
  });
}
