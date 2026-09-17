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

/**
 * Pide directamente el artículo con ESE título exacto (siguiendo
 * redirecciones), en vez de dejar que el buscador rankee por
 * relevancia. Sirve para desambiguar sin depender de qué tan bien
 * puntúe el motor de búsqueda una palabra homónima: si el título
 * exacto no existe, devuelve null sin más (nunca cae en otro
 * artículo "parecido").
 */
async function fetchWikipediaPhotoByTitle(title) {
  const url =
    `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}` +
    `&redirects=1&prop=pageimages&piprop=original&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null; // ese título no existe
  return (page.original && page.original.source) || null;
}

// Formas en que Wikipedia en español suele desambiguar el nombre de
// una aerolínea cuando coincide con otra palabra (región, apellido,
// letra griega...). Se prueban en orden antes de recurrir a la
// búsqueda normal.
const AIRLINE_TITLE_SUFFIXES = [
  " (aerolínea)",
  " (compañía aérea)",
  " (línea aérea)",
  " Airlines",
  " Airways",
];

// Lo mismo, pero para hoteles: muchos hoteles con nombre genérico o
// homónimo (una ciudad, un apellido...) tienen su artículo en
// Wikipedia desambiguado así.
const HOTEL_TITLE_SUFFIXES = [" (hotel)", " Hotel"];

async function fetchAirlinePhoto(name) {
  for (const suffix of AIRLINE_TITLE_SUFFIXES) {
    let url = null;
    try {
      url = await fetchWikipediaPhotoByTitle(`${name}${suffix}`);
    } catch (err) {
      /* sin conexión: probamos la siguiente forma */
    }
    if (url) return url;
  }
  // Ninguna variante de título exacto existe: probamos la búsqueda
  // normal, pero ya con "aerolínea" incluido en la consulta.
  for (const term of [`${name} aerolínea`, `${name} airline`]) {
    let url = null;
    try {
      url = await fetchWikipediaPhoto(term);
    } catch (err) {
      /* sin conexión: probamos el siguiente término */
    }
    if (url) return url;
  }
  return null;
}

async function fetchHotelPhoto(name) {
  for (const suffix of HOTEL_TITLE_SUFFIXES) {
    let url = null;
    try {
      url = await fetchWikipediaPhotoByTitle(`${name}${suffix}`);
    } catch (err) {
      /* sin conexión: probamos la siguiente forma */
    }
    if (url) return url;
  }
  // La mayoría de hoteles concretos no tienen artículo propio en
  // Wikipedia (solo cadenas/edificios históricos la tienen), así que
  // esta búsqueda normal es más bien la excepción, no la regla —
  // el respaldo real para hoteles suele ser Openverse, más abajo.
  let url = null;
  try {
    url = await fetchWikipediaPhoto(`${name} hotel`);
  } catch (err) {
    /* sin conexión: seguimos sin foto de Wikipedia */
  }
  return url;
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
 * Busca una foto real para un destino (ciudad/país), el logo de una
 * aerolínea (context "airline") o la foto de un hotel (context
 * "hotel"). Para ambos casos de negocio, en vez de confiar en el
 * ranking del buscador (que puede preferir una palabra homónima con
 * coincidencia exacta de título, como "Iberia" la región o el nombre
 * de una ciudad), se prueban primero los títulos exactos típicos con
 * los que Wikipedia en español desambigua ese tipo de artículo — p.
 * ej. "Iberia (aerolínea)" o "Ritz (hotel)" — sin que el usuario
 * tenga que escribir nada de eso él mismo. Si ningún hotel tiene
 * artículo propio (lo habitual, salvo cadenas o edificios históricos),
 * se cae directamente en el respaldo de Openverse.
 * Devuelve la URL de la imagen, o null si no se encuentra nada o
 * falla la conexión (en cuyo caso la tarjeta se queda con el icono
 * de color de siempre). Los resultados se cachean en memoria durante
 * la sesión para no repetir peticiones al re-renderizar la lista.
 */
async function findDestinationPhoto(query, context) {
  if (!query) return null;
  const cacheKey = context ? `${context}:${query}` : query;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  let url = null;
  try {
    if (context === "airline") url = await fetchAirlinePhoto(query);
    else if (context === "hotel") url = await fetchHotelPhoto(query);
    else url = await fetchWikipediaPhoto(query);
  } catch (err) {
    /* sin conexión u otro fallo: probamos el siguiente origen */
  }

  if (!url) {
    const openverseQuery =
      context === "airline" ? `${query} airline logo` : context === "hotel" ? `${query} hotel` : query;
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
