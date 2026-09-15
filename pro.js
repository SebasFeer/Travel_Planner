// ============================================================
// pro.js — Interruptor de "modo Pro".
//
// Por ahora esto NO cobra nada de verdad: es solo el interruptor que
// decide si las funciones Pro (compartir viaje, avisos de vuelo...)
// están activas, guardado en los ajustes locales (IndexedDB). Sirve
// para desarrollar y probar esas funciones sin tener que montar
// cobros todavía — actívalo desde Ajustes → Modo desarrollador.
//
// El día que se integre un pago real (Stripe, RevenueCat, la compra
// dentro de la app de Google Play/App Store...), lo único que cambia
// es QUIÉN llama a `setPro(true)`: en vez de un botón de desarrollo,
// será la confirmación de ese pago. El resto de la app no se toca.
// ============================================================

import { Data } from "./db.js";

const PRO_KEY = "is_pro";

async function isPro() {
  const value = await Data.settingGet(PRO_KEY);
  return value === true || value === 1;
}

async function setPro(value) {
  await Data.settingSet(PRO_KEY, !!value);
}

export { isPro, setPro };
