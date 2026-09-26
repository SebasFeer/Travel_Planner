// ============================================================
// features/discover.js — "Descubre" en la web.
//
// Equivale a openDiscoverSheet() de js/app.js (pestañas "Populares"
// y "Buscar"), con las mismas fuentes públicas de js/discover.js
// (OpenStreetMap/Overpass + Wikipedia, Nominatim). Además, como en
// la búsqueda de destinos de la app, deja ver alojamientos cercanos
// (nearbyLodging) y guardarlos como hotel del viaje.
//
// Lo que se guarda es idéntico a lo de la app:
//   - Itinerario: { title, date: trip.start_date || "", location, order }
//     (ctx.saveItem añade order = Date.now() y trip_id).
//   - Hotel: los campos del formulario de hotel de la app.
// ============================================================

import { nearbyAttractions, nearbyLodging, searchPlaces } from "../../../js/discover.js";
import { geocode } from "../../../js/geocode.js";
import { mapsQueryUrl } from "../../../js/utils.js";

// Mismos campos que openHotelForm() de js/sections.js.
const HOTEL_FIELDS = [
  { name: "name", label: "Nombre", required: true, full: true },
  { name: "address", label: "Dirección", full: true },
  { name: "check_in", label: "Entrada", type: "date" },
  { name: "check_in_time", label: "Hora de entrada (opcional)", type: "time" },
  { name: "check_out", label: "Salida", type: "date" },
  { name: "booking_code", label: "Código de reserva" },
  { name: "price", label: "Precio (€)", type: "number", step: "0.01" },
  { name: "notes", label: "Notas", type: "textarea", full: true },
];

const CATEGORIES = [
  { id: "popular", label: "Populares", icon: "🏛️" },
  { id: "lodging", label: "Alojamiento", icon: "🛏️" },
  { id: "search", label: "Buscar", icon: "🔎" },
];

// Mismas opciones que buildMapsOptions() de js/app.js (tipo "point").
function mapsOptions(location) {
  const text = (location || "").trim();
  if (!text) return [];
  const enc = encodeURIComponent(text);
  const opts = [
    { label: "Google Maps", url: mapsQueryUrl(text) },
    { label: "Waze", url: `https://waze.com/ul?q=${enc}&navigate=yes` },
  ];
  if (/iP(hone|ad|od)/i.test(navigator.userAgent)) opts.push({ label: "Mapas", url: `https://maps.apple.com/?q=${enc}` });
  return opts.filter((o) => o.url);
}

export function openDiscover(trip, ctx) {
  const { esc } = ctx;
  const destination = (trip.destination || "").trim();

  // Estado de la ventana
  let zone = destination; // zona alrededor de la que se buscan sitios
  let category = "popular";
  let coordsPromise = null; // geocode(zone), una vez por zona
  let lists = {}; // por categoría: { items, shown:Set, radiusM, limit, more, loaded }
  let searchResults = null; // null = aún no se buscó
  let searchQuery = "";
  const added = new Set(); // "itinerary|Nombre" / "hotels|Nombre" ya añadidos en esta ventana
  let seq = 0; // descarta respuestas de una zona/categoría anterior

  const html = `
    <div class="dsc">
      <form class="dsc-zone" data-zone-form>
        <label class="field">
          <span class="label">Zona</span>
          <input type="text" data-zone value="${esc(zone)}" placeholder="Ciudad o barrio (p. ej. &quot;Roma, Italia&quot;)" autocomplete="off" />
        </label>
        <button class="btn btn-secondary btn-sm" type="submit">Cambiar zona</button>
      </form>
      <div class="dsc-cats" role="tablist" aria-label="Categorías">
        ${CATEGORIES.map((c) => `<button type="button" class="chip-btn" role="tab" data-cat="${c.id}" aria-pressed="${c.id === category}"><span aria-hidden="true">${c.icon}</span> ${c.label}</button>`).join("")}
      </div>
      <form class="dsc-search" data-search-form hidden>
        <input type="search" data-q placeholder="Nombre del sitio (p. ej. &quot;Torre Eiffel&quot;)" autocomplete="off" />
        <button class="btn btn-primary btn-sm" type="submit">Buscar</button>
      </form>
      <p class="dsc-heading" data-heading></p>
      <div class="dsc-list" data-list aria-live="polite"></div>
      <div class="dsc-foot" data-foot></div>
    </div>`;

  const { root } = ctx.openSheet({
    title: `Descubre ${destination || "tu destino"}`,
    html,
    wide: true,
  });

  const $ = (sel) => root.querySelector(sel);
  const listEl = $("[data-list]");
  const footEl = $("[data-foot]");
  const headingEl = $("[data-heading]");
  const zoneInput = $("[data-zone]");
  const searchForm = $("[data-search-form]");
  const qInput = $("[data-q]");

  function loadingHtml(text) {
    return `<div class="dsc-loading"><span class="dsc-spinner" aria-hidden="true">🧭</span><p>${esc(text)}</p></div>`;
  }
  function emptyHtml(text) {
    return `<p class="dsc-empty">${esc(text)}</p>`;
  }

  // ---------- Tarjetas ----------
  function cardHtml(item, i) {
    const thumb = item.photoUrl
      ? `<img class="dsc-thumb" src="${esc(item.photoUrl)}" alt="" loading="lazy" />`
      : `<div class="dsc-thumb dsc-thumb-empty" aria-hidden="true">${item.kind === "lodging" ? "🛏️" : "🧭"}</div>`;
    const canItin = item.kind !== "lodging";
    const canHotel = item.kind === "lodging" || item.kind === "search";
    const itinDone = added.has(`itinerary|${item.name}`);
    const hotelDone = added.has(`hotels|${item.name}`);
    return `
      <article class="dsc-card" data-i="${i}">
        ${thumb}
        <div class="dsc-info">
          <p class="dsc-name">${esc(item.name)}</p>
          ${item.category ? `<p class="dsc-cat">${esc(item.category)}</p>` : ""}
          ${item.summary ? `<p class="dsc-summary">${esc(item.summary)}</p>` : ""}
          <div class="dsc-actions">
            <button type="button" class="chip-btn" data-act="maps" aria-expanded="false">📍 Ver en mapa</button>
            ${canItin ? `<button type="button" class="chip-btn dsc-add" data-act="itinerary" ${itinDone ? "disabled" : ""}>${itinDone ? "✓ En el itinerario" : "+ Itinerario"}</button>` : ""}
            ${canHotel ? `<button type="button" class="chip-btn dsc-add" data-act="hotels" ${hotelDone ? "disabled" : ""}>${hotelDone ? "✓ En hoteles" : "+ Hoteles"}</button>` : ""}
          </div>
          <div class="dsc-maps" data-maps hidden></div>
        </div>
      </article>`;
  }

  function currentItems() {
    if (category === "search") return searchResults || [];
    return lists[category]?.items || [];
  }

  function paintList() {
    const items = currentItems();
    listEl.innerHTML = items.map(cardHtml).join("");
  }

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".dsc-card");
    const item = currentItems()[parseInt(card.dataset.i, 10)];
    if (!item) return;
    const act = btn.dataset.act;

    if (act === "maps") {
      const box = card.querySelector("[data-maps]");
      const open = box.hidden;
      if (open) {
        const location = zone ? `${item.name}, ${zone}` : item.name;
        const opts = mapsOptions(location);
        box.innerHTML = opts.length
          ? `<span class="muted small">¿Con qué app quieres abrirlo?</span>${opts
              .map((o) => `<a class="chip-btn" href="${esc(o.url)}" target="_blank" rel="noopener">${esc(o.label)} ↗</a>`)
              .join("")}`
          : `<span class="muted small">Introduce primero un lugar.</span>`;
      }
      box.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      return;
    }

    if (act === "itinerary") {
      // Igual que wireAddButtons() de openDiscoverSheet (js/app.js).
      btn.disabled = true;
      await ctx.saveItem(
        "itinerary",
        null,
        { title: item.name, date: trip.start_date || "", location: item.name },
        `"${item.name}" añadido al itinerario`
      );
      added.add(`itinerary|${item.name}`);
      btn.textContent = "✓ En el itinerario";
      return;
    }

    if (act === "hotels") {
      ctx.openForm({
        title: "Nuevo hotel",
        fields: HOTEL_FIELDS,
        initial: {
          name: item.name,
          address: zone ? `${item.name}, ${zone}` : item.name,
          check_in: trip.start_date || "",
          check_out: trip.end_date || "",
        },
        onSave: async (values) => {
          await ctx.saveItem("hotels", null, values, "Hotel guardado");
          added.add(`hotels|${item.name}`);
          if (btn.isConnected) {
            btn.disabled = true;
            btn.textContent = "✓ En hoteles";
          }
        },
      });
    }
  });

  // ---------- Populares / Alojamiento ----------
  function getCoords() {
    if (!coordsPromise) coordsPromise = geocode(zone);
    return coordsPromise;
  }

  async function loadMore(cat) {
    const my = seq;
    const L = (lists[cat] ||= { items: [], shown: new Set(), radiusM: cat === "popular" ? 3000 : 2000, limit: 10, more: true, loaded: false });
    const first = !L.loaded;

    if (first) {
      headingEl.textContent = "";
      listEl.innerHTML = loadingHtml(
        cat === "popular" ? `Buscando sitios de interés en ${zone}…` : `Buscando alojamientos cerca de ${zone}…`
      );
      footEl.innerHTML = "";
    } else {
      const b = footEl.querySelector("button");
      if (b) {
        b.disabled = true;
        b.textContent = "Buscando más…";
      }
    }

    const coords = await getCoords();
    if (my !== seq || !root.isConnected) return;
    if (!coords) {
      L.loaded = false;
      delete lists[cat];
      coordsPromise = null; // se reintenta al volver a entrar
      listEl.innerHTML = emptyHtml(
        `No se pudo localizar "${zone}". Prueba a poner un destino más concreto (p. ej. "Roma, Italia"), o busca un sitio concreto en la pestaña "Buscar".`
      );
      return;
    }

    const found =
      cat === "popular"
        ? (await nearbyAttractions(coords.lat, coords.lng, { radiusM: L.radiusM, limit: L.limit })).map((a) => ({
            kind: "popular",
            name: a.name,
            category: a.category,
            summary: a.summary,
            photoUrl: a.photoUrl,
            lat: a.lat,
            lng: a.lng,
          }))
        : (await nearbyLodging(coords.lat, coords.lng, { radiusM: L.radiusM, limit: L.limit })).map((h) => ({
            kind: "lodging",
            name: h.name,
            category: h.typeLabel,
            lat: h.lat,
            lng: h.lng,
          }));
    if (my !== seq || !root.isConnected) return;

    // Igual que la app: cada "cargar más" amplía radio y límite y
    // descarta lo ya mostrado (por nombre).
    const fresh = found.filter((a) => a.name && !L.shown.has(a.name));
    fresh.forEach((a) => L.shown.add(a.name));
    L.items.push(...fresh);
    L.radiusM += 2000;
    L.limit += 10;
    L.more = fresh.length > 0;
    L.loaded = true;
    paintCategory();
  }

  function paintCategory() {
    if (category === "search") {
      headingEl.textContent = searchResults && searchResults.length ? `Resultados para "${searchQuery}"` : "";
      footEl.innerHTML = "";
      if (searchResults === null) listEl.innerHTML = emptyHtml(`Busca un sitio concreto por su nombre para añadirlo a tu viaje.`);
      else if (!searchResults.length)
        listEl.innerHTML = emptyHtml(`No encontramos "${searchQuery}". Prueba con un nombre más concreto.`);
      else paintList();
      return;
    }
    const L = lists[category];
    if (!L || !L.loaded) return loadMore(category);
    if (!L.items.length) {
      headingEl.textContent = "";
      footEl.innerHTML = "";
      listEl.innerHTML = emptyHtml(
        category === "popular"
          ? `No encontramos sugerencias para esta zona ahora mismo (puede que no haya conexión, o que el área tenga poca cobertura en estas fuentes). Prueba a buscar un sitio concreto en la pestaña "Buscar".`
          : "No se encontraron alojamientos cercanos con datos abiertos."
      );
      return;
    }
    headingEl.textContent = category === "popular" ? "Sitios más visitados" : "Alojamientos cercanos";
    paintList();
    footEl.innerHTML = L.more
      ? `<button class="btn btn-secondary btn-sm" type="button" data-more>${category === "popular" ? "Cargar más sitios" : "Cargar más alojamientos"}</button>`
      : `<p class="dsc-empty">${category === "popular" ? "No encontramos más sitios cercanos." : "No encontramos más alojamientos cercanos."}</p>`;
    footEl.querySelector("[data-more]")?.addEventListener("click", () => loadMore(category));
  }

  // ---------- Buscar ----------
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = qInput.value.trim();
    if (!q) return;
    const my = ++seq;
    searchQuery = q;
    headingEl.textContent = "";
    footEl.innerHTML = "";
    listEl.innerHTML = loadingHtml(`Buscando "${q}"…`);
    const results = await searchPlaces(q, zone);
    if (my !== seq || !root.isConnected) return;
    searchResults = results.map((r) => ({ kind: "search", name: r.name, category: r.category, lat: r.lat, lng: r.lng }));
    if (category === "search") paintCategory();
  });

  // ---------- Categorías ----------
  const catButtons = [...root.querySelectorAll("[data-cat]")];
  catButtons.forEach((b) =>
    b.addEventListener("click", () => {
      if (category === b.dataset.cat) return;
      category = b.dataset.cat;
      seq++;
      catButtons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      searchForm.hidden = category !== "search";
      if (category === "search") qInput.focus();
      paintCategory();
    })
  );

  // ---------- Zona ----------
  $("[data-zone-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const next = zoneInput.value.trim() || destination;
    zoneInput.value = next;
    if (!next || next === zone) return;
    zone = next;
    seq++;
    coordsPromise = null;
    lists = {};
    searchResults = null;
    if (category === "search" && qInput.value.trim()) searchForm.requestSubmit();
    else paintCategory();
  });

  if (!zone) {
    listEl.innerHTML = emptyHtml('Este viaje no tiene destino. Escribe una zona arriba o busca un sitio en la pestaña "Buscar".');
    return;
  }
  paintCategory();
}
