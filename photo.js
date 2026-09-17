// ============================================================
// photo.js — Foto real del destino para las tarjetas de "Mis viajes".
// Usa fuentes públicas sin necesidad de API key (Wikipedia y, si no
// encuentra nada, Openverse). Totalmente opcional: si no hay conexión
// o no se encuentra ninguna imagen, se devuelve null y la tarjeta
// sigue mostrando el icono de color como hasta ahora — nunca debe
// romper el resto de la app.
// ============================================================

const memoryCache = new Map();

async function fetchWikipediaPhoto(query) {
  const url =
    `https://es.wikipedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` +
    `&prop=pageimages&piprop=original&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return (page && page.original && page.original.source) || null;
}

async function fetchOpenversePhoto(query) {
  const url =
    `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
    `&license_type=all&page_size=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const first = data.results && data.results[0];
  return (first && (first.url || first.thumbnail)) || null;
}

/**
 * Busca una foto real para un destino (ciudad/país), o el logo de una
 * aerolínea cuando context es "airline". En ese caso se añade
 * automáticamente el término "aerolínea"/"airline" a la búsqueda,
 * para no confundir el nombre de la compañía con una palabra
 * homónima (p. ej. "Iberia" la región vs. Iberia la aerolínea) sin
 * que el usuario tenga que escribirlo él mismo.
 * Devuelve la URL de la imagen, o null si no se encuentra nada o
 * falla la conexión (en cuyo caso la tarjeta se queda con el icono
 * de color de siempre). Los resultados se cachean en memoria durante
 * la sesión para no repetir peticiones al re-renderizar la lista.
 */
async function findDestinationPhoto(query, context) {
  if (!query) return null;
  const cacheKey = context ? `${context}:${query}` : query;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  const searchTerms =
    context === "airline" ? [`${query} aerolínea`, `${query} airline`, query] : [query];

  let url = null;
  for (const term of searchTerms) {
    try {
      url = await fetchWikipediaPhoto(term);
    } catch (err) {
      /* sin conexión u otro fallo: probamos el siguiente término/origen */
    }
    if (url) break;
  }

  if (!url) {
    const openverseQuery = context === "airline" ? `${query} airline logo` : query;
    try {
      url = await fetchOpenversePhoto(openverseQuery);
    } catch (err) {
      /* sin conexión: nos quedamos sin foto, no pasa nada */
    }
  }

  memoryCache.set(cacheKey, url);
  return url;
}

export { findDestinationPhoto };
