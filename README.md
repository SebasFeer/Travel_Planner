# Viajoo — versión web (PWA)

Reescritura de tu app de escritorio (PySide6 + SQLite) como una **Progressive Web App**:
funciona en el iPhone (y en cualquier móvil o navegador) sin pasar por la App Store,
sin Mac y sin cuenta de Apple Developer.

## Qué incluye

- Viajes, vuelos, hoteles, itinerario, transporte, reservas, gastos y checklist — igual que la versión de escritorio.
- Calendario mensual con los eventos de cada viaje.
- Panel de resumen por viaje (presupuesto, checklist, próximos eventos).
- Aviso en el resumen si hoy tienes un vuelo o una actividad.
- Botón "Mapa" que abre Google Maps con la dirección o la ruta.
- **Exportar / Imprimir**: genera una vista de todo el viaje y usa el diálogo de impresión
  del propio navegador. En iPhone, desde ese diálogo puedes elegir "Guardar en PDF" —
  sustituye a la exportación con ReportLab sin depender de librerías externas.
- **Copia de seguridad**: exporta todos tus datos a un archivo `.json` y podrás
  importarlos de nuevo (en este u otro dispositivo). Los datos viven en el propio
  navegador (IndexedDB), así que exportar de vez en cuando es tu forma de tener backup.

## Publicarla en GitHub Pages (gratis, sin Mac ni cuenta de Apple)

1. **Crea un repositorio** en GitHub (por ejemplo `travel-planner`). Puede ser público o privado
   (si es privado necesitarás GitHub Pro para activar Pages; si no, hazlo público).
2. **Sube todos los archivos de esta carpeta** a la raíz del repositorio, tal cual
   (mantén la estructura de carpetas `css/`, `js/`, `icons/`).
   - Más fácil desde el navegador: en la página del repo, "Add file → Upload files",.
     arrastra todo el contenido de esta carpeta y confirma el commit.
3. Ve a **Settings → Pages**.
4. En "Build and deployment", elige **Deploy from a branch**, rama `main`, carpeta `/ (root)`,
   y guarda.
5. Espera uno o dos minutos. GitHub te dará una URL parecida a:
   `https://tu-usuario.github.io/travel-planner/`
6. Abre esa URL **en Safari, en tu iPhone**.
7. Toca el icono de compartir (el cuadrado con la flecha hacia arriba) → **"Añadir a
   pantalla de inicio"**.
8. Ya tienes un icono en tu iPhone que abre la app a pantalla completa, sin barra de Safari.

No hace falta ningún paso adicional: GitHub Pages sirve el sitio con HTTPS automáticamente,
que es lo que exige un Service Worker para funcionar sin conexión.

## Actualizar la app más adelante

Cada vez que subas cambios a la rama `main`, GitHub Pages los publica solos en
1-2 minutos. Si la tienes añadida a la pantalla de inicio, el icono se actualiza
solo (el Service Worker refresca el contenido en segundo plano).

**Cómo subir esos cambios:** aunque "Add file → Upload files" en la web de
GitHub funciona, no deja ver un diff antes de publicar ni corre ninguna
comprobación. Se recomienda clonar el repo y trabajar en local (o en un
Codespace):

```bash
git clone https://github.com/<tu-usuario>/travel-planner.git
cd travel-planner
# ...editas los archivos...
git add <archivos-cambiados>
git commit -m "Describe el cambio"
git push
```

Así cada cambio pasa primero por el workflow de CI (`.github/workflows/ci.yml`,
comprueba sintaxis JS y JSON antes de fusionar) y queda un historial de commits
legible en vez de una sucesión de "Add files via upload".

## Limitaciones a tener en cuenta

- Los datos se guardan **solo en ese navegador/dispositivo**. Si borras datos de
  Safari o desinstalas la app de la pantalla de inicio, se pierden — usa el botón
  de copia de seguridad (⇅ arriba a la derecha en "Mis viajes") de vez en cuando.
- No hay sincronización automática entre tu iPhone y tu ordenador; se haría
  importando/exportando el mismo archivo `.json`, o más adelante añadiendo un
  backend (por ejemplo Firebase) si te interesa dar ese paso.

## Siguiente paso: Android

Cuando quieras, adaptamos el código PySide6 original para Android usando
`pyside6-android-deploy` (soporte oficial desde Qt 6.5), compilando el `.apk`
con GitHub Actions en un runner `ubuntu-latest` — sin necesidad de Mac ni de
pagar ninguna cuenta de desarrollador, y conservando ReportLab para el PDF si
lo prefieres frente a la versión de impresión del navegador.
