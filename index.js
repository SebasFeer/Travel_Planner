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
