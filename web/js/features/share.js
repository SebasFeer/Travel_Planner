// ============================================================
// features/share.js — Compartir un viaje y unirse a uno por código
// (versión web). Reproduce openShareTripSheet, openJoinTripSheet,
// openQrScannerSheet y "Actualizar desde la nube" del menú del viaje
// de js/app.js, usando las mismas funciones de js/cloud.js
// (shareTrip, joinSharedTrip, refreshSharedTrip, refreshAllSharedTrips).
//
// Igual que en la app: el código es de 6 caracteres, el QR codifica
// "TPJOIN:<código>" y la app no usa enlaces de invitación, así que
// aquí tampoco (solo código y QR). Las librerías de QR son las mismas
// que carga index.html de la app, pero aquí se cargan bajo demanda.
// ============================================================

import { shareTrip, joinSharedTrip, refreshSharedTrip, refreshAllSharedTrips } from "../../../js/cloud.js";
import { isPro } from "../../../js/pro.js";

// Mismo prefijo que js/app.js (SHARE_QR_PREFIX) para que un QR hecho
// en la web se pueda escanear desde la app y al revés.
const SHARE_QR_PREFIX = "TPJOIN:";
const QRCODE_SRC = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.js";
const JSQR_SRC = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";

function shareCodeToQrText(code) {
  return `${SHARE_QR_PREFIX}${code}`;
}

function shareCodeFromQrText(text) {
  const trimmed = (text || "").trim();
  return trimmed.toUpperCase().startsWith(SHARE_QR_PREFIX) ? trimmed.slice(SHARE_QR_PREFIX.length) : trimmed;
}

const scriptLoads = new Map();
function loadScript(src, globalName) {
  if (typeof window[globalName] !== "undefined") return Promise.resolve(true);
  if (!scriptLoads.has(src)) {
    scriptLoads.set(
      src,
      new Promise((resolve) => {
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve(typeof window[globalName] !== "undefined");
        s.onerror = () => {
          scriptLoads.delete(src); // permite reintentar más tarde
          s.remove();
          resolve(false);
        };
        document.head.appendChild(s);
      })
    );
  }
  return scriptLoads.get(src);
}

// En la app: hasProAccess() = cuenta iniciada o modo Pro de pruebas.
// En la web siempre hay sesión, pero se comprueba igual.
async function hasAccess(ctx) {
  return !!ctx.state.user || (await isPro());
}

// ------------------------------------------------------------
// COMPARTIR VIAJE
// ------------------------------------------------------------

export async function openShare(trip, ctx) {
  const { esc, toast, openSheet } = ctx;
  if (!(await hasAccess(ctx))) {
    toast("Compartir viajes con otras personas requiere tener una cuenta.");
    return;
  }

  const wasShared = !!trip.share_code;
  toast("Generando enlace…");
  const res = await shareTrip(trip.id);
  if (!res.ok) {
    toast(res.error || "No se pudo compartir el viaje");
    return;
  }

  const html = `
    <div class="shr">
      <p class="muted shr-lead">
        Dale este código (o el QR) a quien quieras invitar. Desde
        Ajustes → Unirme a un viaje compartido, con su propia cuenta
        iniciada, podrá añadirlo a sus viajes escribiéndolo o
        escaneándolo.
      </p>
      <div class="shr-code-card">
        <span class="label">Código del viaje</span>
        <input type="text" class="shr-code mono" id="shr-code" value="${esc(res.code)}" readonly aria-label="Código del viaje" />
        <div class="shr-qr" id="shr-qr-wrap" hidden>
          <canvas id="shr-qr-canvas" aria-label="Código QR del viaje"></canvas>
        </div>
        <p class="muted small shr-qr-note" id="shr-qr-note">Cargando el QR…</p>
      </div>
      <div class="shr-actions">
        <button class="btn btn-primary" type="button" id="shr-copy">📋 Copiar código</button>
        ${wasShared ? `<button class="btn btn-secondary" type="button" id="shr-refresh">⟳ Actualizar desde la nube</button>` : ""}
      </div>
      <p class="muted small shr-foot">
        Viaje compartido · código <b class="mono">${esc(res.code)}</b>. Los cambios de cualquier
        miembro se suben solos; si alguien acaba de editar, usa «Actualizar desde la nube».
      </p>
    </div>`;

  openSheet({
    title: "Viaje compartido",
    html,
    onMount(root, close) {
      const codeEl = root.querySelector("#shr-code");
      root.querySelector("#shr-copy").addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(res.code);
          toast("Código copiado");
        } catch (err) {
          codeEl.select();
          toast("Selecciona y copia el código");
        }
      });
      codeEl.addEventListener("focus", () => codeEl.select());

      const refreshBtn = root.querySelector("#shr-refresh");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
          refreshBtn.disabled = true;
          toast("Buscando cambios…");
          const r = await refreshSharedTrip(trip.id);
          refreshBtn.disabled = false;
          if (r.ok) {
            toast("Actualizado con la copia compartida");
            close();
            await ctx.render();
          } else {
            toast(r.error || "No se pudo actualizar");
          }
        });
      }

      drawQr(root, res.code);
    },
  });
}

async function drawQr(root, code) {
  const wrap = root.querySelector("#shr-qr-wrap");
  const note = root.querySelector("#shr-qr-note");
  const ok = await loadScript(QRCODE_SRC, "QRCode");
  if (!root.isConnected) return;
  if (!ok || typeof window.QRCode?.toCanvas !== "function") {
    note.textContent = "No se pudo cargar el QR (revisa tu conexión). El código funciona igual.";
    return;
  }
  const canvas = root.querySelector("#shr-qr-canvas");
  // Siempre negro sobre blanco (los lectores fallan con QR invertidos).
  window.QRCode.toCanvas(canvas, shareCodeToQrText(code), { width: 190, margin: 1 }, (err) => {
    if (err) {
      note.textContent = "No se pudo generar el QR. El código funciona igual.";
      return;
    }
    wrap.hidden = false;
    note.textContent = "Escanéalo desde la app: Ajustes → Unirme a un viaje compartido → Escanear QR.";
  });
}

// ------------------------------------------------------------
// UNIRSE A UN VIAJE COMPARTIDO
// ------------------------------------------------------------

/**
 * @param ctx  contexto de web/js/app.js
 * @param opts { code } opcional: rellena el código (p. ej. si algún
 *             día la web recibe ?join=CODE; hoy la app no usa enlaces).
 */
export async function openJoin(ctx, opts = {}) {
  const { esc, toast, openSheet, Data } = ctx;
  if (!(await hasAccess(ctx))) {
    toast("Unirte a un viaje compartido requiere tener una cuenta.");
    return;
  }

  let sharedCount = 0;
  try {
    sharedCount = (await Data.getAll("trips")).filter((t) => t.share_code).length;
  } catch (e) {}

  const canScan = !!navigator.mediaDevices?.getUserMedia;
  const html = `
    <div class="shr">
      <p class="muted shr-lead">Introduce el código de 6 caracteres que te han pasado${canScan ? ", o escanea su QR" : ""}.</p>
      <form id="shr-join-form" class="shr-join" autocomplete="off">
        <input type="text" id="shr-join-input" class="shr-code shr-code-input mono" placeholder="Ej. AB12CD"
          maxlength="32" autocapitalize="characters" spellcheck="false" aria-label="Código del viaje" value="${esc(opts.code || "")}" />
        <div class="shr-actions">
          <button class="btn btn-primary" type="submit" id="shr-join-confirm">Unirme</button>
          ${canScan ? `<button class="btn btn-secondary" type="button" id="shr-join-scan">📷 Escanear QR</button>` : ""}
        </div>
      </form>
      <div class="shr-scan" id="shr-scan" hidden>
        <div class="shr-video"><video id="shr-video" playsinline muted></video></div>
        <p class="muted small" id="shr-scan-status">Buscando código…</p>
        <button class="btn btn-ghost btn-sm" type="button" id="shr-scan-cancel">Cancelar</button>
      </div>
      ${
        sharedCount
          ? `<div class="shr-refresh-all">
               <div><b>Tus viajes compartidos</b><span class="muted small">${sharedCount} ${sharedCount === 1 ? "viaje compartido" : "viajes compartidos"} en tu lista</span></div>
               <button class="btn btn-secondary btn-sm" type="button" id="shr-refresh-all">⟳ Actualizar todos</button>
             </div>`
          : ""
      }
    </div>`;

  let stopScan = () => {};
  openSheet({
    title: "Unirme a un viaje compartido",
    html,
    onClose: () => stopScan(),
    onMount(root, close) {
      const input = root.querySelector("#shr-join-input");
      const confirmBtn = root.querySelector("#shr-join-confirm");
      input.addEventListener("input", () => {
        const pos = input.selectionStart;
        input.value = input.value.toUpperCase();
        input.setSelectionRange(pos, pos);
      });

      let busy = false;
      async function doJoin(code) {
        const clean = (code || "").trim();
        if (!clean) {
          toast("Introduce un código");
          input.focus();
          return;
        }
        if (busy) return;
        busy = true;
        confirmBtn.disabled = true;
        toast("Uniéndote al viaje…");
        const res = await joinSharedTrip(clean);
        busy = false;
        confirmBtn.disabled = false;
        if (res.ok) {
          close();
          toast("¡Listo! El viaje ya aparece en tu lista");
          if (res.tripId != null) ctx.go("trip", res.tripId, "overview");
          else await ctx.render();
        } else {
          toast(res.error || "No se pudo unir al viaje");
        }
      }

      root.querySelector("#shr-join-form").addEventListener("submit", (e) => {
        e.preventDefault();
        doJoin(input.value);
      });

      const scanBtn = root.querySelector("#shr-join-scan");
      if (scanBtn) {
        scanBtn.addEventListener("click", () => {
          stopScan = startScanner(root, (text) => {
            const code = shareCodeFromQrText(text);
            input.value = code.toUpperCase();
            doJoin(code);
          });
        });
      }

      const refreshAllBtn = root.querySelector("#shr-refresh-all");
      if (refreshAllBtn) {
        refreshAllBtn.addEventListener("click", async () => {
          refreshAllBtn.disabled = true;
          toast("Buscando cambios…");
          const changed = await refreshAllSharedTrips();
          refreshAllBtn.disabled = false;
          toast(changed ? "Viajes compartidos actualizados" : "No se pudo actualizar (revisa tu conexión)");
          if (changed) await ctx.render();
        });
      }

      setTimeout(() => input.focus(), 50);
    },
  });
}

/**
 * Escáner con la cámara, dentro de la misma ventana (en la app es un
 * overlay aparte). Devuelve una función para parar la cámara.
 */
function startScanner(root, onResult) {
  const panel = root.querySelector("#shr-scan");
  const form = root.querySelector("#shr-join-form");
  const video = root.querySelector("#shr-video");
  const statusEl = root.querySelector("#shr-scan-status");
  const canvas = document.createElement("canvas");
  const c2d = canvas.getContext("2d", { willReadFrequently: true });
  let stream = null;
  let rafId = null;
  let stopped = false;

  panel.hidden = false;
  form.hidden = true;
  statusEl.textContent = "Buscando código…";

  function stop() {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    video.srcObject = null;
  }
  function cancel() {
    stop();
    panel.hidden = true;
    form.hidden = false;
  }
  root.querySelector("#shr-scan-cancel").onclick = cancel;

  function scanLoop() {
    if (stopped) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      c2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = c2d.getImageData(0, 0, canvas.width, canvas.height);
      const result = window.jsQR(img.data, img.width, img.height);
      if (result?.data) {
        cancel();
        onResult(result.data);
        return;
      }
    }
    rafId = requestAnimationFrame(scanLoop);
  }

  (async () => {
    const ok = await loadScript(JSQR_SRC, "jsQR");
    if (stopped) return;
    if (!ok) {
      statusEl.textContent = "No se pudo cargar el lector de QR (revisa tu conexión e inténtalo de nuevo).";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      scanLoop();
    } catch (err) {
      statusEl.textContent = "No se pudo acceder a la cámara (revisa los permisos del navegador).";
    }
  })();

  return stop;
}
