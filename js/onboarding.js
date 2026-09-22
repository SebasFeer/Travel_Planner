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
import { icon, brandMark } from "./icons.js";

const ONBOARDING_KEY = "onboarding_seen";
const TRAVELER_TYPE_KEY = "traveler_type";

async function shouldShowOnboarding() {
  const seen = await Data.settingGet(ONBOARDING_KEY);
  return !seen;
}

const TRAVELER_TYPES = [
  { id: "solo", label: "Solo/a", icon: "user" },
  { id: "pareja", label: "En pareja", icon: "heart" },
  { id: "familia", label: "En familia", icon: "home" },
  { id: "grupo", label: "Con amigos", icon: "luggage" },
];

const FEATURE_ICONS = ["itinerary", "flights", "expenses", "checklist", "map"];

/**
 * Pinta la bienvenida a pantalla completa y llama a `onDone` cuando
 * el usuario la termina o la omite (nunca se queda atascada: ambos
 * caminos guardan el flag y desmontan el overlay).
 */
function renderOnboarding(onDone) {
  const overlay = document.createElement("div");
  overlay.className = "onboarding-overlay";
  overlay.innerHTML = `
    <button type="button" class="onboarding-skip" id="ob-skip">Omitir</button>
    <div class="onboarding-track" id="ob-track">
      <section class="onboarding-slide">
        <div class="onboarding-mark">${brandMark()}</div>
        <h1>Organiza cada viaje en un solo lugar</h1>
        <p>Itinerario, vuelos, gastos y mapa — todo junto, y funciona incluso sin conexión.</p>
      </section>
      <section class="onboarding-slide">
        <div class="onboarding-icons">
          ${FEATURE_ICONS.map((n) => `<span class="onboarding-icon-chip">${icon(n)}</span>`).join("")}
        </div>
        <h1>Nada de capturas de pantalla sueltas</h1>
        <p>Guarda reservas, actividades y presupuesto en su sitio, listos para consultar al instante.</p>
      </section>
      <section class="onboarding-slide">
        <h1>¿Cómo sueles viajar?</h1>
        <p>Nos ayuda a mostrarte lo más útil primero — puedes cambiarlo después.</p>
        <div class="onboarding-chips" id="ob-traveler-chips">
          ${TRAVELER_TYPES.map(
            (t) => `<button type="button" class="onboarding-chip" data-type="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`
          ).join("")}
        </div>
      </section>
    </div>
    <div class="onboarding-footer">
      <div class="onboarding-dots" id="ob-dots">
        <span class="onboarding-dot is-active"></span><span class="onboarding-dot"></span><span class="onboarding-dot"></span>
      </div>
      <button type="button" class="btn btn-primary onboarding-next" id="ob-next">Siguiente</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const track = overlay.querySelector("#ob-track");
  const slides = [...overlay.querySelectorAll(".onboarding-slide")];
  const dots = [...overlay.querySelectorAll(".onboarding-dot")];
  const nextBtn = overlay.querySelector("#ob-next");
  let current = 0;
  let selectedType = null;
  let finished = false;

  function setActive(i) {
    current = i;
    dots.forEach((d, idx) => d.classList.toggle("is-active", idx === current));
    nextBtn.textContent = current === slides.length - 1 ? "Empezar" : "Siguiente";
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

  nextBtn.addEventListener("click", () => {
    if (current < slides.length - 1) goTo(current + 1);
    else finish();
  });
  overlay.querySelector("#ob-skip").addEventListener("click", finish);
}

export { shouldShowOnboarding, renderOnboarding };
