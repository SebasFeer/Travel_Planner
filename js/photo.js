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

// Lo mismo, pero para hoteles: cadenas o edificios históricos con
// artículo propio en Wikipedia suelen desambiguarse así.
const HOTEL_TITLE_SUFFIXES = [" (hotel)", " Hotel"];

// Quita tildes y pasa a minúsculas, para comparar nombres sin que un
// acento marque la diferencia entre "coincide" y "no coincide".
function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const LODGING_TYPES = ["hotel", "hostel", "guest_house", "motel", "apartment", "chalet"];

/**
 * Resuelve un tag "wikimedia_commons" de OpenStreetMap (p. ej.
 * "File:Hotel Ritz Madrid.jpg") a la URL real del archivo.
 */
async function fetchCommonsFileUrl(commonsTag) {
  if (!commonsTag || !commonsTag.startsWith("File:")) return null;
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(commonsTag)}` +
    `&prop=imageinfo&iiprop=url&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data.query && data.query.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  const info = page && page.imageinfo && page.imageinfo[0];
  return (info && info.url) || null;
}

/**
 * Identifica ESE hotel concreto (nombre + dirección) en OpenStreetMap
 * vía Nominatim y, solo si el propio mapa tiene una foto etiquetada
 * para él (tag "image" o "wikimedia_commons"), la devuelve. Si no
 * hay una coincidencia de nombre confirmada, o el mapa no tiene foto
 * para ese hotel, devuelve null — mejor sin foto que una equivocada.
 */
async function fetchOsmLodgingPhoto(name, address) {
  const q = address ? `${name}, ${address}` : name;
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&namedetails=1&limit=5` +
    `&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const results = await res.json();

  const normName = normalizeName(name);
  const match = results.find((r) => {
    const isLodging =
      (r.class === "tourism" && LODGING_TYPES.includes(r.type)) ||
      (r.class === "building" && r.type === "hotel");
    if (!isLodging) return false;
    const resultName = (r.namedetails && r.namedetails.name) || r.name || r.display_name || "";
    return normalizeName(resultName).includes(normName);
  });

  const tags = match && match.extratags;
  if (!tags) return null;
  if (tags.image && /^https?:\/\//.test(tags.image)) return tags.image;
  if (tags.wikimedia_commons) return await fetchCommonsFileUrl(tags.wikimedia_commons);
  return null;
}

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

/**
 * Foto de un hotel concreto. A propósito NO hace una búsqueda por
 * relevancia tipo "<nombre> hotel" (eso es justo lo que causaba el
 * bug: con un nombre de hotel genérico u homónimo, ese buscador
 * devolvía cualquier artículo "parecido" en vez del hotel real).
 * En su lugar, solo dos vías que confirman que es ESE hotel:
 *   1) Su artículo propio en Wikipedia, si lo tiene (cadenas,
 *      edificios históricos...).
 *   2) Su ficha en OpenStreetMap (por nombre + dirección), si el
 *      mapa tiene una foto etiquetada para ella.
 * Si ninguna de las dos lo confirma, devuelve null: la tarjeta se
 * queda con el icono de color, que es preferible a una foto de otro
 * sitio con el mismo nombre.
 */
async function fetchHotelPhoto(name, address) {
  for (const suffix of HOTEL_TITLE_SUFFIXES) {
    let url = null;
    try {
      url = await fetchWikipediaPhotoByTitle(`${name}${suffix}`);
    } catch (err) {
      /* sin conexión: probamos la siguiente forma */
    }
    if (url) return url;
  }
  try {
    const url = await fetchOsmLodgingPhoto(name, address);
    if (url) return url;
  } catch (err) {
    /* sin conexión: nos quedamos sin foto de OSM */
  }
  return null;
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
/**
 * Busca una foto real para un destino (ciudad/país), el logo de una
 * aerolínea (context "airline") o la foto de un hotel concreto
 * (context "hotel", usando también `extra` como su dirección para
 * localizarlo con precisión). Para aerolíneas y hoteles no se confía
 * en el ranking del buscador por palabra clave (puede preferir una
 * homónima, como "Iberia" la región o cualquier hotel con nombre
 * genérico) — solo se usa una fuente cuando confirma que es ESE
 * elemento exacto: el título exacto en Wikipedia, o (para hoteles)
 * su ficha localizada en OpenStreetMap. Si no hay confirmación, se
 * devuelve null antes que arriesgarse a una foto de otra cosa.
 * Devuelve la URL de la imagen, o null si no se encuentra nada o
 * falla la conexión (en cuyo caso la tarjeta se queda con el icono
 * de color de siempre). Los resultados se cachean en memoria durante
 * la sesión para no repetir peticiones al re-renderizar la lista.
 */
async function findDestinationPhoto(query, context, extra) {
  if (!query) return null;
  const cacheKey = context ? `${context}:${extra || ""}:${query}` : query;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  let url = null;
  try {
    if (context === "airline") url = await fetchAirlinePhoto(query);
    else if (context === "hotel") url = await fetchHotelPhoto(query, extra);
    else url = await fetchWikipediaPhoto(query);
  } catch (err) {
    /* sin conexión u otro fallo: probamos el siguiente origen */
  }

  // El respaldo genérico de Openverse (búsqueda por palabra clave)
  // solo tiene sentido para destinos, donde cualquier foto ilustrativa
  // del lugar vale. Para hoteles NO se usa: sería la misma búsqueda
  // difusa que causaba el bug, así que ahí es mejor no tener foto que
  // tener una de otro sitio.
  if (!url && context !== "hotel") {
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
