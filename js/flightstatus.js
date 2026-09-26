// ============================================================
// flightstatus.js — Estado en vivo de un vuelo (retraso, puerta).
// Función Pro: llama a tu Cloud Function "flightStatus" (que es
// quien de verdad habla con AeroDataBox, con la clave guardada en
// el servidor). Aquí nunca hay ninguna clave. Si algo falla (sin
// sesión, sin conexión, función no desplegada, vuelo no
// encontrado...) devuelve null y no rompe nada — el resto de la
// notificación local sigue funcionando igual.
// ============================================================

import { FLIGHT_STATUS_ENDPOINT } from "./flight-status-config.js";

function isFlightStatusConfigured() {
  return !!FLIGHT_STATUS_ENDPOINT;
}

/**
 * Consulta el estado de un vuelo por su número (p. ej. "IB3172") en
 * una fecha concreta ("2026-09-20", formato ISO). Necesita el token
 * de sesión de Firebase (`idToken`, se obtiene con getIdToken() de
 * cloud.js) para que la Cloud Function sepa que quien pregunta ha
 * iniciado sesión en la app.
 *
 * Devuelve { status, delayMin, gate, terminal }, { limitReached: true }
 * si la cuenta ya agotó su cupo diario en el servidor, o null si no
 * hay datos (sin conexión, vuelo no encontrado, etc.).
 *
 * Nota: el formato exacto de la respuesta de AeroDataBox puede variar
 * algo según el plan/versión; si al probarlo ves que no encaja del
 * todo, es cuestión de ajustar los nombres de campo aquí abajo (y en
 * functions/index.js si hace falta) con la respuesta real.
 */
async function getFlightStatus(flightNumber, isoDate, idToken) {
  if (!isFlightStatusConfigured() || !flightNumber || !isoDate || !idToken) return null;

  try {
    const cleanNumber = flightNumber.replace(/\s+/g, "");
    const url =
      `${FLIGHT_STATUS_ENDPOINT}?flightNumber=${encodeURIComponent(cleanNumber)}` +
      `&date=${encodeURIComponent(isoDate)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.status === 429) return { limitReached: true };
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
    return null; // sin conexión, función no desplegada, etc.
  }
}

export { getFlightStatus, isFlightStatusConfigured };
