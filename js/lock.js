// ============================================================
// lock.js — Bloqueo local de la app con PIN (sin servidor).
// Protege de que alguien coja tu móvil y abra la app directamente.
//
// El PIN es OPCIONAL, apagado por defecto: hasta que el usuario no
// lo activa a propósito desde Ajustes → Configuración → Seguridad,
// la app abre directo, sin pedir nada. Una vez activado, se pide en
// cada apertura y al volver de segundo plano — y desde ahí también
// se puede sumar Face ID/huella (WebAuthn) como atajo, o quitar el
// PIN del todo cuando se quiera.
// ============================================================

import { Data } from "./db.js";

const BIOMETRIC_CRED_KEY = "biometric_credential_id";

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function isPinSet() {
  const hash = await Data.settingGet("pin_hash");
  return !!hash;
}

async function setPin(pin) {
  const hash = await sha256(pin);
  await Data.settingSet("pin_hash", hash);
}

async function removePin() {
  await Data.settingDelete("pin_hash");
  // Sin PIN no tiene sentido guardar un atajo biométrico para
  // desbloquearlo — se limpia también, silenciosamente.
  await disableBiometric();
}

async function verifyPin(pin) {
  const hash = await Data.settingGet("pin_hash");
  if (!hash) return true;
  const attempt = await sha256(pin);
  return attempt === hash;
}

// ------------------------------------------------------------
// DESBLOQUEO BIOMÉTRICO (Face ID / huella) — WebAuthn con
// autenticador de plataforma. Solo puede activarse con un PIN ya
// puesto (el PIN sigue siendo el respaldo si la biometría falla o
// no está disponible ese día).
//
// Ojo con lo que esto es y lo que NO es: al no haber ningún servidor
// propio para esto (es 100% local, como el PIN), no hay una
// verificación criptográfica real de la firma que devuelve el
// autenticador — solo comprobamos que el propio navegador/sistema
// operativo completó el gesto biométrico sin error. Eso ya es
// suficiente para el objetivo real (que quien desbloquea el
// teléfono sea su dueño), exactamente igual de "local" que el PIN
// mismo — no cambia lo que se guarda ni protege.
// ------------------------------------------------------------

function bufToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToBuf(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** true si este navegador/dispositivo puede hacer Face ID/huella. */
async function isBiometricAvailable() {
  try {
    if (!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (err) {
    return false;
  }
}

async function isBiometricEnabled() {
  const id = await Data.settingGet(BIOMETRIC_CRED_KEY);
  return !!id;
}

/** Da de alta Face ID/huella como atajo. Devuelve true si el usuario
 * completó el gesto biométrico y quedó guardado; false si lo canceló
 * o falló (nunca lanza — un fallo aquí no debe romper el resto). */
async function enableBiometric() {
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Viajoo" },
        user: { id: userId, name: "viajoo-local", displayName: "Viajoo" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60000,
        attestation: "none",
      },
    });
    if (!cred) return false;
    await Data.settingSet(BIOMETRIC_CRED_KEY, bufToBase64(cred.rawId));
    return true;
  } catch (err) {
    return false; // cancelado, no soportado, o falló el sensor
  }
}

async function disableBiometric() {
  await Data.settingDelete(BIOMETRIC_CRED_KEY);
}

/** Pide Face ID/huella para el atajo ya dado de alta. true si el
 * gesto se completó correctamente. */
async function verifyBiometric() {
  try {
    const id = await Data.settingGet(BIOMETRIC_CRED_KEY);
    if (!id) return false;
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64ToBuf(id), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!assertion;
  } catch (err) {
    return false; // cancelado, o falló el sensor — se cae al PIN
  }
}

// ============================================================
// UI COMPARTIDA (teclado numérico + puntos)
// ============================================================

function buildOverlaySkeleton(messageText) {
  const overlay = document.createElement("div");
  overlay.id = "lock-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 1001; background: var(--overlay-bg, #171436);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; color: #f5f0e1; font-family: "IBM Plex Mono", monospace;
  `;

  overlay.innerHTML = `
    <div style="font-size:40px;">🔒</div>
    <div id="lock-msg" style="font-size:14px; opacity:0.7;">${messageText}</div>
    <div id="lock-biometric" style="display:none;"></div>
    <div id="lock-dots" style="display:flex; gap:14px;"></div>
    <div id="lock-error" style="color:#ff8b7f; font-size:12.5px; height:16px;"></div>
    <div id="lock-keypad" style="display:grid; grid-template-columns:repeat(3,64px); gap:14px;"></div>
  `;
  document.body.appendChild(overlay);

  if (!document.getElementById("lock-shake-style")) {
    const style = document.createElement("style");
    style.id = "lock-shake-style";
    style.textContent = `@keyframes lock-shake {
      0%,100% { transform: translateX(0); }
      25% { transform: translateX(-8px); }
      75% { transform: translateX(8px); }
    }`;
    document.head.appendChild(style);
  }

  return overlay;
}

function shake(overlay) {
  overlay.style.animation = "none";
  overlay.offsetHeight; // reflow para reiniciar la animación
  overlay.style.animation = "lock-shake 0.3s";
}

/**
 * Motor genérico de teclado + puntos. `onSubmit(pin)` se llama cada
 * vez que el usuario pulsa "✓" con al menos un dígito introducido;
 * debe devolver true si hay que limpiar los puntos (por error) o
 * false/undefined si ya se encarga de todo (p. ej. cerrar overlay).
 */
function attachKeypad(overlay, onSubmit) {
  const dotsEl = overlay.querySelector("#lock-dots");
  const keypadEl = overlay.querySelector("#lock-keypad");

  let entered = "";
  const MAX_LEN = 6;

  function renderDots() {
    dotsEl.innerHTML = Array.from({ length: Math.max(entered.length, 4) })
      .map(
        (_, i) =>
          `<div style="width:12px;height:12px;border-radius:50%;border:1px solid #9aa3c4;background:${
            i < entered.length ? "var(--brand, #6c5ce7)" : "transparent"
          }"></div>`
      )
      .join("");
  }

  function clearEntry() {
    entered = "";
    renderDots();
  }

  function addKey(label, value) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      width:64px; height:64px; border-radius:50%; border:1px solid #2b325a;
      background:#1b2140; color:#f5f0e1; font-size:20px;
    `;
    btn.addEventListener("click", async () => {
      if (value === "back") {
        entered = entered.slice(0, -1);
      } else if (value === "ok") {
        if (!entered) return;
        await onSubmit(entered, { clearEntry, dotsEl });
        return;
      } else if (entered.length < MAX_LEN) {
        entered += value;
      }
      renderDots();
    });
    keypadEl.appendChild(btn);
  }

  ["1","2","3","4","5","6","7","8","9"].forEach((n) => addKey(n, n));
  addKey("⌫", "back");
  addKey("0", "0");
  addKey("✓", "ok");

  renderDots();
  return { clearEntry };
}

// ============================================================
// PANTALLA DE DESBLOQUEO (ya hay PIN guardado)
// ============================================================

function renderLockScreen(onSuccess) {
  const overlay = buildOverlaySkeleton("Introduce tu PIN");
  const errorEl = overlay.querySelector("#lock-error");
  const bioEl = overlay.querySelector("#lock-biometric");

  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    overlay.remove();
    onSuccess();
  }

  isBiometricEnabled().then(async (enabled) => {
    if (!enabled || unlocked) return;
    bioEl.style.display = "block";
    bioEl.innerHTML = `<button class="btn btn-secondary" id="lock-bio-btn" style="font-size:13px;">🔓 Usar Face ID / huella</button>`;
    const bioBtn = bioEl.querySelector("#lock-bio-btn");
    async function tryBiometric() {
      const ok = await verifyBiometric();
      if (ok) unlock();
      // Si falla o lo cancela, no se muestra error: simplemente se
      // queda en la pantalla del PIN como respaldo.
    }
    bioBtn.addEventListener("click", tryBiometric);
    tryBiometric(); // se intenta solo al mostrar la pantalla
  });

  attachKeypad(overlay, async (entered, { clearEntry }) => {
    const ok = await verifyPin(entered);
    if (ok) {
      unlock();
    } else {
      errorEl.textContent = "PIN incorrecto";
      clearEntry();
      shake(overlay);
    }
  });
}

/**
 * Punto de entrada al arrancar la app. El PIN es opcional: si el
 * usuario nunca lo activó desde Ajustes → Configuración → Seguridad,
 * se entra directo, sin pedir nada. Solo se muestra el candado
 * cuando ya hay un PIN guardado.
 */
async function guardOnLaunch(onReady) {
  const active = await isPinSet();
  if (!active) {
    onReady();
    return;
  }
  renderLockScreen(onReady);
}

/**
 * Vuelve a bloquear la app cada vez que se oculta y se vuelve a
 * mostrar (cambiar de app, apagar pantalla, etc.) — pero solo si el
 * usuario activó el PIN; si no, no hace nada.
 */
function installBackgroundLock() {
  let hiddenAt = null;
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt === null) return;
    hiddenAt = null;
    if (document.getElementById("lock-overlay")) return; // ya bloqueada
    if (!(await isPinSet())) return; // PIN desactivado: no hay nada que pedir
    renderLockScreen(() => {});
  });
}

export {
  isPinSet,
  setPin,
  removePin,
  verifyPin,
  guardOnLaunch,
  installBackgroundLock,
  isBiometricAvailable,
  isBiometricEnabled,
  enableBiometric,
  disableBiometric,
  verifyBiometric,
};
