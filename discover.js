// ============================================================
// discover.js — Sugerencias turísticas (función GRATIS): lugares
// de interés (Wikipedia) y alojamientos cercanos (OpenStreetMap /
// Overpass) alrededor de un punto. Ambas fuentes son públicas y
// gratuitas, sin clave — igual de espíritu que geocode.js y
// photo.js. Si fallan (sin conexión, límite de uso puntual),
// devuelven una lista vacía: nunca rompen el resto de la app.
// ============================================================

const WIKI_API_URL = "https://es.wikipedia.org/w/api.php";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/**
 * Lugares de interés turístico cerca de unas coordenadas, usando
 * los artículos de Wikipedia más próximos (con resumen y foto si
 * la tienen). `radiusM` en metros.
 */
async function nearbyAttractions(lat, lng, { radiusM = 3000, limit = 10 } = {}) {
  try {
    const searchUrl =
      `${WIKI_API_URL}?action=query&list=geosearch` +
      `&gscoord=${lat}|${lng}&gsradius=${radiusM}&gslimit=${limit}` +
      `&format=json&origin=*`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const found = (searchData.query && searchData.query.geosearch) || [];
    if (!found.length) return [];

    // Segunda llamada: resumen + miniatura de cada artículo encontrado.
    const titles = found.map((r) => r.title).join("|");
    const detailUrl =
      `${WIKI_API_URL}?action=query&prop=extracts|pageimages` +
      `&exintro=1&explaintext=1&piprop=thumbnail&pithumbsize=300` +
      `&titles=${encodeURIComponent(titles)}&format=json&origin=*`;
    const detailRes = await fetch(detailUrl);
    const detailData = detailRes.ok ? await detailRes.json() : null;
    const pages = (detailData && detailData.query && detailData.query.pages) || {};
    const byTitle = {};
    for (const page of Object.values(pages)) byTitle[page.title] = page;

    return found.map((r) => {
      const page = byTitle[r.title] || {};
      const extract = page.extract || "";
      return {
        name: r.title,
        lat: r.lat,
        lng: r.lon,
        summary: extract.length > 200 ? extract.slice(0, 200) + "…" : extract,
        photoUrl: page.thumbnail ? page.thumbnail.source : null,
      };
    });
  } catch (err) {
    return []; // sin conexión, o la API no responde
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
