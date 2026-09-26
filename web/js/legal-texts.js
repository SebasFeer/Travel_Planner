// ============================================================
// legal-texts.js — Textos legales de la web de Viajoo.
//
// Son una COPIA literal de los que muestra la app en Ajustes → Legal
// (constantes *_TEXT de js/app.js), para que la web y la app digan
// exactamente lo mismo. Si cambias uno de esos textos en la app,
// copia el cambio aquí también.
//
// Los datos del titular siguen entre corchetes ([NOMBRE Y APELLIDOS],
// [EMAIL DE CONTACTO]...) igual que en la app: hay que rellenarlos
// con los datos reales antes de publicar.
// ============================================================

const YEAR = new Date().getFullYear();

export const LEGAL_DOCS = [
  {
    id: "aviso-legal",
    title: "Aviso legal (LSSI)",
    text: `Última actualización: ${YEAR}

1. Identificación del titular
En cumplimiento del deber de información de la Ley 34/2002, de 11 de
julio, de Servicios de la Sociedad de la Información y de Comercio
Electrónico (LSSI-CE), se informa de que Viajoo es un proyecto
personal cuyo titular es:

Titular: [NOMBRE Y APELLIDOS]
DNI/NIF: [DNI/NIF]
Domicilio: [DOMICILIO]
Correo de contacto: [EMAIL DE CONTACTO]

Por ahora Viajoo es una aplicación personal en fase de
desarrollo y pruebas, sin actividad económica real todavía: la
función Pro no cobra nada mientras tanto (ver "Condiciones de
suscripción"). Si eso cambia, este aviso se actualizará con los datos
de actividad económica que correspondan.

2. Objeto
Viajoo es una aplicación web (PWA) para organizar viajes:
itinerario, vuelos, hoteles, gastos, documentos y contenido
relacionado, guardado principalmente en el propio dispositivo de
quien la usa.

3. Condiciones de acceso y uso
El acceso a Viajoo es gratuito, salvo por las funciones
marcadas como "Pro" (ver Condiciones de suscripción). Usar la
aplicación implica aceptar este Aviso Legal, los Términos y
Condiciones de Uso, y la Política de Privacidad.

4. Legislación aplicable y fuero
Estas condiciones se rigen por la legislación española. Para
cualquier controversia que no se resuelva por el canal de contacto y
reclamaciones, y cuando la persona usuaria tenga la condición de
consumidora, se estará a lo dispuesto por la normativa de protección
de consumidores en cuanto a juzgados y tribunales competentes.`,
  },
  {
    id: "privacidad",
    title: "Privacidad y protección de datos",
    text: `Última actualización: ${YEAR}

Responsable del tratamiento
[NOMBRE Y APELLIDOS], con DNI/NIF [DNI/NIF] y domicilio en
[DOMICILIO], es quien responde de los datos que trata esta aplicación.
Puedes escribir a [EMAIL DE CONTACTO] para cualquier duda sobre esta
política o para ejercer tus derechos.

1. Qué datos guarda Viajoo
Los datos de tus viajes (vuelos, hoteles, itinerario, transporte, reservas,
gastos y checklist) se guardan en tu propio dispositivo, en el
almacenamiento local del navegador (IndexedDB). No se envían a ningún
servidor salvo que actives voluntariamente la copia en la nube.

2. Cuenta y copia en la nube
Si creas una cuenta (con email y contraseña, o con tu cuenta de Google),
tus datos se guardan también en Firebase (Google) bajo tu usuario, para
poder recuperarlos en otro dispositivo. Puedes cerrar sesión y eliminar tu
cuenta cuando quieras. Las funciones básicas siguen funcionando sin
cuenta, de forma 100% local; las funciones Pro, en cambio, sí piden tener
una cuenta creada (gratuita, sin ningún cobro todavía) — ver Condiciones
de suscripción Pro.

3. Servicios externos que puede consultar la app
Para mostrar mapas, calcular rutas, encontrar fotos e imágenes reales de
tus vuelos, hoteles, actividades y transportes, descubrir lugares cercanos,
o convertir monedas, la app envía consultas puntuales (por ejemplo, un
nombre de lugar, unas coordenadas, o los códigos de dos monedas) a
servicios públicos de terceros: OpenStreetMap/Nominatim, OSRM y Overpass
(mapas, rutas y lugares cercanos), Wikipedia/Wikimedia Commons/Openverse
(fotos y descripciones), y Frankfurter/open.er-api (tipos de cambio).
Estas consultas no incluyen tu identidad ni el resto de tus datos, solo el
texto necesario para la búsqueda. Además, a diferencia de esas consultas
puntuales, en cada visita el navegador carga las tipografías de la app
(Plus Jakarta Sans, Inter e IBM Plex Mono) desde Google Fonts
(fonts.googleapis.com); esa carga, como la de cualquier recurso externo,
revela tu dirección IP a Google mientras descarga la fuente (ver también
Cookies y almacenamiento local).

4. Copiloto de viajes con IA (función Pro)
Al generar un itinerario con IA, el destino, las fechas y las preferencias
que escribes se envían a una función de servidor propia (Cloud Function),
que a su vez se los pasa a la API de Anthropic (Claude) para redactar la
propuesta. Solo viaja lo que escribes en ese formulario, nunca el resto de
tus datos guardados; la respuesta no se usa para nada más que mostrarte el
itinerario generado.

5. Avisos de estado de vuelo (función Pro)
Si activas esta función, el número de vuelo y la fecha se envían a una
función de servidor propia, que consulta AeroDataBox/RapidAPI para conocer
retrasos y puerta de embarque. Estos datos no pasan por ningún otro sitio.

6. Viajes compartidos (función Pro)
Si compartes un viaje con un código de 6 dígitos (o su QR, que solo
contiene ese mismo código), sus datos (vuelos, hoteles, itinerario...)
se guardan en un documento de Firestore accesible por quienes tengan
el código, además de en tu copia personal de la nube. Cualquiera con
el código o el QR puede ver y unirse a ese viaje mientras esté activo.
Al escanear un QR para unirte a un viaje, la app usa la cámara del
dispositivo solo mientras la ventana de escaneo está abierta: ese
vídeo nunca se guarda ni se envía a ningún sitio, solo se analiza en
el propio dispositivo para leer el código.

7. Notificaciones
Si activas los avisos, se generan en tu propio dispositivo a partir de tus
datos guardados localmente. No implican el envío de información a
servidores externos.

8. Exportar a PDF o al calendario del dispositivo
El PDF del itinerario y el archivo .ics para el calendario se generan
enteramente en tu dispositivo, a partir de tus datos guardados, y solo
cuando tú pulsas el botón correspondiente — nunca en automático ni en
segundo plano. El archivo .ics no se sincroniza con nada por su cuenta:
tienes que abrirlo tú mismo con tu app de calendario (Google Calendar,
Apple Calendar...) para decidir qué añadir.

9. PIN y desbloqueo biométrico
El PIN es opcional y, si lo activas, se guarda cifrado (hash) únicamente en
tu dispositivo. Si además activas Face ID/huella como atajo, la
verificación la hace tu propio sistema operativo: la app nunca recibe ni
guarda tu huella o tu cara, solo la confirmación de que el gesto se
completó. Nadie más que tú puede ver ni recuperar tu PIN.

10. Analítica y publicidad
Viajoo no usa herramientas de analítica ni de seguimiento, y no
muestra publicidad dentro de la app.

11. Base legal y conservación de tus datos
Tratamos tus datos para prestarte el servicio que pides (organizar tus
viajes) y, cuando das tu consentimiento expreso, para funciones
opcionales concretas (copia en la nube, PIN, biometría, notificaciones,
viajes compartidos). Tus datos se conservan mientras mantengas la app
instalada y, si tienes cuenta, hasta que la elimines o nos pidas que
la borremos.

12. Tus derechos
Tienes derecho a acceder, rectificar, suprimir, limitar y oponerte al
tratamiento de tus datos, y a la portabilidad de los mismos. Como la
mayoría de tus datos viven solo en tu dispositivo, ya ejerces varios de
estos derechos tú mismo desde Ajustes → Copiar / restaurar datos
(exportar o borrar) y Ajustes → Mi cuenta (eliminar la cuenta). Para lo
que no puedas hacer directamente, escríbenos a [EMAIL DE CONTACTO]. Si
consideras que no hemos atendido bien tu solicitud, puedes reclamar ante
la Agencia Española de Protección de Datos (www.aepd.es).

13. Transferencias internacionales
Firebase (Google) y Anthropic pueden tratar datos en servidores fuera
del Espacio Económico Europeo, acogidos a las garantías que exige el
RGPD (cláusulas contractuales tipo u otro mecanismo equivalente que
ofrezca cada proveedor).

14. Menores de edad
Viajoo no está dirigida a menores de 14 años. Si eres menor de
edad, necesitas el consentimiento de tus padres o tutores para crear
una cuenta o activar funciones que impliquen guardar datos en la nube.

15. Contacto
Si tienes dudas sobre tus datos o esta política, puedes escribirnos a
[EMAIL DE CONTACTO].`,
  },
  {
    id: "terminos",
    title: "Términos y condiciones de uso",
    text: `Última actualización: ${YEAR}

1. Objeto y aceptación
Estas condiciones regulan el uso de Viajoo, una aplicación para
organizar viajes. Al usarla, aceptas estas condiciones, el Aviso Legal
y la Política de Privacidad. Si no estás de acuerdo, no uses la
aplicación.

2. Quién puede usarla
Viajoo no está dirigida a menores de 14 años. Si eres menor de
edad, necesitas el consentimiento de tus padres o tutores para crear
una cuenta.

3. Tu cuenta
Crear una cuenta es opcional. Si lo haces, eres responsable de
mantener segura tu contraseña y de la actividad que ocurra con tu
cuenta. Avísanos en [EMAIL DE CONTACTO] si sospechas un uso no
autorizado.

4. Uso aceptable
Te comprometes a usar Viajoo de forma lícita, sin:
- Intentar acceder a datos de otras personas usuarias sin autorización.
- Usar la función de compartir viajes para distribuir contenido
  ilegal, ofensivo o que infrinja derechos de terceros.
- Interferir con el funcionamiento de la app o de los servicios de
  terceros que consulta (mapas, tipos de cambio, IA...).

5. Contenido que introduces tú
Los datos de tus viajes (destinos, notas, fotos que subas si lo haces...)
son tuyos. Nos das permiso únicamente para procesarlos y mostrártelos a
ti (y a quien invites, si compartes un viaje), nunca para usarlos con
otro fin. Ver también Propiedad intelectual.

6. Disponibilidad del servicio
Viajoo depende en parte de servicios externos gratuitos (mapas,
tipos de cambio, geocodificación, IA...) que pueden fallar o dejar de
estar disponibles sin previo aviso; la app está pensada para seguir
funcionando con lo que ya tengas guardado localmente aunque eso pase.
No garantizamos que el servicio esté disponible de forma
ininterrumpida.

7. Cambios en la app y en estas condiciones
Podemos añadir, cambiar o retirar funciones, y actualizar estas
condiciones. Si el cambio es importante, avisaremos dentro de la app.
Seguir usando Viajoo después de un cambio implica que lo
aceptas.

8. Limitación de responsabilidad
Viajoo se ofrece "tal cual". Dentro de lo que permite la ley, no
respondemos de decisiones de viaje que tomes basándote en datos de la
app (tipos de cambio, estado de vuelos, itinerarios generados por
IA...) ni de fallos de los servicios externos que consulta. Revisa
siempre la información importante (horarios de vuelo, tipos de cambio,
reservas) con la fuente oficial antes de viajar.

9. Terminación
Puedes dejar de usar la app y borrar tus datos cuando quieras (Ajustes
→ Copiar / restaurar datos, o eliminar tu cuenta). Podemos suspender el
acceso a quien incumpla gravemente estas condiciones (por ejemplo,
abusando de la función de compartir viajes).

10. Legislación aplicable
Estas condiciones se rigen por la ley española (ver también Aviso
Legal).`,
  },
  {
    id: "propiedad-intelectual",
    title: "Propiedad intelectual",
    text: `Última actualización: ${YEAR}

1. Titularidad
El código, el diseño, la marca "Viajoo" y los contenidos propios
de la aplicación (textos, iconos e interfaz) son propiedad de
[NOMBRE Y APELLIDOS], salvo el software de terceros con licencia propia
(ver Licencias).

2. Uso permitido
Puedes usar Viajoo para organizar tus propios viajes. No está
permitido copiar, modificar, distribuir o hacer ingeniería inversa de
la aplicación sin permiso, salvo lo que permita la ley o la licencia
del software de terceros que incluye.

3. Tus contenidos
Los datos y contenidos que introduces (notas, fotos que subas si lo
haces, nombres de tus viajes...) siguen siendo tuyos. Ver también la
sección "Contenido que introduces tú" de los Términos y Condiciones.

4. Contenido de terceros mostrado en la app
Algunas fotos, descripciones y datos de mapas que se muestran vienen de
fuentes de terceros con su propia licencia:
- Fotos e imágenes: Wikipedia, Wikimedia Commons y Openverse, bajo las
  licencias abiertas que indique cada imagen (mayoritariamente
  Creative Commons).
- Datos de mapas: © colaboradores de OpenStreetMap, licencia Open
  Database License (ODbL).
Estas fuentes se consultan solo para mostrarte información útil sobre
tu destino; no se reclama ninguna propiedad sobre ese contenido.

5. Marcas de terceros
Los nombres de aerolíneas, hoteles, monedas o cualquier otra marca que
escribas, o que aparezca a través de un servicio de terceros
consultado, son propiedad de sus respectivos titulares y se muestran
únicamente porque tú los has introducido o porque provienen de ese
servicio.

6. Reclamaciones de propiedad intelectual
Si crees que algo en la app infringe tus derechos de propiedad
intelectual, escríbenos a [EMAIL DE CONTACTO] con el detalle para poder
revisarlo.`,
  },
  {
    id: "cookies",
    title: "Cookies y almacenamiento local",
    text: `Última actualización: ${YEAR}

1. Viajoo no usa cookies de rastreo ni publicitarias
Esta aplicación no coloca cookies propias ni de terceros con fines de
analítica, publicidad o seguimiento entre sitios.

2. Qué guarda tu navegador entonces
En vez de cookies, Viajoo guarda tus datos en dos almacenes
propios del navegador, que solo esta app puede leer y que nunca se
envían a ningún sitio salvo que actives tú la copia en la nube:
- IndexedDB: tus viajes, vuelos, hoteles, gastos, itinerario, y el
  resto de contenido que creas dentro de la app.
- localStorage: ajustes sueltos (por ejemplo, si el modo "Pro" de
  pruebas está activado, o la URL de un mock de desarrollo).
Puedes borrar todo esto en cualquier momento desde los ajustes de tu
navegador ("borrar datos del sitio"), o desde Ajustes → Copiar /
restaurar datos dentro de la app.

3. Fuentes de Google Fonts
Para mostrar su tipografía, la app carga las fuentes Plus Jakarta Sans,
Inter e IBM Plex Mono desde fonts.googleapis.com. Esta petición ocurre
en cada visita (no depende de que actives nada) y, como cualquier
carga desde un servidor externo, revela tu dirección IP a Google
mientras se descarga la fuente. No se usa para publicidad ni para
identificarte.

4. Firebase (si inicias sesión)
Si creas una cuenta o inicias sesión con Google, el SDK de Firebase
puede usar almacenamiento local del navegador (no necesariamente
cookies) para mantener tu sesión iniciada entre visitas. Esto solo
ocurre si decides iniciar sesión.

5. Cómo desactivarlo
Puedes bloquear el almacenamiento local desde los ajustes de tu
navegador, pero ten en cuenta que Viajoo necesita IndexedDB
para guardar tus viajes: si lo bloqueas por completo, la app no podrá
funcionar.`,
  },
  {
    id: "contacto",
    title: "Contacto y reclamaciones",
    text: `Última actualización: ${YEAR}

1. Contacto
Para cualquier duda, incidencia o solicitud sobre tus datos, escribe a
[EMAIL DE CONTACTO].

2. Reclamaciones
Si no estás satisfecho con la respuesta, o quieres presentar una
reclamación formal, puedes:
- Pedir la hoja de reclamaciones escribiendo a [EMAIL DE CONTACTO].
- Si eres consumidor de la Unión Europea y la reclamación es sobre una
  compra Pro (cuando exista cobro real), acudir a la plataforma
  europea de resolución de litigios en línea:
  https://ec.europa.eu/consumers/odr
- Si la reclamación es sobre el tratamiento de tus datos personales,
  puedes acudir a la Agencia Española de Protección de Datos
  (www.aepd.es).

3. Tiempo de respuesta
Al ser un proyecto personal, procuramos responder en un plazo
razonable, aunque no podemos garantizar un tiempo fijo mientras no
haya un equipo de soporte dedicado.`,
  },
  {
    id: "suscripcion",
    title: "Condiciones de suscripción Pro",
    text: `Última actualización: ${YEAR}

1. Estado actual: sin cobro real, pero con registro obligatorio
Viajoo Pro está todavía en fase de pruebas: no hay ningún
sistema de pago real integrado. Mientras esto sea así, lo único que
hace falta para usar una función Pro es tener una cuenta creada
(gratis, con email o con Google) — no hay ningún cargo. Pedimos el
registro para llevar la cuenta de quién usa estas funciones mientras
se termina de integrar un cobro de verdad; estas condiciones se
aplican de forma orientativa para cuando eso ocurra.

Dos de estas funciones (el copiloto de viajes con IA y los avisos de
estado de vuelo) tienen un coste real por cada consulta a un servicio
externo, así que además del registro tienen un límite de 2 usos
gratis por cuenta AL DÍA. Al superarlo, se avisa de que las consultas
ilimitadas llegarán con la futura suscripción.

2. Qué incluye Pro (cuando se active el cobro real)
Viajes ilimitados, compartir viajes, avisos de estado de vuelo,
copiloto de IA, ordenar rutas por cercanía, conversor de moneda y
exportar en PDF — la lista completa se muestra siempre en la ventana
de suscripción dentro de la app.

3. Precio y forma de pago
Todavía por definir. El precio, la periodicidad (mensual/anual) y el
método de pago se anunciarán con claridad antes de pedir ningún dato
de pago. No se cobrará nada sin tu confirmación expresa.

4. Cancelación
Podrás cancelar la suscripción cuando quieras desde la propia app o
desde la plataforma de pago que se use llegado el momento (por
ejemplo, el sistema de suscripciones de Google Play o de la App
Store, si la app llega a distribuirse por ahí). Cancelar detiene la
renovación, pero no siempre da derecho a devolución del periodo ya
pagado (se explicará en el momento de la compra).

5. Derecho de desistimiento
Si compras Pro como persona consumidora dentro de la Unión Europea,
dispondrás de 14 días naturales para desistir de la compra sin
justificar el motivo, salvo que hayas empezado a usar el contenido
digital de pago con tu consentimiento expreso y renunciando a ese
derecho (algo que se pedirá de forma clara y separada, nunca escondido
en la letra pequeña).

6. Cambios en el precio o en las funciones Pro
Si en el futuro cambia el precio o qué incluye Pro, se avisará con
antelación razonable a quienes ya tengan una suscripción activa.`,
  },
  {
    id: "licencias",
    title: "Licencias de terceros",
    text: `Última actualización: ${YEAR}

Viajoo usa las siguientes librerías de código abierto y fuentes
de terceros. Se listan aquí en cumplimiento de sus propias licencias,
que exigen dar crédito a su autoría:

- Leaflet — mapa interactivo. Licencia BSD de 2 cláusulas.
  © Vladimir Agafonkin y colaboradores.
- SortableJS — arrastrar y soltar para reordenar listas. Licencia MIT.
  © colaboradores de SortableJS.
- jsPDF — generación del PDF del mapa y del itinerario en el propio
  dispositivo. Licencia MIT. © autores de jsPDF.
- qrcode — generación del código QR para compartir un viaje. Licencia
  MIT. © Ryan Day (soldair) y colaboradores.
- jsQR — lectura de códigos QR con la cámara. Licencia Apache 2.0.
  © Cosmo Wolfe.
- Firebase JS SDK — cuenta, copia en la nube y viajes compartidos
  (Google). Licencia Apache 2.0.
- Datos de mapas de OpenStreetMap — © colaboradores de OpenStreetMap,
  licencia Open Database License (ODbL) 1.0.
- Tipografías Plus Jakarta Sans, Inter e IBM Plex Mono — Google Fonts,
  licencia SIL Open Font License 1.1.

El texto completo de cada licencia está disponible en el repositorio
del proyecto o en la web de cada proyecto correspondiente.`,
  },
];
