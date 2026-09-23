// ============================================================
// geocode.js — Convierte direcciones/lugares en coordenadas
// (Nominatim/OpenStreetMap) y calcula rutas entre paradas (OSRM).
// Ambos son servicios públicos gratuitos, sin necesidad de API key.
// ============================================================

import { Data } from "./db.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

// Nominatim pide un máximo de 1 petición por segundo desde el navegador.
let lastRequestAt = 0;
async function throttle() {
  const wait = lastRequestAt + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function normalize(text) {
  return (text || "").trim().toLowerCase();
}

/**
 * Sugerencias de lugares mientras se escribe (autocompletar). A
 * diferencia de geocode() -que se queda con el primer resultado y
 * sirve para "convertir texto ya elegido en coordenadas"- esta
 * función pide varios candidatos con su nombre completo, para que
 * el usuario elija el correcto antes de buscar nada más. Sin caché
 * (son sugerencias de paso, no direcciones que se vayan a reusar).
 */
async function searchPlaces(text, limit = 6) {
  const query = (text || "").trim();
  if (query.length < 2) return [];
  try {
    await throttle();
    const url = `${NOMINATIM_URL}?format=json&addressdetails=1&limit=${limit}&accept-language=es&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const results = await res.json();
    if (!Array.isArray(results)) return [];
    return results.map((r) => ({
      label: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch (err) {
    return []; // sin conexión, o el servicio no responde
  }
}

/**
 * Convierte un texto de lugar ("Coliseo, Roma") en {lat, lng}.
 * Devuelve null si no se encuentra o si falla la red (sin conexión).
 * Los resultados se cachean en IndexedDB para no repetir peticiones.
 */
async function geocode(text) {
  const query = normalize(text);
  if (!query) return null;

  const cached = await Data.geocacheGet(query).catch(() => null);
  if (cached) return { lat: cached.lat, lng: cached.lng };

  try {
    await throttle();
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const results = await res.json();
    if (!results || !results.length) return null;

    const lat = parseFloat(results[0].lat);
    const lng = parseFloat(results[0].lon);
    await Data.geocacheSet(query, lat, lng).catch(() => {});
    return { lat, lng };
  } catch (err) {
    return null; // sin conexión, o el servicio no responde: seguimos sin mapa
  }
}

/**
 * Geocodifica una lista de {text} en paralelo controlado (secuencial,
 * por el límite de 1 req/s), devolviendo un array con {..., lat, lng}
 * para los que se han podido localizar (se omiten los que fallan).
 */
async function geocodeAll(items, getText) {
  const results = [];
  for (const item of items) {
    const text = getText(item);
    if (!text) continue;
    const coords = await geocode(text);
    if (coords) results.push({ ...item, lat: coords.lat, lng: coords.lng });
  }
  return results;
}

/**
 * Calcula la ruta por carretera entre una secuencia de puntos
 * [{lat,lng}, ...] usando el servidor público de demostración de OSRM.
 * Devuelve { distanceKm, durationMin, coords: [[lat,lng], ...] } o null.
 */
async function routeBetween(points) {
  if (!points || points.length < 2) return null;
  try {
    const coordStr = points.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_URL}/${coordStr}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes || !data.routes.length) return null;

    const route = data.routes[0];
    const coords = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      coords,
    };
  } catch (err) {
    return null; // sin conexión, o el servicio no responde
  }
}

/** Distancia en línea recta entre dos puntos {lat,lng}, en km (fórmula
 * de Haversine) — solo para comparar cercanías, no para navegación. */
function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Reordena una lista de puntos [{lat,lng,...}] con un heurístico de
 * "vecino más cercano": mantiene el primero fijo (el primer
 * compromiso del día, que ya tiene una hora puesta) y va encadenando
 * siempre el punto no visitado geográficamente más cercano al
 * último. No es la ruta óptima de verdad (eso es NP-difícil pasando
 * de un puñado de puntos), pero para las paradas de un solo día se
 * acerca bastante y es instantáneo, sin depender de ningún servicio
 * externo — a diferencia de routeBetween(), que sí necesita red.
 */
function optimizeRouteOrder(points) {
  if (!points || points.length < 3) return points ? [...points] : [];
  const remaining = points.slice(1);
  const ordered = [points[0]];
  let current = points[0];
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining.splice(bestIdx, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

export { geocode, geocodeAll, routeBetween, searchPlaces, optimizeRouteOrder };
