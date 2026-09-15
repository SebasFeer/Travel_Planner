import { renderApp, installSwipeBack } from "./app.js";
import { guardOnLaunch, installBackgroundLock } from "./lock.js";
import { onAuthChange } from "./cloud.js";

// ⚠️ SOLO MIENTRAS SE DESARROLLA: con esto en `true` la app arranca
// sin pedir el PIN, para no tener que desbloquearla en cada prueba.
// Pon esto en `false` para volver a activar el bloqueo por PIN.
const DEV_DISABLE_PIN = true;

if (DEV_DISABLE_PIN) {
  renderApp();
  installSwipeBack();
} else {
  guardOnLaunch(() => {
    renderApp();
    installBackgroundLock();
    installSwipeBack();
  });
}

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
