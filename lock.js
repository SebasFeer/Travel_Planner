// ============================================================
// lock.js — Bloqueo local de la app con PIN (sin servidor).
// Protege de que alguien coja tu móvil y abra la app directamente.
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
// PANTALLA DE BLOQUEO
// ============================================================

function renderLockScreen(onSuccess) {
  const overlay = document.createElement("div");
  overlay.id = "lock-overlay";
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 999; background: var(--ink, #12162a);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 22px; color: #f5f0e1; font-family: "IBM Plex Mono", monospace;
  `;

  overlay.innerHTML = `
    <div style="font-size:40px;">🔒</div>
    <div style="font-size:14px; opacity:0.7;">Introduce tu PIN</div>
    <div id="lock-dots" style="display:flex; gap:14px;"></div>
    <div id="lock-error" style="color:#ff8b7f; font-size:12.5px; height:16px;"></div>
    <div id="lock-keypad" style="display:grid; grid-template-columns:repeat(3,64px); gap:14px;"></div>
  `;
  document.body.appendChild(overlay);

  const dotsEl = overlay.querySelector("#lock-dots");
  const errorEl = overlay.querySelector("#lock-error");
  const keypadEl = overlay.querySelector("#lock-keypad");

  let entered = "";
  const MAX_LEN = 6;

  function renderDots() {
    dotsEl.innerHTML = Array.from({ length: Math.max(entered.length, 4) })
      .map(
        (_, i) =>
          `<div style="width:12px;height:12px;border-radius:50%;border:1px solid #9aa3c4;background:${
            i < entered.length ? "#e4a421" : "transparent"
          }"></div>`
      )
      .join("");
  }

  function addKey(label, value) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = `
      width:64px; height:64px; border-radius:50%; border:1px solid #2b325a;
      background:#1b2140; color:#f5f0e1; font-size:20px;
    `;
    btn.addEventListener("click", () => {
      if (value === "back") {
        entered = entered.slice(0, -1);
      } else if (value === "ok") {
        submit();
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

  async function submit() {
    if (!entered) return;
    const ok = await verifyPin(entered);
    if (ok) {
      overlay.remove();
      onSuccess();
    } else {
      errorEl.textContent = "PIN incorrecto";
      entered = "";
      renderDots();
      overlay.style.animation = "none";
      overlay.offsetHeight; // reflow para reiniciar la animación
      overlay.style.animation = "lock-shake 0.3s";
    }
  }

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

  renderDots();
}

/**
 * Comprueba si hay PIN activo y, si lo hay, bloquea la app hasta
 * que se introduzca correctamente. Llama a `onReady` cuando se puede
 * continuar (de inmediato si no hay PIN configurado).
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
 * mostrar (cambiar de app, apagar pantalla, etc.), si hay PIN activo.
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
    const active = await isPinSet();
    if (!active) return;
    if (document.getElementById("lock-overlay")) return; // ya bloqueada
    renderLockScreen(() => {});
  });
}

export { isPinSet, setPin, removePin, verifyPin, guardOnLaunch, installBackgroundLock };
