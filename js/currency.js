// ============================================================
// currency.js — Conversor de moneda (función Pro). Usa Frankfurter
// (tipos de cambio del Banco Central Europeo), pública y gratuita,
// sin clave. Los tipos se cachean en local unas horas para no
// pedirlos cada vez. Si falla (sin conexión, servicio caído), usa
// la última copia guardada si existe, o devuelve null — nunca
// rompe el resto de la app.
// ============================================================

import { Data } from "./db.js";

// api.frankfurter.app quedó descontinuado (ahora redirige, con 301,
// a este dominio nuevo) — se pide directamente aquí para no depender
// de esa redirección, que en el navegador puede fallar o venir
// bloqueada según el dispositivo/red.
const RATES_URL = "https://api.frankfurter.dev/v1/latest";
const CACHE_KEY = "currency_rates_cache";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// Las 5 monedas más operadas del mundo (BIS Triennial Survey), como
// accesos rápidos antes de tener que buscar nada.
const TOP_CURRENCIES = ["USD", "EUR", "JPY", "GBP", "CNY"];

// Lista casi completa de monedas del mundo (ISO 4217), para el
// buscador: "escribe el nombre y aparece abajo para elegirla". No
// todas tienen tipo de cambio en vivo disponible (eso depende de
// Frankfurter/BCE, que solo publica ~30) — RATES_SUPPORTED marca
// cuáles sí, y la UI avisa en vez de fallar en silencio si se elige
// una que no.
const ALL_CURRENCIES = [
  { code: "AED", label: "Dírham de EAU" },
  { code: "AFN", label: "Afgani afgano" },
  { code: "ALL", label: "Lek albanés" },
  { code: "AMD", label: "Dram armenio" },
  { code: "ANG", label: "Florín antillano" },
  { code: "AOA", label: "Kwanza angoleño" },
  { code: "ARS", label: "Peso argentino" },
  { code: "AUD", label: "Dólar australiano" },
  { code: "AWG", label: "Florín arubeño" },
  { code: "AZN", label: "Manat azerbaiyano" },
  { code: "BAM", label: "Marco bosnioherzegovino" },
  { code: "BBD", label: "Dólar de Barbados" },
  { code: "BDT", label: "Taka bangladesí" },
  { code: "BGN", label: "Lev búlgaro" },
  { code: "BHD", label: "Dinar bareiní" },
  { code: "BIF", label: "Franco burundés" },
  { code: "BMD", label: "Dólar bermudeño" },
  { code: "BND", label: "Dólar de Brunéi" },
  { code: "BOB", label: "Boliviano" },
  { code: "BRL", label: "Real brasileño" },
  { code: "BSD", label: "Dólar bahameño" },
  { code: "BTN", label: "Ngultrum butanés" },
  { code: "BWP", label: "Pula botsuanés" },
  { code: "BYN", label: "Rublo bielorruso" },
  { code: "BZD", label: "Dólar beliceño" },
  { code: "CAD", label: "Dólar canadiense" },
  { code: "CDF", label: "Franco congoleño" },
  { code: "CHF", label: "Franco suizo" },
  { code: "CLP", label: "Peso chileno" },
  { code: "CNY", label: "Yuan chino" },
  { code: "COP", label: "Peso colombiano" },
  { code: "CRC", label: "Colón costarricense" },
  { code: "CUP", label: "Peso cubano" },
  { code: "CVE", label: "Escudo caboverdiano" },
  { code: "CZK", label: "Corona checa" },
  { code: "DJF", label: "Franco yibutiano" },
  { code: "DKK", label: "Corona danesa" },
  { code: "DOP", label: "Peso dominicano" },
  { code: "DZD", label: "Dinar argelino" },
  { code: "EGP", label: "Libra egipcia" },
  { code: "ERN", label: "Nakfa eritreo" },
  { code: "ETB", label: "Birr etíope" },
  { code: "EUR", label: "Euro" },
  { code: "FJD", label: "Dólar fiyiano" },
  { code: "GBP", label: "Libra esterlina" },
  { code: "GEL", label: "Lari georgiano" },
  { code: "GHS", label: "Cedi ghanés" },
  { code: "GMD", label: "Dalasi gambiano" },
  { code: "GNF", label: "Franco guineano" },
  { code: "GTQ", label: "Quetzal guatemalteco" },
  { code: "GYD", label: "Dólar guyanés" },
  { code: "HKD", label: "Dólar de Hong Kong" },
  { code: "HNL", label: "Lempira hondureño" },
  { code: "HTG", label: "Gourde haitiano" },
  { code: "HUF", label: "Florín húngaro" },
  { code: "IDR", label: "Rupia indonesia" },
  { code: "ILS", label: "Séquel israelí" },
  { code: "INR", label: "Rupia india" },
  { code: "IQD", label: "Dinar iraquí" },
  { code: "IRR", label: "Rial iraní" },
  { code: "ISK", label: "Corona islandesa" },
  { code: "JMD", label: "Dólar jamaicano" },
  { code: "JOD", label: "Dinar jordano" },
  { code: "JPY", label: "Yen japonés" },
  { code: "KES", label: "Chelín keniano" },
  { code: "KGS", label: "Som kirguís" },
  { code: "KHR", label: "Riel camboyano" },
  { code: "KMF", label: "Franco comorense" },
  { code: "KRW", label: "Won surcoreano" },
  { code: "KWD", label: "Dinar kuwaití" },
  { code: "KYD", label: "Dólar de Caimán" },
  { code: "KZT", label: "Tenge kazajo" },
  { code: "LAK", label: "Kip laosiano" },
  { code: "LBP", label: "Libra libanesa" },
  { code: "LKR", label: "Rupia de Sri Lanka" },
  { code: "LRD", label: "Dólar liberiano" },
  { code: "LSL", label: "Loti lesotense" },
  { code: "LYD", label: "Dinar libio" },
  { code: "MAD", label: "Dírham marroquí" },
  { code: "MDL", label: "Leu moldavo" },
  { code: "MGA", label: "Ariary malgache" },
  { code: "MKD", label: "Denar macedonio" },
  { code: "MMK", label: "Kyat birmano" },
  { code: "MNT", label: "Tugrik mongol" },
  { code: "MOP", label: "Pataca de Macao" },
  { code: "MRU", label: "Uguiya mauritano" },
  { code: "MUR", label: "Rupia mauriciana" },
  { code: "MVR", label: "Rufiyaa maldiva" },
  { code: "MWK", label: "Kwacha malauí" },
  { code: "MXN", label: "Peso mexicano" },
  { code: "MYR", label: "Ringgit malasio" },
  { code: "MZN", label: "Metical mozambiqueño" },
  { code: "NAD", label: "Dólar namibio" },
  { code: "NGN", label: "Naira nigeriana" },
  { code: "NIO", label: "Córdoba nicaragüense" },
  { code: "NOK", label: "Corona noruega" },
  { code: "NPR", label: "Rupia nepalí" },
  { code: "NZD", label: "Dólar neozelandés" },
  { code: "OMR", label: "Rial omaní" },
  { code: "PAB", label: "Balboa panameño" },
  { code: "PEN", label: "Sol peruano" },
  { code: "PGK", label: "Kina papú" },
  { code: "PHP", label: "Peso filipino" },
  { code: "PKR", label: "Rupia pakistaní" },
  { code: "PLN", label: "Zloty polaco" },
  { code: "PYG", label: "Guaraní paraguayo" },
  { code: "QAR", label: "Rial catarí" },
  { code: "RON", label: "Leu rumano" },
  { code: "RSD", label: "Dinar serbio" },
  { code: "RUB", label: "Rublo ruso" },
  { code: "RWF", label: "Franco ruandés" },
  { code: "SAR", label: "Rial saudí" },
  { code: "SBD", label: "Dólar de las Salomón" },
  { code: "SCR", label: "Rupia seychellense" },
  { code: "SDG", label: "Libra sudanesa" },
  { code: "SEK", label: "Corona sueca" },
  { code: "SGD", label: "Dólar de Singapur" },
  { code: "SLE", label: "Leone de Sierra Leona" },
  { code: "SOS", label: "Chelín somalí" },
  { code: "SRD", label: "Dólar surinamés" },
  { code: "SSP", label: "Libra sursudanesa" },
  { code: "SYP", label: "Libra siria" },
  { code: "SZL", label: "Lilangeni suazi" },
  { code: "THB", label: "Baht tailandés" },
  { code: "TJS", label: "Somoni tayiko" },
  { code: "TMT", label: "Manat turcomano" },
  { code: "TND", label: "Dinar tunecino" },
  { code: "TOP", label: "Paʻanga tongano" },
  { code: "TRY", label: "Lira turca" },
  { code: "TTD", label: "Dólar de Trinidad y Tobago" },
  { code: "TWD", label: "Nuevo dólar taiwanés" },
  { code: "TZS", label: "Chelín tanzano" },
  { code: "UAH", label: "Grivna ucraniana" },
  { code: "UGX", label: "Chelín ugandés" },
  { code: "USD", label: "Dólar estadounidense" },
  { code: "UYU", label: "Peso uruguayo" },
  { code: "UZS", label: "Som uzbeko" },
  { code: "VES", label: "Bolívar venezolano" },
  { code: "VND", label: "Dong vietnamita" },
  { code: "VUV", label: "Vatu vanuatuense" },
  { code: "WST", label: "Tala samoano" },
  { code: "XAF", label: "Franco CFA de África Central" },
  { code: "XCD", label: "Dólar del Caribe Oriental" },
  { code: "XOF", label: "Franco CFA de África Occidental" },
  { code: "XPF", label: "Franco CFP" },
  { code: "YER", label: "Rial yemení" },
  { code: "ZAR", label: "Rand sudafricano" },
  { code: "ZMW", label: "Kwacha zambiano" },
];

// Monedas con tipo de cambio en vivo disponible (las que de verdad
// publica Frankfurter/BCE). El resto aparecen igual en el buscador
// —es una lista real de monedas del mundo—, pero al elegir una que
// no esté aquí, la UI avisa en vez de intentar convertir a ciegas.
const RATES_SUPPORTED = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP",
  "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
]);

function isRateSupported(code) {
  return RATES_SUPPORTED.has(code);
}

/** Compatibilidad con el resto de la app: la lista curada de antes,
 *  derivada ahora de TOP_CURRENCIES + ALL_CURRENCIES. */
const CURRENCIES = TOP_CURRENCIES.map((code) => ALL_CURRENCIES.find((c) => c.code === code)).filter(Boolean);

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

export { CURRENCIES, TOP_CURRENCIES, ALL_CURRENCIES, isRateSupported, getRates, convertCurrency };
