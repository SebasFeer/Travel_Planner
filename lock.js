// ============================================================
// lock.js — Bloqueo local de la app con PIN (sin servidor).
// Protege de que alguien coja tu móvil y abra la app directamente.
//
// El PIN es OBLIGATORIO: si todavía no hay uno configurado, se
// fuerza a crearlo antes de entrar (en vez de dejar pasar sin pedir
// nada). A partir de ahí, se pide en cada apertura de la app.
// ============================================================

import { Data } from "./db.js";

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
}

async function verifyPin(pin) {
  const hash = await Data.settingGet("pin_hash");
  if (!hash) return true;
  const attempt = await sha256(pin);
  return attempt === hash;
}

// ============================================================
// UI COMPARTIDA (teclado numérico + puntos)
// ============================================================

function buildOverlaySkeleton(messageText) {
  const overlay = document.createElement("div");
  overlay.id = "lock-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 999; background: var(--overlay-bg, #171436);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; color: #f5f0e1; font-family: "IBM Plex Mono", monospace;
  `;

  overlay.innerHTML = `
    <div style="font-size:40px;">🔒</div>
    <div id="lock-msg" style="font-size:14px; opacity:0.7;">${messageText}</div>
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

  attachKeypad(overlay, async (entered, { clearEntry }) => {
    const ok = await verifyPin(entered);
    if (ok) {
      overlay.remove();
      onSuccess();
    } else {
      errorEl.textContent = "PIN incorrecto";
      clearEntry();
      shake(overlay);
    }
  });
}

// ============================================================
// PANTALLA DE CREACIÓN DE PIN (todavía no hay ninguno guardado)
// Obligatoria: no hay forma de saltársela.
// ============================================================

function renderSetupScreen(onDone) {
  const overlay = buildOverlaySkeleton("Crea un PIN para esta app (4-6 dígitos)");
  const msgEl = overlay.querySelector("#lock-msg");
  const errorEl = overlay.querySelector("#lock-error");

  let stage = "create"; // "create" -> "confirm"
  let firstPin = "";

  attachKeypad(overlay, async (entered, { clearEntry }) => {
    if (entered.length < 4) {
      errorEl.textContent = "Mínimo 4 dígitos";
      shake(overlay);
      return;
    }

    if (stage === "create") {
      firstPin = entered;
      stage = "confirm";
      errorEl.textContent = "";
      msgEl.textContent = "Repite el PIN para confirmarlo";
      clearEntry();
      return;
    }

    // stage === "confirm"
    if (entered !== firstPin) {
      errorEl.textContent = "No coincide, empieza de nuevo";
      stage = "create";
      firstPin = "";
      msgEl.textContent = "Crea un PIN para esta app (4-6 dígitos)";
      clearEntry();
      shake(overlay);
      return;
    }

    await setPin(entered);
    overlay.remove();
    onDone();
  });
}

/**
 * Punto de entrada al arrancar la app. El PIN es obligatorio:
 * - Si ya hay uno guardado, pide desbloquear con él.
 * - Si todavía no hay ninguno, obliga a crearlo antes de continuar.
 * En ambos casos, `onReady` solo se llama cuando el acceso queda
 * confirmado.
 */
async function guardOnLaunch(onReady) {
  const active = await isPinSet();
  if (!active) {
    renderSetupScreen(onReady);
    return;
  }
  renderLockScreen(onReady);
}

/**
 * Vuelve a bloquear la app cada vez que se oculta y se vuelve a
 * mostrar (cambiar de app, apagar pantalla, etc.).
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
    renderLockScreen(() => {});
  });
}

export { isPinSet, setPin, removePin, verifyPin, guardOnLaunch, installBackgroundLock };
