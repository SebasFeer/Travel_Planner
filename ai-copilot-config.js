// ============================================================
// ai-copilot-config.js — Dirección de tu Cloud Function del
// Copiloto de viajes con IA (generador de itinerarios).
//
// La clave de Anthropic (Claude) NO vive aquí ni en ningún archivo
// del navegador: vive solo en el servidor (como "secreto" de
// Firebase), dentro de la Cloud Function "generateItinerary" que
// hay en la carpeta functions/. Aquí solo se pega la URL pública
// que Firebase te da al desplegarla, por ejemplo:
//
//   https://us-central1-travel-planner-e16e1.cloudfunctions.net/generateItinerary
//
// Instrucciones de despliegue: ver DEPLOY_AI_COPILOT.md
//
// Mientras esto esté vacío, el botón "✨ Generar con IA" simplemente
// no aparece — no rompe el resto de la app. (El interruptor de
// mock en Ajustes → Modo desarrollador funciona aparte, sin
// necesidad de tocar esta URL.)
// ============================================================

const AI_COPILOT_ENDPOINT = "";

export { AI_COPILOT_ENDPOINT };
