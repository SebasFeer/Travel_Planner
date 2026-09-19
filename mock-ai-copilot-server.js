// ============================================================
// mock-ai-copilot-server.js
//
// Servidor local MUY simple (sin dependencias, solo Node.js) que
// simula la Cloud Function "generateItinerary" del Copiloto IA,
// devolviendo un itinerario de ejemplo con la MISMA forma que
// espera ai-copilot.js. No llama a Claude ni a Anthropic: es puro
// relleno para poder desarrollar y probar toda la interfaz
// (botón "✨ Generar con IA", tarjetas de día, presupuesto
// estimado, aplicar al itinerario...) sin gastar nada.
//
// CÓMO USARLO
// -----------
// 1) Ejecuta:   node mock-ai-copilot-server.js
//    (arranca en http://localhost:8787)
//
// 2) En ai-copilot-config.js, pon TEMPORALMENTE:
//      const AI_COPILOT_ENDPOINT = "http://localhost:8787/generateItinerary";
//
// 3) Abre la app, entra a un viaje con fechas puestas, pulsa
//    "✨ Generar con IA". Verás el plan de ejemplo tal cual se
//    vería con la IA real.
//
// 4) Cuando quieras probar con Claude de verdad, vuelve a poner
//    en ai-copilot-config.js la URL real de tu Cloud Function
//    desplegada (ver DEPLOY_AI_COPILOT.md) y borra esta línea.
//    ¡No subas este mock ni la URL de localhost a producción!
// ============================================================

const http = require("http");

const PORT = 8787;

// Pequeño banco de actividades / restaurantes de relleno, se repiten
// y se numeran para que cada día tenga contenido variado.
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
      summary: `Plan de ejemplo (mock local, sin IA) para un día en ${destination}.`,
      budgetEstimate: null,
      transportTips: "Esto es un texto de ejemplo: aquí iría el consejo de transporte generado por la IA.",
      days: [day],
    };
  }

  // mode "full"
  const totalDays = Math.max(1, Number(payload.days) || 1);
  const startDate = payload.startDate || new Date().toISOString().slice(0, 10);
  const days = Array.from({ length: totalDays }, (_, i) =>
    buildDay(addDaysIso(startDate, i), i + 1, destination)
  );

  const perDay = 70; // coste diario de ejemplo
  const total = perDay * totalDays;

  return {
    ok: true,
    summary: `Este es un itinerario de EJEMPLO (mock local, no generado por IA real) para ${totalDays} día(s) en ${destination}. Sirve para probar la interfaz del Copiloto sin gastar créditos de la API.`,
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

const server = http.createServer((req, res) => {
  // CORS abierto para desarrollo local (ajusta si lo necesitas más estricto)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST" || !req.url.startsWith("/generateItinerary")) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Ruta no encontrada en el mock" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      // Nota: aquí NO se comprueba el token de Firebase (Authorization),
      // a diferencia de la función real. Es solo para desarrollo local.
      const result = handleGenerateItinerary(payload);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "JSON inválido en la petición" }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Mock del Copiloto IA escuchando en http://localhost:${PORT}/generateItinerary`);
  console.log("Recuerda: esto NO llama a Claude, solo devuelve datos de ejemplo.");
});
