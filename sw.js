// Service worker: cachea el "app shell" para que TravelPlanner
// abra incluso sin conexión (los datos ya viven en IndexedDB,
// que no depende del service worker).

const CACHE_NAME = "travelplanner-v36";

// Caché de teselas del mapa: va SEPARADA a propósito y con nombre
// fijo (sin número de versión de la app), para que sobreviva a las
// actualizaciones. Si fuera parte de CACHE_NAME, cada vez que
// subiéramos cambios se borraría el mapa descargado sin conexión.
const TILE_CACHE_NAME = "travelplanner-tiles-v1";
const TILE_HOST = "tile.openstreetmap.org";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/main.js",
  "./js/app.js",
  "./js/sections.js",
  "./js/db.js",
  "./js/utils.js",
  "./js/geocode.js",
  "./js/discover.js",
  "./js/currency.js",
  "./js/ai-copilot.js",
  "./js/ai-copilot-config.js",
  "./js/cloud.js",
  "./js/firebase-config.js",
  "./js/pro.js",
  "./js/flightstatus.js",
  "./js/flight-status-config.js",
  "./js/icons.js",
  "./js/photo.js",
  "./js/lock.js",
  "./js/onboarding.js",
  "./js/i18n.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./img/bg-sky-light.webp",
  "./img/bg-sky-dark.webp",
  "./img/wonders/machu-picchu.webp",
  "./img/wonders/chichen-itza.webp",
  "./img/wonders/christ-redeemer.webp",
  "./img/wonders/colosseum.webp",
  "./img/wonders/taj-mahal.webp",
  "./img/wonders/petra.webp",
  "./img/wonders/great-wall.webp",
];

// CDNs externos (mapa y arrastrar/soltar): se precargan aparte porque
// si uno fallara al instalar, no debe romper el cacheo del resto del app shell.
const EXTERNAL_SHELL = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.js",
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cacheamos cada archivo por separado (con su propio catch) en
      // vez de con cache.addAll(): addAll falla TODO el service
      // worker si un solo archivo no se encuentra o cambia de nombre,
      // dejando a los visitantes atascados con la versión vieja para
      // siempre. Así, si uno falla, el resto se cachea igualmente.
      await Promise.all(
        APP_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
      // Los externos igual: "a lo mejor esfuerzo".
      await Promise.all(
        EXTERNAL_SHELL.map((url) => cache.add(url).catch(() => {}))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        // OJO: nunca se borra TILE_CACHE_NAME aquí — es justo lo que
        // hace posible que el mapa descargado sobreviva a las
        // actualizaciones de la app.
        keys
          .filter((k) => k !== CACHE_NAME && k !== TILE_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Teselas del mapa: caché propia y persistente (modo sin conexión).
  if (event.request.url.includes(TILE_HOST)) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const network = fetch(event.request)
            .then((response) => {
              if (response) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }

  // Solo se GUARDA en caché lo propio de la app (mismo origen) y las
  // librerías externas fijas (EXTERNAL_SHELL) — esas ya se cachean al
  // instalar, esto solo las mantiene al día. Todo lo demás (fotos de
  // destinos/hoteles/actividades vía Wikipedia/Openverse/OSM,
  // resultados de Nominatim/Overpass, el mapa estático del PDF...) se
  // sirve de la red tal cual, sin acumularse aquí para siempre: antes
  // cualquier petición con éxito se guardaba sin límite ni caducidad,
  // y con muchos viajes/fotos eso podía crecer bastante. El propio
  // caché HTTP del navegador sigue dando algo de reaprovechamiento a
  // corto plazo para esas peticiones, sin que nosotros lo gestionemos.
  const isSameOrigin = event.request.url.startsWith(self.location.origin);
  const isPinnedExternal = EXTERNAL_SHELL.includes(event.request.url);

  if (!isSameOrigin && !isPinnedExternal) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

