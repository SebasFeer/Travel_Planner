// ============================================================
// functions/index.js — Cloud Function "flightStatus".
//
// Hace de intermediaria entre la app y AeroDataBox: la clave de
// RapidAPI vive solo aquí (como "secreto" de Firebase), nunca en el
// navegador. Solo responde a usuarios con sesión iniciada en la app
// (comprueba el token de Firebase Auth que manda cada petición).
// ============================================================

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

// Se guarda con `firebase functions:secrets:set AERODATABOX_KEY`
// (ver instrucciones de despliegue). Nunca se escribe en el código.
const AERODATABOX_KEY = defineSecret("AERODATABOX_KEY");

exports.flightStatus = onRequest(
  { secrets: [AERODATABOX_KEY], cors: true },
  async (req, res) => {
    try {
      // 1. Comprobar que quien llama ha iniciado sesión en la app.
      const authHeader = req.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) {
        res.status(401).json({ error: "Falta el token de sesión." });
        return;
      }
      await admin.auth().verifyIdToken(idToken);

      // 2. Leer los parámetros (número de vuelo y fecha).
      const flightNumber = req.query.flightNumber || (req.body && req.body.flightNumber);
      const date = req.query.date || (req.body && req.body.date);
      if (!flightNumber || !date) {
        res.status(400).json({ error: "Faltan flightNumber o date." });
        return;
      }

      // 3. Consultar AeroDataBox con la clave guardada en el servidor.
      const cleanNumber = String(flightNumber).replace(/\s+/g, "");
      const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(cleanNumber)}/${date}`;
      const apiRes = await fetch(url, {
        headers: {
          "X-RapidAPI-Key": AERODATABOX_KEY.value(),
          "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com",
        },
      });

      if (!apiRes.ok) {
        res.status(apiRes.status).json({ error: "La API de vuelos no respondió correctamente." });
        return;
      }

      const data = await apiRes.json();
      res.status(200).json(data);
    } catch (err) {
      res.status(500).json({ error: "Error interno consultando el vuelo." });
    }
  }
);

// ============================================================
// Cloud Function "generateItinerary" — Copiloto de viajes con IA.
//
// Hace de intermediaria entre la app y la API de Anthropic (Claude):
// la clave vive solo aquí (como "secreto" de Firebase), nunca en el
// navegador. Solo responde a usuarios con sesión iniciada en la app.
// Recibe los datos del viaje (o de un solo día, al regenerarlo) y
// devuelve un itinerario estructurado en JSON, nunca texto libre,
// gracias a "tool use" de Claude (le obligamos a rellenar un
// esquema fijo en vez de dejarle escribir lo que quiera).
// ============================================================

// Se guarda con `firebase functions:secrets:set ANTHROPIC_API_KEY`
// (ver DEPLOY_AI_COPILOT.md). Nunca se escribe en el código.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const AI_MODEL = "claude-sonnet-5";

// Esquema que Claude debe rellenar. "tool_choice" fuerza a que la
// respuesta sea siempre este objeto, nunca texto suelto ni Markdown.
const ITINERARY_TOOL = {
  name: "build_itinerary",
  description: "Construye un itinerario de viaje estructurado, realista y coherente con el presupuesto e intereses dados.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "Resumen del viaje en 2-3 frases, en español." },
      budgetEstimate: {
        type: "object",
        description: "Estimación de gasto TOTAL para todo el viaje (no por día), en la moneda indicada.",
        properties: {
          flights: { type: "number" },
          hotels: { type: "number" },
          food: { type: "number" },
          transport: { type: "number" },
          activities: { type: "number" },
          total: { type: "number" },
        },
        required: ["total"],
      },
      transportTips: { type: "string", description: "Consejos prácticos de transporte para moverse por el destino, en español." },
      days: {
        type: "array",
        description: "Un objeto por cada día del viaje, en orden.",
        items: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha ISO YYYY-MM-DD de este día." },
            dayNumber: { type: "number" },
            title: { type: "string", description: "Título corto del día, p. ej. 'Llegada y barrio de Shibuya'." },
            items: {
              type: "array",
              description: "Actividades del día en orden cronológico.",
              items: {
                type: "object",
                properties: {
                  time: { type: "string", description: "Hora en formato HH:MM (24h)." },
                  title: { type: "string" },
                  location: { type: "string", description: "Lugar o dirección aproximada." },
                  notes: { type: "string", description: "Detalle breve: qué hacer allí, por qué encaja con los intereses del viajero." },
                  category: { type: "string", enum: ["comida", "actividad", "transporte", "alojamiento", "templo", "compras", "otro"] },
                  estCost: { type: "number", description: "Coste estimado por persona en la moneda indicada, 0 si es gratis." },
                },
                required: ["title"],
              },
            },
            restaurants: {
              type: "array",
              description: "2-3 restaurantes recomendados para ese día, acorde a los gustos indicados.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  cuisine: { type: "string" },
                  priceRange: { type: "string", description: "€, €€ o €€€" },
                  note: { type: "string" },
                },
                required: ["name"],
              },
            },
          },
          required: ["date", "items"],
        },
      },
    },
    required: ["days"],
  },
};

function systemPromptFor(currency) {
  return (
    "Eres un agente de viajes experto que diseña itinerarios realistas, concretos y bien " +
    "ritmados (ni demasiado cargados ni vacíos). Usa siempre la herramienta build_itinerary " +
    "para responder, nunca texto libre. Ajusta las recomendaciones al presupuesto indicado " +
    "y a los intereses del viajero. Da horarios razonables (evita levantar al viajero antes " +
    "de las 8:00 salvo que sea imprescindible, p. ej. un vuelo). Ten en cuenta desplazamientos " +
    "razonables entre actividades del mismo día (agrupa por zona cuando tenga sentido). " +
    `Todas las cifras de coste van en ${currency || "EUR"}. Responde siempre en español.`
  );
}

function buildFullPrompt({ destination, startDate, endDate, days, budget, currency, interests }) {
  return (
    `Planifica un viaje a ${destination}, de ${days} día(s)` +
    (startDate ? `, empezando el ${startDate}` : "") +
    (endDate ? ` y terminando el ${endDate}` : "") +
    (budget ? `. Presupuesto total aproximado: ${budget} ${currency || "EUR"}` : ". Sin presupuesto fijo, sugiere algo razonable") +
    (interests ? `. Preferencias del viajero: ${interests}` : "") +
    `. Genera un objeto "days" con exactamente ${days} día(s), con fechas consecutivas ` +
    `empezando en ${startDate || "el día 1"}, cada uno con 3-6 actividades, restaurantes ` +
    "recomendados y coste estimado por actividad. Incluye también un resumen, una estimación " +
    "de presupuesto desglosada y consejos de transporte."
  );
}

function buildDayPrompt({ destination, targetDate, dayNumber, budget, currency, interests, instructions, context }) {
  const prevSummary = Array.isArray(context) && context.length
    ? "Estos son los otros días ya planificados de este viaje (para que no repitas lugares ni restaurantes): " +
      context.map((d) => `Día ${d.dayNumber || ""} (${d.date}): ${d.title || ""}`).join(" | ")
    : "Es el único día que se está planificando.";
  return (
    `Vuelve a planificar SOLO el día ${dayNumber || ""} (${targetDate}) de un viaje a ${destination}` +
    (budget ? `. Presupuesto orientativo para ese día: ${budget} ${currency || "EUR"}` : "") +
    (interests ? `. Preferencias del viajero: ${interests}` : "") +
    (instructions ? `. Petición concreta del viajero para este día: ${instructions}` : "") +
    `. ${prevSummary} Genera el objeto "days" con un único elemento, ese día, con fecha ` +
    `${targetDate} y dayNumber ${dayNumber || 1}. Incluye también restaurantes recomendados ` +
    "para ese día. El resumen y la estimación de presupuesto pueden referirse solo a ese día."
  );
}

exports.generateItinerary = onRequest(
  { secrets: [ANTHROPIC_API_KEY], cors: true, timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    try {
      // 1. Comprobar que quien llama ha iniciado sesión en la app.
      const authHeader = req.get("Authorization") || "";
      const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!idToken) {
        res.status(401).json({ error: "Falta el token de sesión." });
        return;
      }
      await admin.auth().verifyIdToken(idToken);

      // 2. Leer y validar los parámetros del viaje.
      const body = req.body || {};
      const mode = body.mode === "day" ? "day" : "full";
      const { destination, startDate, endDate, days, budget, currency, interests, targetDate, dayNumber, instructions, context } = body;

      if (!destination) {
        res.status(400).json({ error: "Falta el destino del viaje." });
        return;
      }
      if (mode === "full" && !(Number(days) > 0)) {
        res.status(400).json({ error: "Falta la duración del viaje (número de días)." });
        return;
      }
      if (mode === "day" && !targetDate) {
        res.status(400).json({ error: "Falta la fecha del día a regenerar." });
        return;
      }

      const userPrompt =
        mode === "full"
          ? buildFullPrompt({ destination, startDate, endDate, days: Number(days), budget, currency, interests })
          : buildDayPrompt({ destination, targetDate, dayNumber, budget, currency, interests, instructions, context });

      // 3. Consultar Claude, forzado a responder con el esquema fijo.
      const apiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: 8000,
          system: systemPromptFor(currency),
          messages: [{ role: "user", content: userPrompt }],
          tools: [ITINERARY_TOOL],
          tool_choice: { type: "tool", name: "build_itinerary" },
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text().catch(() => "");
        console.error("Anthropic error:", apiRes.status, errText);
        res.status(502).json({ error: "El Copiloto IA no ha podido generar el itinerario. Inténtalo de nuevo." });
        return;
      }

      const data = await apiRes.json();
      const toolUse = (data.content || []).find((b) => b.type === "tool_use" && b.name === "build_itinerary");
      if (!toolUse || !toolUse.input || !Array.isArray(toolUse.input.days) || !toolUse.input.days.length) {
        console.error("Respuesta inesperada de Anthropic:", JSON.stringify(data));
        res.status(502).json({ error: "El Copiloto IA no devolvió un itinerario válido. Inténtalo de nuevo." });
        return;
      }

      res.status(200).json({ ok: true, ...toolUse.input });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error interno generando el itinerario." });
    }
  }
);
