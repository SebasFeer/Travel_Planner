// Service worker: cachea el "app shell" para que TravelPlanner
// abra incluso sin conexión (los datos ya viven en IndexedDB,
// que no depende del service worker).

const CACHE_NAME = "travelplanner-v4";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles.css",
  "./main.js",
  "./app.js",
  "./sections.js",
  "./db.js",
  "./utils.js",
  "./geocode.js",
  "./cloud.js",
  "./firebase-config.js",
  "./pro.js",
  "./flightstatus.js",
  "./flight-status-config.js",
  "./icons.js",
  "./photo.js",
  "./lock.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// CDNs externos (mapa y arrastrar/soltar): se precargan aparte porque
// si uno fallara al instalar, no debe romper el cacheo del resto del app shell.
const EXTERNAL_SHELL = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      // Los externos se cachean "a lo mejor esfuerzo": si no hay red
      // ahora mismo, no impide instalar el resto de la app.
      await Promise.all(
        EXTERNAL_SHELL.map((url) =>
          cache.add(url).catch(() => {})
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

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
