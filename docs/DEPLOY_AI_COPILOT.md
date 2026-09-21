# Desplegar la Cloud Function del Copiloto IA (generador de itinerarios)

Esto oculta tu clave de Anthropic (Claude) en el servidor, en vez de tenerla
suelta en el navegador. Se hace una sola vez (y cada vez que cambies
`functions/index.js`). Si ya desplegaste antes la función `flightStatus`,
la mayoría de estos pasos ya los tienes hechos — solo cambia el paso 4 y
volver a desplegar (paso 5).

## 0. Requisito: plan Blaze + una clave de Anthropic

- En la consola de Firebase → engranaje (⚙️) → **Uso y facturación** → plan
  **Blaze** (pago por uso). Imprescindible para que las Cloud Functions
  puedan llamar a APIs externas.
- Consigue una clave de API en [console.anthropic.com](https://console.anthropic.com/settings/keys).
  Esta función usa el modelo `claude-sonnet-5`; con un uso normal (unas
  pocas generaciones de itinerario al día) el coste es bajo, pero depende
  de tu cuenta de Anthropic — revisa allí los precios y límites.

## 1. Instala las herramientas (si no lo hiciste ya)

```bash
npm install -g firebase-tools
firebase login
```

## 2. Coloca estos archivos en tu proyecto

Copia estos archivos a la raíz de tu repositorio (junto a `index.html`,
`main.js`, etc.), dentro de una carpeta `functions/`:

```
tu-repositorio/
├── firebase.json
├── .firebaserc
└── functions/
    ├── index.js       (ya incluye "flightStatus" y "generateItinerary")
    └── package.json
```

## 3. Instala las dependencias de la función

```bash
cd functions
npm install
cd ..
```

## 4. Guarda tu clave de Anthropic como secreto

```bash
firebase functions:secrets:set ANTHROPIC_API_KEY
```

Te pedirá que pegues el valor — pega tu clave de Anthropic (empieza por
`sk-ant-...`). Queda guardada cifrada en Firebase, nunca en un archivo.

## 5. Despliega la función

```bash
firebase deploy --only functions
```

Al terminar, la terminal imprime una URL parecida a:

```
https://us-central1-travel-planner-e16e1.cloudfunctions.net/generateItinerary
```

## 6. Pega esa URL en tu app

Abre `js/ai-copilot-config.js` y pon esa URL en `AI_COPILOT_ENDPOINT`. Sube ese
archivo a tu repositorio como siempre. En cuanto tenga un valor, el botón
"✨ Generar con IA" aparecerá en la pestaña "Plan" de cada viaje; mientras
esté vacío, el botón simplemente no se muestra.

## Notas

- Igual que `flightStatus`, la función exige que quien llama tenga sesión
  iniciada en la app (Firebase Auth) — así nadie puede usar tu clave de
  Anthropic sin pasar por tu app.
- El itinerario generado nunca sobrescribe vuelos, hoteles ni gastos reales:
  solo añade/reemplaza actividades en el rango de fechas que se ha
  generado, y guarda el presupuesto estimado y las recomendaciones de
  restaurantes aparte, como sugerencias.
- Si más adelante quieres cambiar de modelo o de proveedor (por ejemplo un
  modelo más barato para el plan gratuito y uno más completo para el plan
  Pro), el único sitio que toca es la constante `AI_MODEL` en
  `functions/index.js`.

## Para actualizar la función más adelante

Si cambias algo en `functions/index.js`, solo hace falta repetir el paso 5
(`firebase deploy --only functions`); no hace falta tocar los secretos ni
la URL, que se mantienen igual.
