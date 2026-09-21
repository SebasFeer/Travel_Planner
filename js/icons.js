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
  search: `<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>`,
  home: `<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"/><path d="M9.5 20.5v-6h5v6"/>`,
  more: `<circle cx="5.5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18.5" cy="12" r="1.4"/>`,
  plane: `<path d="M22 16.5v-2l-8.5-5V4a1.5 1.5 0 0 0-3 0v5.5L2 14.5v2l8.5-2.7V19l-2.5 1.8V22l3.5-1 3.5 1v-1.2L12.5 19v-5.2z"/>`,
  luggage: `<rect x="5" y="8.5" width="14" height="12" rx="2.5"/><path d="M9 8.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2.5"/><path d="M9.5 12v5M14.5 12v5"/>`,
  heart: `<path d="M12 20.5s-7.3-4.6-9.8-9.3C.6 7.7 2.4 4 6.2 4c2 0 3.5 1.1 4.3 2.5.7.9.7 1.5 1.5 1.5s.8-.6 1.5-1.5C14.3 5.1 15.8 4 17.8 4c3.8 0 5.6 3.7 4 7.2C19.3 15.9 12 20.5 12 20.5Z"/>`,
  sun: `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7"/>`,
  edit: `<path d="M4 20l.9-3.6L16.4 5a1.8 1.8 0 0 1 2.6 0l1 1a1.8 1.8 0 0 1 0 2.6L8.6 20.1 4 20Z"/><path d="M14.5 6.9l2.6 2.6"/>`,
  chevron: `<path d="M9 6l6 6-6 6"/>`,
  dots_v: `<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>`,
  ruler: `<path d="M4 9h16v6H4z"/><path d="M8 9v2.5M12 9v3.5M16 9v2.5"/>`,
  pin: `<path d="M12 21s-7-6.1-7-11.5A7 7 0 0 1 19 9.5C19 14.9 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/>`,
  // Tenedor y cuchillo — actividades de comida (restaurantes, tapas...).
  restaurant: `<path d="M7 3v7a2 2 0 0 0 2 2v9"/><path d="M7 3v5M10 3v5"/><path d="M17 3c-1.4 0-2.5 1.6-2.5 5s1.1 4.6 2.5 4.6V21"/>`,
  // Fachada con frontón triangular y columnas — museos/galerías.
  museum: `<path d="M3 9.5 12 4l9 5.5"/><path d="M4.5 9.5V20M8.5 9.5V20M12 9.5V20M15.5 9.5V20M19.5 9.5V20"/><path d="M3 20h18"/>`,
  // Monumento tipo obelisco/torre — monumentos y miradores.
  landmark: `<path d="M12 3 8.5 12h7L12 3Z"/><path d="M7 21l1.6-9h6.8l1.6 9"/><path d="M4.5 21h15"/>`,
  // Hoja — naturaleza, parques, playas, senderismo.
  leaf: `<path d="M5 19c0-8 5-14.5 14-14.5C19 13.5 12.5 19 5 19Z"/><path d="M5 19c2-3 4.5-5.5 8-8"/>`,
  // Bolsa de la compra — mercados, tiendas, compras.
  bag: `<path d="M6 8h12l1 12.5a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20.5L6 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>`,
  // Cabeza + hombros — cuenta / iniciar sesión / perfil.
  user: `<circle cx="12" cy="8" r="3.4"/><path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6"/>`,
  // Nube — copia de seguridad / restaurar datos.
  cloud: `<path d="M7.5 18a4.5 4.5 0 0 1-.4-9 5.5 5.5 0 0 1 10.6-1.8A4 4 0 0 1 17 18H7.5Z"/>`,
  // Eslabones encadenados — unirse a un viaje compartido por código/enlace.
  link: `<path d="M7 17l-2.1-2.1a4 4 0 0 1 0-5.6l1.4-1.4a4 4 0 0 1 5.6 0L14 10"/><path d="M17 7l2.1 2.1a4 4 0 0 1 0 5.6l-1.4 1.4a4 4 0 0 1-5.6 0L10 14"/>`,
  // Campana — notificaciones.
  bell: `<path d="M6 16v-4.5a6 6 0 0 1 12 0V16l1.5 2.5h-15L6 16Z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
  // Candado — seguridad / PIN.
  lock: `<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>`,
  // Tubo de ensayo — modo desarrollador / pruebas.
  flask: `<path d="M9 3h6"/><path d="M10 3v6.5L5.5 17a2.2 2.2 0 0 0 1.9 3.3h9.2a2.2 2.2 0 0 0 1.9-3.3L14 9.5V3"/><path d="M8 15h8"/>`,
  // Escudo con check — política de privacidad.
  shield: `<path d="M12 3l7 3v5.5c0 4.6-3 8.3-7 9.5-4-1.2-7-4.9-7-9.5V6l7-3Z"/><path d="M9 12l2 2 4-4.5"/>`,
  // Círculo mitad relleno — selector de tema claro/oscuro/automático.
  theme: `<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none"/>`,
  // Dos flechas en círculo — actualizar / sincronizar desde la nube.
  refresh: `<path d="M4 12a8 8 0 0 1 14.5-4.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-14.5 4.5"/><path d="M4 20v-4.5h4.5"/>`,
  // Impresora — exportar / imprimir el viaje.
  printer: `<rect x="5" y="8.5" width="14" height="7" rx="1.5"/><path d="M7 8.5V4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v4"/><rect x="7.5" y="14" width="9" height="6" rx="1"/>`,
  // Flecha hacia una bandeja — exportar copia / descargar.
  download: `<path d="M12 4v10.5"/><path d="M8 11l4 4 4-4"/><path d="M5 18.5h14"/>`,
  // Flecha desde una bandeja — subir datos a la nube.
  upload: `<path d="M12 14.5V4"/><path d="M8 8l4-4 4 4"/><path d="M5 18.5h14"/>`,
  // Papelera — eliminar viaje.
  trash: `<path d="M5 7h14"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M7 7l1 13a1.5 1.5 0 0 0 1.5 1.4h5a1.5 1.5 0 0 0 1.5-1.4L17 7"/><path d="M10 11v6M14 11v6"/>`,
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

/**
 * Logo de TravelPlanner: un avión de papel trazando la ruta punteada
 * hasta el destino. A diferencia de icon(), usa relleno (no trazo de
 * un solo color) y su propio viewBox de 100x100, así que va aparte
 * en vez de vivir en PATHS.
 */
function brandMark(extraClass = "") {
  return `<svg class="icon-svg ${extraClass}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M20 74 Q 40 30, 78 24" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="1 14"/>
    <circle cx="78" cy="24" r="9" fill="#fff"/>
    <g transform="translate(20 74) rotate(-38) scale(0.55)"><path d="M16 0 L-14 -9 L-4 0 L-14 9 Z" fill="#fff"/></g>
  </svg>`;
}

export { icon, brandMark };
