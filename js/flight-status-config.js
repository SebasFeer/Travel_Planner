// ============================================================
// flight-status-config.js — Dirección de tu Cloud Function de
// estado de vuelos. Función Pro: "Avisos de vuelos".
//
// La clave de RapidAPI/AeroDataBox YA NO vive aquí ni en ningún
// archivo del navegador: vive solo en el servidor (como "secreto"
// de Firebase), dentro de la Cloud Function "flightStatus" que hay
// en la carpeta functions/. Aquí solo se pega la URL pública que
// Firebase te da al desplegarla, por ejemplo:
//
//   https://us-central1-travel-planner-e16e1.cloudfunctions.net/flightStatus
//
// Instrucciones de despliegue: ver docs/DEPLOY_FLIGHT_STATUS.md
//
// Mientras esto esté vacío, los avisos de vuelo simplemente no hacen
// nada — no rompen el resto de la app.
// ============================================================

const FLIGHT_STATUS_ENDPOINT = "https://us-central1-travel-planner-e16e1.cloudfunctions.net/flightStatus";

export { FLIGHT_STATUS_ENDPOINT };
