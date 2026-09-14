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
 * Busca una foto real para un destino (ciudad/país). Devuelve la URL
 * de la imagen, o null si no se encuentra nada o falla la conexión
 * (en cuyo caso la tarjeta se queda con el icono de color de siempre).
 * Los resultados se cachean en memoria durante la sesión para no
 * repetir peticiones al re-renderizar la lista de viajes.
 */
async function findDestinationPhoto(destination) {
  if (!destination) return null;
  if (memoryCache.has(destination)) return memoryCache.get(destination);

  let url = null;
  try {
    url = await fetchWikipediaPhoto(destination);
  } catch (err) {
    /* sin conexión u otro fallo: probamos el siguiente origen */
  }

  if (!url) {
    try {
      url = await fetchOpenversePhoto(destination);
    } catch (err) {
      /* sin conexión: nos quedamos sin foto, no pasa nada */
    }
  }

  memoryCache.set(destination, url);
  return url;
}

export { findDestinationPhoto };
