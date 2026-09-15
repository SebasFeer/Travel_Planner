// ============================================================
// icons.js — Set de iconos SVG (trazo simple, un color) para
// sustituir el emoji nativo en los puntos donde más se nota la
// identidad de marca (categorías, tarjetas de resumen, paneles).
// Todos usan currentColor, así que heredan el color de quien los
// contiene (blanco sobre las insignias de color, --accent en los
// paneles/resumen).
// ============================================================

const PATHS = {
  flights: `<path d="M22 16.5v-2l-8.5-5V4a1.5 1.5 0 0 0-3 0v5.5L2 14.5v2l8.5-2.7V19l-2.5 1.8V22l3.5-1 3.5 1v-1.2L12.5 19v-5.2z"/>`,
  hotels: `<path d="M3 20V6a1 1 0 0 1 1-1h6v15"/><path d="M14 20V10a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v10"/><path d="M3 20h18"/><circle cx="8" cy="12" r="1"/>`,
  itinerary: `<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/>`,
  transport: `<path d="M4 16V9a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7"/><path d="M4 16h16v2a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2Z"/><circle cx="7.5" cy="16.5" r="1.3"/><circle cx="16.5" cy="16.5" r="1.3"/><path d="M5 9l1.5-3.5A1 1 0 0 1 7.4 5h9.2a1 1 0 0 1 .9.6L19 9"/>`,
  reservations: `<path d="M3 9a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v6a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2Z"/><path d="M10 7v10" stroke-dasharray="2 2"/>`,
  expenses: `<circle cx="12" cy="12" r="9"/><path d="M15 9.5c0-1-1-1.8-2.6-1.8s-2.9.9-2.9 2 .9 1.6 2.5 1.9 3 .9 3 2.1-1.2 2.1-2.9 2.1-2.8-.7-2.8-1.9"/><path d="M12 6.5v11"/>`,
  checklist: `<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.5l2.2 2.2 4.8-5"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/>`,
  map: `<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/>`,
  wallet: `<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><path d="M3 10.5h18"/><circle cx="16.5" cy="14.5" r="1.4"/>`,
  clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`,
  notes: `<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="M8 8.5h8M8 12.5h8M8 16.5h5"/>`,
  compass: `<circle cx="12" cy="12" r="9.5"/><path d="M15.2 8.8l-2 4.6-4.6 2 2-4.6 4.6-2Z"/>`,
};

/**
 * Devuelve el markup SVG de un icono. `extraClass` se añade a la
 * clase para poder ajustar tamaño/color desde el CSS del contexto.
 */
function icon(name, extraClass = "") {
  const paths = PATHS[name];
  if (!paths) return "";
  return `<svg class="icon-svg ${extraClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export { icon };
