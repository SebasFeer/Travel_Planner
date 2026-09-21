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
    const elements = (data.elements || [])
      .filter((el) => el.tags && el.tags.name)
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

export { nearbyAttractions, nearbyLodging };
