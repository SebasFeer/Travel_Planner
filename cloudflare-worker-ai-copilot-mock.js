// ============================================================
// cloudflare-worker-ai-copilot-mock.js
//
// Misma idea que mock-ai-copilot-server.js, pero como Cloudflare
// Worker: se sube UNA VEZ y queda con una URL pública fija
// (https://tu-worker.tu-usuario.workers.dev), sin tener que correr
// nada en tu ordenador ni usar ngrok. Gratis, sin tarjeta.
//
// CÓMO SUBIRLO (sin instalar nada, todo desde el navegador):
// 1) Entra a https://dash.cloudflare.com y crea una cuenta gratis
//    (solo pide email).
// 2) En el menú lateral, ve a "Workers y Pages" → "Crear" →
//    "Crear Worker". Ponle un nombre, por ejemplo
//    "travel-planner-ai-mock", y despliega la plantilla que trae
//    por defecto (luego la reemplazas).
// 3) Entra al Worker recién creado → botón "Editar código"
//    (Quick Edit / Edit Code). Borra todo el contenido y pega
//    ESTE archivo completo.
// 4) Pulsa "Guardar y desplegar" (Save and deploy).
// 5) Copia la URL que te da, algo como:
//      https://travel-planner-ai-mock.tuusuario.workers.dev
//    Esa es tu URL PERMANENTE del mock — no cambia nunca.
//
// USARLO EN LA APP:
// En Ajustes → Modo desarrollador → Activar mock del Copiloto IA,
// pega esa URL + "/generateItinerary", por ejemplo:
//   https://travel-planner-ai-mock.tuusuario.workers.dev/generateItinerary
// Y ya funciona desde cualquier dispositivo, en cualquier momento,
// sin tener el ordenador encendido.
// ============================================================

const SAMPLE_ACTIVITIES = [
  { time: "09:00", title: "Paseo por el centro histórico", location: "Casco antiguo", notes: "Ritmo tranquilo para empezar el día", estCost: 0 },
  { time: "11:30", title: "Visita a un museo o monumento local", location: "Zona centro", notes: "Reserva anticipada recomendada", estCost: 15 },
  { time: "14:00", title: "Almuerzo en un sitio típico", location: "Barrio gastronómico", notes: "", estCost: 20 },
  { time: "16:30", title: "Tiempo libre / mercado local", location: "Mercado central", notes: "Bueno para souvenirs", estCost: 10 },
  { time: "20:00", title: "Cena y paseo nocturno", location: "Zona con ambiente", notes: "", estCost: 25 },
];

const SAMPLE_RESTAURANTS = [
  { name: "Restaurante local recomendado", priceRange: "€€" },
  { name: "Sitio de cocina tradicional", priceRange: "€" },
];

function buildDay(dateStr, dayNumber, destination) {
  return {
    date: dateStr,
    dayNumber,
    title: `Día ${dayNumber} en ${destination || "destino"} (ejemplo, sin IA real)`,
    items: SAMPLE_ACTIVITIES,
    restaurants: SAMPLE_RESTAURANTS,
  };
}

function addDaysIso(iso, n) {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function handleGenerateItinerary(payload) {
  const destination = payload.destination || "tu destino";

  if (payload.mode === "day") {
    const day = buildDay(payload.targetDate, payload.dayNumber || 1, destination);
    return {
      ok: true,
      summary: `Plan de ejemplo (mock, sin IA) para un día en ${destination}.`,
      budgetEstimate: null,
      transportTips: "Texto de ejemplo: aquí iría el consejo de transporte generado por la IA.",
      days: [day],
    };
  }

  const totalDays = Math.max(1, Number(payload.days) || 1);
  const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: totalDays }, (_, i) =>
    buildDay(addDaysIso(startDate, i), i + 1, destination)
  );

  const perDay = 70;
  const total = perDay * totalDays;

  return {
    ok: true,
    summary: `Este es un itinerario de EJEMPLO (mock, no generado por IA real) para ${totalDays} día(s) en ${destination}.`,
    budgetEstimate: {
      total,
      flights: 0,
      hotels: Math.round(total * 0.4),
      food: Math.round(total * 0.3),
      transport: Math.round(total * 0.15),
      activities: Math.round(total * 0.15),
    },
    transportTips: "Texto de ejemplo: aquí la IA real sugeriría cómo moverte por la ciudad.",
    days,
  };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (request.method !== "POST" || !url.pathname.startsWith("/generateItinerary")) {
      return new Response(JSON.stringify({ ok: false, error: "Ruta no encontrada en el mock" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }

    try {
      const payload = await request.json().catch(() => ({}));
      const result = handleGenerateItinerary(payload);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: "Error en el mock" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
  },
};
