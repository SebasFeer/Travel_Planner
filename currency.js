// ============================================================
// currency.js — Conversor de moneda (función Pro). Usa Frankfurter
// (tipos de cambio del Banco Central Europeo), pública y gratuita,
// sin clave. Los tipos se cachean en local unas horas para no
// pedirlos cada vez. Si falla (sin conexión, servicio caído), usa
// la última copia guardada si existe, o devuelve null — nunca
// rompe el resto de la app.
// ============================================================

import { Data } from "./db.js";

const RATES_URL = "https://api.frankfurter.app/latest";
const CACHE_KEY = "currency_rates_cache";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// Selección de monedas comunes para el desplegable (Frankfurter
// soporta bastantes más, pero para no abrumar se muestra una lista
// curada de las más habituales en viajes).
const CURRENCIES = [
  { code: "EUR", label: "Euro (€)" },
  { code: "USD", label: "Dólar estadounidense ($)" },
  { code: "GBP", label: "Libra esterlina (£)" },
  { code: "JPY", label: "Yen japonés (¥)" },
  { code: "CHF", label: "Franco suizo" },
  { code: "MXN", label: "Peso mexicano" },
  { code: "COP", label: "Peso colombiano" },
  { code: "ARS", label: "Peso argentino" },
  { code: "CLP", label: "Peso chileno" },
  { code: "BRL", label: "Real brasileño" },
  { code: "CAD", label: "Dólar canadiense" },
  { code: "AUD", label: "Dólar australiano" },
  { code: "CNY", label: "Yuan chino" },
  { code: "TRY", label: "Lira turca" },
];

/**
 * Tipos de cambio con base EUR (p. ej. { USD: 1.08, GBP: 0.86, ... }).
 * Devuelve null si no hay datos frescos ni copia en caché.
 */
async function getRates() {
  const cached = await Data.settingGet(CACHE_KEY).catch(() => null);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates;
  }
  try {
    const res = await fetch(`${RATES_URL}?base=EUR`);
    if (!res.ok) return (cached && cached.rates) || null;
    const data = await res.json();
    const rates = { ...data.rates, EUR: 1 };
    await Data.settingSet(CACHE_KEY, { rates, fetchedAt: Date.now() }).catch(() => {});
    return rates;
  } catch (err) {
    return (cached && cached.rates) || null; // sin conexión: última copia si la hay
  }
}

/** Convierte `amount` de la moneda `from` a la moneda `to`. */
async function convertCurrency(amount, from, to) {
  const n = parseFloat(amount || 0);
  if (from === to) return n;
  const rates = await getRates();
  if (!rates || !rates[from] || !rates[to]) return null;
  const amountInEur = n / rates[from];
  return amountInEur * rates[to];
}

export { CURRENCIES, getRates, convertCurrency };
