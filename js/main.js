import { renderApp, installSwipeBack, installAndroidBackHandling, installModalSwipeToClose, installReturnSplash, loadTheme, checkAndNotifyToday, checkBirthday, installPullToRefresh, afterLogin } from "./app.js";
import { guardOnLaunch, installBackgroundLock } from "./lock.js";
import { onAuthChange, enableAutoSync, syncOnLaunch, completeGoogleRedirect } from "./cloud.js";
import { shouldShowOnboarding, renderOnboarding } from "./onboarding.js";
import { loadLanguage } from "./i18n.js";

// Aplica el tema guardado (claro/oscuro/automático) antes del primer
// render, para evitar el parpadeo del tema por defecto.
loadTheme();

// Deslizar hacia abajo desde arriba del todo recarga la app.
installPullToRefresh();

// Primer arranque real (nunca abrió la app antes en este
// dispositivo): antes de pintar la app se muestra una bienvenida de
// 3 pantallas. El resto del arranque (candado, gestos, back de
// Android...) espera a que se cierre, igual que ya esperaba a que
// se resolviera el PIN.
async function bootApp() {
  // Se espera aquí (no "fire and forget" como loadTheme) porque t()
  // lee el idioma actual de forma síncrona durante el render — si
  // renderApp() se disparara antes de que esto termine, el primer
  // pintado saldría en español por defecto y luego "saltaría" al
  // idioma real.
  await loadLanguage();
  const start = () => {
    renderApp();
    // Si el usuario no activó el PIN en Ajustes → Seguridad, esto no
    // hace nada al volver de segundo plano (installBackgroundLock lo
    // comprueba solo por su cuenta).
    installBackgroundLock();
    installSwipeBack();
    installAndroidBackHandling();
    installModalSwipeToClose();
    installReturnSplash();
  };
  if (await shouldShowOnboarding()) {
    renderOnboarding(start);
  } else {
    start();
  }
}

// El PIN es opcional: si no se activó, guardOnLaunch pasa directo.
guardOnLaunch(bootApp);

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

// Si el usuario acaba de volver de iniciar sesión con Google por
// redirección (signInWithRedirect, el respaldo cuando el navegador
// bloquea la ventana emergente — típico en la app instalada como
// PWA), esto completa ese inicio de sesión y sigue el mismo camino
// que un login normal (afterLogin, con su aviso de "ya hay copia en
// la nube" si hiciera falta). Si no había ningún regreso pendiente,
// devuelve null y seguimos con la sincronización silenciosa de
// siempre para una sesión ya recordada de antes.
completeGoogleRedirect().then((user) => {
  if (user) {
    afterLogin(user);
    return;
  }
  // Si al abrir la app ya había una sesión recordada de antes, se
  // sincroniza con la nube en segundo plano (sin bloquear el arranque,
  // que siempre se hace con lo que ya hay en local). Si trae datos
  // nuevos de otro dispositivo, se vuelve a pintar la pantalla.
  syncOnLaunch().then((updated) => {
    if (updated) renderApp();
  });
});

// Aviso local de vuelos, reservas de hotel y actividades (solo si el
// usuario lo activó en Ajustes → Notificaciones). Se comprueba al
// abrir la app, cada 15 minutos mientras siga abierta, y al volver a
// esta pestaña — así se detecta a tiempo cuando algo entra en la
// ventana de "24h antes" / "8h antes". Nunca bloquea ni rompe nada.
checkAndNotifyToday();
setInterval(checkAndNotifyToday, 15 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkAndNotifyToday();
});

// Felicitación de cumpleaños: basta con comprobarlo al abrir la app
// (no hace falta el sondeo cada 15 min de los avisos de arriba).
checkBirthday();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Si falla el registro (p. ej. abierto en local sin https),
      // la app sigue funcionando, solo sin caché offline.
    });
  });
}
