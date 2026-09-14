import { renderApp } from "./app.js";
import { guardOnLaunch, installBackgroundLock } from "./lock.js";
import { onAuthChange } from "./cloud.js";

guardOnLaunch(() => {
  renderApp();
  installBackgroundLock();
});

// Refresca la pantalla cuando Firebase confirma la sesión (al cargar,
// o si se inicia/cierra sesión desde otro sitio) para que el icono de
// cuenta y los datos reflejen el estado real.
onAuthChange(() => {
  renderApp();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Si falla el registro (p. ej. abierto en local sin https),
      // la app sigue funcionando, solo sin caché offline.
    });
  });
}
