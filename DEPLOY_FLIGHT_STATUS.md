# Desplegar la Cloud Function de estado de vuelos

Esto oculta tu clave de RapidAPI en el servidor, en vez de tenerla suelta en
el navegador. Se hace una sola vez (y cada vez que cambies `functions/index.js`).

## 0. Requisito: pasar a plan Blaze

En la consola de Firebase → engranaje (⚙️) → **Uso y facturación** → cambia
del plan Spark al plan **Blaze** (pago por uso). Es imprescindible: las
Cloud Functions solo pueden llamar a APIs externas (como AeroDataBox) en
este plan. Sigue teniendo una capa gratuita amplia; con el uso de una app
personal no debería generarte cargo alguno.

## 1. Instala las herramientas (una sola vez en tu ordenador)

```bash
npm install -g firebase-tools
firebase login
```

Esto abre el navegador para que inicies sesión con la cuenta de Google con
la que creaste el proyecto Firebase.

## 2. Coloca estos archivos en tu proyecto

Copia estas carpetas/archivos a la raíz de tu repositorio (junto a
`index.html`, `main.js`, etc.):

```
tu-repositorio/
├── firebase.json
├── .firebaserc
└── functions/
    ├── index.js
    └── package.json
```

## 3. Instala las dependencias de la función

```bash
cd functions
npm install
cd ..
```

## 4. Guarda tu clave de RapidAPI como secreto

```bash
firebase functions:secrets:set AERODATABOX_KEY
```

Te pedirá que pegues el valor — pega tu clave de RapidAPI (la misma que
tenías en `flight-status-config.js`, `8f0bbd1a91mshf...`). Con esto, la
clave queda guardada de forma cifrada en Firebase, no en ningún archivo.

## 5. Despliega la función

```bash
firebase deploy --only functions
```

Al terminar, la terminal imprime una URL parecida a:

```
https://us-central1-travel-planner-e16e1.cloudfunctions.net/flightStatus
```

## 6. Pega esa URL en tu app

Abre `flight-status-config.js` y pon esa URL en `FLIGHT_STATUS_ENDPOINT`.
Sube ese archivo (y solo ese, de la app web) a tu repositorio como siempre.

## Para actualizar la función más adelante

Si cambias algo en `functions/index.js`, solo hace falta repetir el paso 5
(`firebase deploy --only functions`); no hace falta tocar los secretos ni
la URL, que se mantienen igual.
