import { renderApp } from "./app.js";

renderApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Si falla el registro (p. ej. abierto en local sin https),
      // la app sigue funcionando, solo sin caché offline.
    });
  });
}
