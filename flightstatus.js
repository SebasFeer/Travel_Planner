// ============================================================
// flightstatus.js — Estado en vivo de un vuelo (retraso, puerta)
// vía AeroDataBox. Función Pro: solo tiene efecto si hay una clave
// de API configurada en flight-status-config.js. Si algo falla (sin
// clave, sin conexión, límite de la API, vuelo no encontrado...)
// devuelve null y no rompe nada — el resto de la notificación local
// sigue funcionando igual.
// ============================================================

import { FLIGHT_STATUS_API_KEY } from "./flight-status-config.js";

const BASE_URL = "https://aerodatabox.p.rapidapi.com/flights/number";

function isFlightStatusConfigured() {
  return !!FLIGHT_STATUS_API_KEY;
}

/**
 * Consulta el estado de un vuelo por su número (p. ej. "IB3172") en
 * una fecha concreta ("2026-09-20", formato ISO). Devuelve algo como
 * { status, delayMin, gate, terminal } o null si no se encuentra, si
 * no hay clave configurada, o si falla la consulta.
 *
 * Nota: el formato exacto de la respuesta de AeroDataBox puede variar
 * algo según el plan/versión; si al probarlo ves que no encaja del
 * todo, es cuestión de ajustar los nombres de campo de más abajo con
 * la respuesta real que te devuelva la API (puedes verla en la
 * pestaña "Test Endpoint" de RapidAPI).
 */
async function getFlightStatus(flightNumber, isoDate) {
  if (!isFlightStatusConfigured() || !flightNumber || !isoDate) return null;

  try {
    const cleanNumber = flightNumber.replace(/\s+/g, "");
    const url = `${BASE_URL}/${encodeURIComponent(cleanNumber)}/${isoDate}`;
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": FLIGHT_STATUS_API_KEY,
        "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
      },
    });
    if (!res.ok) return null;

    const results = await res.json();
    const flight = Array.isArray(results) ? results[0] : results;
    if (!flight) return null;

    const dep = flight.departure || {};
    const scheduled = dep.scheduledTime && dep.scheduledTime.utc;
    const revised = dep.revisedTime && dep.revisedTime.utc;

    let delayMin = 0;
    if (scheduled && revised) {
      const diff = Math.round((new Date(revised) - new Date(scheduled)) / 60000);
      if (diff > 0) delayMin = diff;
    }

    return {
      status: flight.status || null,
      delayMin,
      gate: dep.gate || null,
      terminal: dep.terminal || null,
    };
  } catch (err) {
    return null; // sin conexión, límite de peticiones, etc.
  }
}

export { getFlightStatus, isFlightStatusConfigured };
