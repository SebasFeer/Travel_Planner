// ============================================================
// discover.js — Sugerencias turísticas (función GRATIS): lugares
// de interés y alojamientos cercanos a un punto. Fuente principal:
// OpenStreetMap/Overpass, filtrando solo por etiquetas turísticas
// (museos, monumentos, miradores, atracciones...) para no traer
// cualquier cosa cercana. Cuando el lugar tiene artículo de
// Wikipedia enlazado, se usa para traer una foto y un resumen.
// Todo público y gratuito, sin clave. Si falla (sin conexión,
// límite de uso puntual), devuelve una lista vacía — nunca rompe
// el resto de la app.
// ============================================================

import { throttle } from "./geocode.js";

const WIKI_API_BASE = "wikipedia.org/w/api.php";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const ATTRACTION_TOURISM_TAGS = [
  "attraction",
  "museum",
  "gallery",
  "viewpoint",
  "artwork",
  "zoo",
  "theme_park",
  "aquarium",
];

const CATEGORY_LABELS = {
  attraction: "Atracción turística",
  museum: "Museo",
  gallery: "Galería de arte",
  viewpoint: "Mirador",
  artwork: "Obra de arte pública",
  zoo: "Zoológico",
  theme_park: "Parque temático",
  aquarium: "Acuario",
  monument: "Monumento",
  memorial: "Memorial",
  castle: "Castillo",
  fort: "Fortaleza",
  ruins: "Ruinas",
  archaeological_site: "Yacimiento arqueológico",
  church: "Iglesia histórica",
  monastery: "Monasterio",
  city_gate: "Puerta histórica",
  building: "Edificio histórico",
};

// "es:Torre Eiffel" -> { lang: "es", title: "Torre Eiffel" }
function parseWikipediaTag(tag) {
  if (!tag) return null;
  const idx = tag.indexOf(":");
  if (idx === -1) return { lang: "es", title: tag };
  return { lang: tag.slice(0, idx), title: tag.slice(idx + 1) };
}

async function fetchWikipediaSummary(lang, title) {
  try {
    const url =
      `https://${lang}.${WIKI_API_BASE}?action=query&prop=extracts|pageimages` +
      `&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=300` +
      `&titles=${encodeURIComponent(title)}&format=json&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = (data.query && data.query.pages) || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing) return null;
    const extract = page.extract || "";
    return {
      summary: extract.length > 200 ? extract.slice(0, 200) + "…" : extract,
      photoUrl: page.thumbnail ? page.thumbnail.source : null,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Lugares de interés TURÍSTICO cerca de unas coordenadas: solo
 * sitios con etiqueta de turismo/histórico en OpenStreetMap (no
 * cualquier edificio o negocio cercano). `radiusM` en metros.
 */
async function nearbyAttractions(lat, lng, { radiusM = 3000, limit = 10 } = {}) {
  try {
    const tourismFilter = ATTRACTION_TOURISM_TAGS.join("|");
    const query = `
      [out:json][timeout:20];
      (
        node["tourism"~"^(${tourismFilter})$"]["name"](around:${radiusM},${lat},${lng});
        node["historic"]["name"](around:${radiusM},${lat},${lng});
      );
      out center ${limit * 2};
    `;
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) return [];
    const data = await res.json();
    // No hay ninguna métrica de popularidad gratuita en OpenStreetMap,
    // pero tener artículo propio en Wikipedia es una señal razonable
    // de que es un sitio realmente conocido (no un banco o una farola
    // etiquetados como "atracción"): se ordenan primero antes de
    // recortar a `limit`, así lo más probable es que salgan los
    // monumentos/museos de verdad famosos en vez de lo primero que
    // devuelva Overpass en su orden interno (arbitrario).
    const elements = (data.elements || [])
      .filter((el) => el.tags && el.tags.name)
      .sort((a, b) => (b.tags.wikipedia ? 1 : 0) - (a.tags.wikipedia ? 1 : 0))
      .slice(0, limit);

    return await Promise.all(
      elements.map(async (el) => {
        const category =
          CATEGORY_LABELS[el.tags.tourism] ||
          CATEGORY_LABELS[el.tags.historic] ||
          "Lugar de interés";

        let summary = "";
        let photoUrl = null;
        const parsed = parseWikipediaTag(el.tags.wikipedia);
        if (parsed) {
          const details = await fetchWikipediaSummary(parsed.lang, parsed.title);
          if (details) {
            summary = details.summary;
            photoUrl = details.photoUrl;
          }
        }

        return {
          name: el.tags.name,
          lat: el.lat,
          lng: el.lon,
          category,
          summary,
          photoUrl,
        };
      })
    );
  } catch (err) {
    return []; // sin conexión, o Overpass no responde
  }
}

/**
 * Alojamientos (hoteles, hostales, apartamentos, casas de huéspedes)
 * cerca de unas coordenadas, vía Overpass (datos de OpenStreetMap).
 */
async function nearbyLodging(lat, lng, { radiusM = 2000, limit = 10 } = {}) {
  try {
    const query = `
      [out:json][timeout:15];
      node["tourism"~"^(hotel|hostel|guest_house|apartment)$"]["name"](around:${radiusM},${lat},${lng});
      out center ${limit};
    `;
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const elements = data.elements || [];

    const TYPE_LABELS = {
      hotel: "Hotel",
      hostel: "Hostal",
      guest_house: "Casa de huéspedes",
      apartment: "Apartamento turístico",
    };

    return elements.slice(0, limit).map((el) => ({
      name: el.tags.name,
      typeLabel: TYPE_LABELS[el.tags.tourism] || "Alojamiento",
      lat: el.lat,
      lng: el.lon,
    }));
  } catch (err) {
    return []; // sin conexión, límite de Overpass, etc.
  }
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Traduce los tipos de Nominatim más comunes a una etiqueta legible.
// No hace falta que sea exhaustivo: si no está aquí, se usa tal cual
// venga de OpenStreetMap (con los guiones bajos cambiados a espacios).
const PLACE_TYPE_LABELS = {
  ...CATEGORY_LABELS,
  hotel: "Hotel",
  restaurant: "Restaurante",
  cafe: "Cafetería",
  bar: "Bar",
  park: "Parque",
  beach: "Playa",
  place_of_worship: "Lugar de culto",
  supermarket: "Supermercado",
  mall: "Centro comercial",
};

/**
 * Busca un sitio concreto por nombre (pestaña "Buscar" de Descubre),
 * en vez de listar sugerencias automáticas alrededor de un punto.
 * `near` (p. ej. el destino del viaje) se añade a la consulta para
 * priorizar resultados de esa zona sin restringirlos del todo, por
 * si el usuario busca algo que está un poco fuera del centro.
 */
async function searchPlaces(query, near, { limit = 6 } = {}) {
  if (!query) return [];
  try {
    const q = near ? `${query}, ${near}` : query;
    const url =
      `${NOMINATIM_URL}?format=jsonv2&namedetails=1&limit=${limit}` +
      `&q=${encodeURIComponent(q)}`;
    // Comparte el throttle de geocode.js: es la misma Nominatim, con el
    // mismo límite de 1 petición/segundo desde el navegador.
    await throttle();
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const results = await res.json();
    return results
      .filter((r) => r.namedetails && r.namedetails.name)
      .map((r) => ({
        name: r.namedetails.name,
        category: PLACE_TYPE_LABELS[r.type] || (r.type ? r.type.replace(/_/g, " ") : "Lugar"),
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      }));
  } catch (err) {
    return []; // sin conexión, o Nominatim no responde
  }
}

export { nearbyAttractions, nearbyLodging, searchPlaces };
