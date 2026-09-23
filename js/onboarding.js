// ============================================================
// onboarding.js — Bienvenida de 3 pantallas al primer uso.
//
// Se muestra UNA sola vez (el flag vive en IndexedDB, no en
// sessionStorage, así que sobrevive a cerrar la app del todo — a
// diferencia de "tp_booted" en index.html, que es justo lo
// contrario: detectar recargas DENTRO de la misma sesión). Si el
// usuario la omite o la termina, no se vuelve a ver.
// ============================================================

import { Data } from "./db.js";
import { icon, brandMark, googleIcon } from "./icons.js";
import { t as tr } from "./i18n.js";
import { signUp, signInWithGoogle, pushToCloud } from "./cloud.js";
import { afterLogin } from "./app.js";

const ONBOARDING_KEY = "onboarding_seen";
const TRAVELER_TYPE_KEY = "traveler_type";

async function shouldShowOnboarding() {
  const seen = await Data.settingGet(ONBOARDING_KEY);
  return !seen;
}

function travelerTypes() {
  return [
    { id: "solo", label: tr("traveler_solo"), icon: "user" },
    { id: "pareja", label: tr("traveler_couple"), icon: "heart" },
    { id: "familia", label: tr("traveler_family"), icon: "home" },
    { id: "grupo", label: tr("traveler_friends"), icon: "luggage" },
  ];
}

const FEATURE_ICONS = ["itinerary", "flights", "expenses", "checklist", "map"];

/**
 * Pinta la bienvenida a pantalla completa y llama a `onDone` cuando
 * el usuario la termina o la omite (nunca se queda atascada: ambos
 * caminos guardan el flag y desmontan el overlay).
 */
function renderOnboarding(onDone) {
  const types = travelerTypes();
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.innerHTML = `
    <button type="button" class="onboarding-skip" id="ob-skip">${tr("ob_skip")}</button>
    <div class="onboarding-track" id="ob-track">
      <section class="onboarding-slide">
        <div class="onboarding-mark">${brandMark()}</div>
        <h1>${tr("ob1_title")}</h1>
        <p>${tr("ob1_body")}</p>
      </section>
      <section class="onboarding-slide">
        <div class="onboarding-icons">
          ${FEATURE_ICONS.map((n) => `<span class="onboarding-icon-chip">${icon(n)}</span>`).join("")}
        </div>
        <h1>${tr("ob2_title")}</h1>
        <p>${tr("ob2_body")}</p>
      </section>
      <section class="onboarding-slide">
        <h1>${tr("ob3_title")}</h1>
        <p>${tr("ob3_body")}</p>
        <div class="onboarding-chips" id="ob-traveler-chips">
          ${types
            .map(
              (tt) => `<button type="button" class="onboarding-chip" data-type="${tt.id}">${icon(tt.icon)}<span>${tt.label}</span></button>`
            )
            .join("")}
        </div>
      </section>
      <section class="onboarding-slide">
        <div class="onboarding-mark">${brandMark()}</div>
        <h1>${tr("ob4_title")}</h1>
        <p>${tr("ob4_body")}</p>
        <div class="onboarding-auth-form">
          <button type="button" class="btn btn-secondary" id="ob-google">${googleIcon()} ${tr("auth_google_continue")}</button>
          <div class="auth-divider"><span>${tr("auth_or_email")}</span></div>
          <div class="field">
            <label>${tr("auth_email_label")}</label>
            <input type="email" id="ob-email" autocomplete="email" />
          </div>
          <div class="field">
            <label>${tr("auth_password_label")}</label>
            <input type="password" id="ob-password" autocomplete="new-password" placeholder="${tr("auth_password_hint")}" />
          </div>
          <p id="ob-auth-error" style="color:#ff8b7f; font-size:12.5px; min-height:16px; text-align:left;"></p>
          <button type="button" class="btn btn-primary" id="ob-create-account">${tr("ob_create_account")}</button>
          <button type="button" class="btn btn-ghost" id="ob-skip-auth">${tr("ob_skip_auth")}</button>
        </div>
      </section>
    </div>
    <div class="onboarding-footer" id="ob-footer">
      <div class="onboarding-dots" id="ob-dots">
        <span class="onboarding-dot is-active"></span><span class="onboarding-dot"></span><span class="onboarding-dot"></span><span class="onboarding-dot"></span>
      </div>
      <button type="button" class="btn btn-primary onboarding-next" id="ob-next">${tr("ob_next")}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const track = overlay.querySelector("#ob-track");
  const slides = [...overlay.querySelectorAll(".onboarding-slide")];
  const dots = [...overlay.querySelectorAll(".onboarding-dot")];
  const footer = overlay.querySelector("#ob-footer");
  const nextBtn = overlay.querySelector("#ob-next");
  const AUTH_SLIDE = slides.length - 1; // la última: registro, con sus propios botones
  let current = 0;
  let selectedType = null;
  let finished = false;

  function setActive(i) {
    current = i;
    dots.forEach((d, idx) => d.classList.toggle("is-active", idx === current));
    // La pantalla de registro trae sus propios botones (Google, crear
    // cuenta, ahora no) en vez del "Siguiente" compartido — así que
    // ese pie se oculta solo ahí.
    footer.classList.toggle("is-hidden", current === AUTH_SLIDE);
    nextBtn.textContent = current === AUTH_SLIDE - 1 ? tr("ob_start") : tr("ob_next");
  }

  function goTo(i) {
    const clamped = Math.max(0, Math.min(slides.length - 1, i));
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
    setActive(clamped);
  }

  // Sincroniza los puntos cuando el usuario desliza a mano (los
  // clics del botón ya llaman a setActive() al instante en goTo()).
  // "scrollend" dispara una sola vez, cuando el scroll ya se asentó
  // del todo — a diferencia de un "scroll" con debounce, que puede
  // leer una posición intermedia justo cuando el temporizador
  // dispara y quedarse pillado en el punto equivocado.
  const syncDotsFromScroll = () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== current) setActive(i);
  };
  if ("onscrollend" in window) {
    track.addEventListener("scrollend", syncDotsFromScroll);
  } else {
    let scrollTimer = null;
    track.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(syncDotsFromScroll, 120);
    });
  }

  overlay.querySelectorAll("#ob-traveler-chips .onboarding-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      overlay.querySelectorAll(".onboarding-chip").forEach((c) => c.classList.remove("is-selected"));
      chip.classList.add("is-selected");
      selectedType = chip.dataset.type;
    });
  });

  async function finish() {
    if (finished) return;
    finished = true;
    await Data.settingSet(ONBOARDING_KEY, true);
    if (selectedType) await Data.settingSet(TRAVELER_TYPE_KEY, selectedType);
    overlay.classList.add("is-leaving");
    setTimeout(() => {
      overlay.remove();
      onDone();
    }, 240);
  }

  // "Siguiente" avanza de pantalla en pantalla; al llegar a la de
  // registro ya no hace nada (el pie con este botón está oculto ahí,
  // ver setActive) — esa pantalla termina sola, con sus propios
  // botones (Google, crear cuenta, o "Ahora no").
  nextBtn.addEventListener("click", () => {
    if (current < AUTH_SLIDE) goTo(current + 1);
  });
  // El "Omitir" de arriba salta TODO de una vez, registro incluido —
  // es la salida más rápida desde cualquier pantalla.
  overlay.querySelector("#ob-skip").addEventListener("click", finish);

  // ---------- Pantalla de registro (la última) ----------
  const authGoogleBtn = overlay.querySelector("#ob-google");
  const authEmailEl = overlay.querySelector("#ob-email");
  const authPasswordEl = overlay.querySelector("#ob-password");
  const authErrorEl = overlay.querySelector("#ob-auth-error");
  const authCreateBtn = overlay.querySelector("#ob-create-account");

  authGoogleBtn.addEventListener("click", async () => {
    authErrorEl.textContent = "";
    authGoogleBtn.disabled = true;
    const { user, error, cancelled, redirecting } = await signInWithGoogle();
    if (redirecting) return; // la página está navegando a Google
    authGoogleBtn.disabled = false;
    if (cancelled) return;
    if (error) { authErrorEl.textContent = error; return; }
    await finish();
    await afterLogin(user);
  });

  authCreateBtn.addEventListener("click", async () => {
    authErrorEl.textContent = "";
    const { user, error } = await signUp(authEmailEl.value.trim(), authPasswordEl.value);
    if (error) { authErrorEl.textContent = error; return; }
    await finish();
    // Cuenta recién creada: sube lo que ya haya en este dispositivo
    // (normalmente nada todavía, pero por si ya se creó algún viaje
    // antes de registrarse).
    await pushToCloud();
  });

  overlay.querySelector("#ob-skip-auth").addEventListener("click", finish);
}

export { shouldShowOnboarding, renderOnboarding };
