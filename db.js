// ============================================================
// db.js — Capa de acceso a datos (IndexedDB)
// Sustituye a sqlite3 de la versión de escritorio.
// ============================================================

const DB_NAME = "travelplanner";
const DB_VERSION = 3;

const STORES = [
  "trips",
  "flights",
  "hotels",
  "itinerary",
  "transport",
  "reservations",
  "expenses",
  "checklist",
];

// Caché de geocodificación (texto de lugar -> coordenadas).
// No lleva trip_id: se comparte entre viajes y se indexa por su propio texto.
const GEOCACHE_STORE = "geocache";

// Almacén clave/valor para ajustes de la app (p. ej. el hash del PIN).
const SETTINGS_STORE = "settings";

const DEFAULT_CHECKLIST_ITEMS = [
  "Pasaporte",
  "DNI/NIE",
  "Seguro de viaje",
  "Check in online",
  "Dinero",
];

let dbInstance = null;

function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("trips")) {
        db.createObjectStore("trips", { keyPath: "id", autoIncrement: true });
      }

      for (const name of STORES) {
        if (name === "trips") continue;
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, {
            keyPath: "id",
            autoIncrement: true,
          });
          store.createIndex("trip_id", "trip_id", { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(GEOCACHE_STORE)) {
        db.createObjectStore(GEOCACHE_STORE, { keyPath: "query" });
      }

      // Almacén genérico de ajustes clave/valor (p. ej. el PIN de lock.js).
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function tx(storeName, mode = "readonly") {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

const Data = {
  async add(storeName, record) {
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName, record) {
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async get(storeName, id) {
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, id) {
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getAll(storeName) {
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async getAllByTrip(storeName, tripId) {
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const idx = store.index("trip_id");
      const req = idx.getAll(IDBKeyRange.only(tripId));
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  // Borra un viaje y todo lo asociado a él (cascada manual,
  // ya que IndexedDB no tiene FOREIGN KEY ON DELETE CASCADE).
  async deleteTripCascade(tripId) {
    const db = await openDB();
    const childStores = STORES.filter((s) => s !== "trips");

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES, "readwrite");

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      transaction.objectStore("trips").delete(tripId);

      for (const storeName of childStores) {
        const idx = transaction.objectStore(storeName).index("trip_id");
        const cursorReq = idx.openCursor(IDBKeyRange.only(tripId));
        cursorReq.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };
      }
    });
  },

  async addDefaultChecklistItems(tripId) {
    const existing = await this.getAllByTrip("checklist", tripId);
    const existingLower = new Set(
      existing.map((i) => (i.task || "").trim().toLowerCase())
    );

    let order = Date.now();
    for (const task of DEFAULT_CHECKLIST_ITEMS) {
      if (existingLower.has(task.trim().toLowerCase())) continue;
      await this.add("checklist", { trip_id: tripId, task, completed: 0, order: order++ });
    }
  },

  // Exporta toda la base de datos a un objeto plano (para backup JSON).
  async exportAll() {
    const dump = {};
    for (const storeName of STORES) {
      dump[storeName] = await this.getAll(storeName);
    }
    return dump;
  },

  // Importa un volcado JSON, sustituyendo todo el contenido actual.
  async importAll(dump) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const storeName of STORES) {
        const store = transaction.objectStore(storeName);
        store.clear();
        const rows = dump[storeName] || [];
        for (const row of rows) {
          store.put(row);
        }
      }
    });
  },
  async geocacheGet(query) {
    const store = await tx(GEOCACHE_STORE, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(query);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async geocacheSet(query, lat, lng) {
    const store = await tx(GEOCACHE_STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put({ query, lat, lng, cachedAt: Date.now() });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  // ----------------------------------------------------------
  // Ajustes clave/valor (usado por lock.js para el PIN local)
  // ----------------------------------------------------------
  async settingGet(key) {
    const store = await tx(SETTINGS_STORE, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : undefined);
      req.onerror = () => reject(req.error);
    });
  },

  async settingSet(key, value) {
    const store = await tx(SETTINGS_STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async settingDelete(key) {
    const store = await tx(SETTINGS_STORE, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },
};

export { Data, DEFAULT_CHECKLIST_ITEMS, GEOCACHE_STORE, SETTINGS_STORE, openDB };
