// ============================================================
// flight-status-config.js — Clave de la API de estado de vuelos.
// Función Pro: "Avisos de vuelos" (retrasos, puerta de embarque).
//
// TravelPlanner usa AeroDataBox (a través de RapidAPI) para consultar
// el estado de un vuelo por su número. Tiene un plan gratuito (con
// límite mensual de peticiones) de sobra para probarlo:
//
//   1. Crea una cuenta gratis en https://rapidapi.com
//   2. Suscríbete al plan gratuito de "AeroDataBox":
//      https://rapidapi.com/aedbx-aedbx/api/aerodatabox
//   3. Copia tu "X-RapidAPI-Key" de esa página y pégala aquí abajo.
//
// Mientras esto esté vacío, los avisos de vuelo simplemente no hacen
// nada — no rompen el resto de la app. Esta clave es privada (a
// diferencia de la de Firebase): no la subas a un repositorio
// público si te preocupa que otros la usen a tu costa.
// ============================================================

const FLIGHT_STATUS_API_KEY = "";

export { FLIGHT_STATUS_API_KEY };
