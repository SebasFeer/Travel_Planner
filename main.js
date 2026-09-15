import { renderApp, installSwipeBack, loadTheme, checkAndNotifyToday, installPullToRefresh } from "./app.js";
import { guardOnLaunch, installBackgroundLock } from "./lock.js";
import { onAuthChange, enableAutoSync, syncOnLaunch } from "./cloud.js";

// ⚠️ SOLO MIENTRAS SE DESARROLLA: con esto en `true` la app arranca
// sin pedir el PIN, para no tener que desbloquearla en cada prueba.
// Pon esto en `false` para volver a activar el bloqueo por PIN.
const DEV_DISABLE_PIN = true;

// Aplica el tema guardado (claro/oscuro/automático) antes del primer
// render, para evitar el parpadeo del tema por defecto.
loadTheme();

// Deslizar hacia abajo desde arriba del todo recarga la app.
installPullToRefresh();

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

// A partir de ahora, cada cambio local (crear/editar/borrar algo) se
// sube solo a la nube unos segundos después, sin tener que ir a
// Ajustes → Mi cuenta. Si no has iniciado sesión, esto no hace nada.
enableAutoSync();

// Si al abrir la app ya había una sesión recordada de antes, se
// sincroniza con la nube en segundo plano (sin bloquear el arranque,
// que siempre se hace con lo que ya hay en local). Si trae datos
// nuevos de otro dispositivo, se vuelve a pintar la pantalla.
syncOnLaunch().then((updated) => {
  if (updated) renderApp();
});

// Aviso local de vuelos/actividades de hoy (solo si el usuario lo activó
// en Ajustes → Notificaciones). Nunca bloquea ni rompe el arranque.
checkAndNotifyToday();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Si falla el registro (p. ej. abierto en local sin https),
      // la app sigue funcionando, solo sin caché offline.
    });
  });
}
