# 🛰️ Mission Designer — NASA Space Apps Challenge

Juego interactivo para diseñar una misión espacial completa: objetivo → órbita y lanzador → nave → instrumentos → comunicaciones → simulación → reporte. Modo **un jugador** o **equipo de hasta 4** con roles.

## Arranque rápido

```bash
npm install
npm run dev      # desarrollo: frontend http://localhost:5173 (+ servidor en :3001)
npm test         # pruebas del motor de reglas
npm run build    # compila el frontend en /dist
npm start        # producción: un solo proceso sirve todo en http://localhost:3001
```

## Arquitectura (monolito)

```
client/   React + react-three-fiber (Three.js) — UI y visualización 3D
server/   Express + Socket.io — sirve /dist y sincroniza salas multijugador
shared/   Motor de reglas y estado — lo usan cliente Y servidor
data/     JSON de órbitas, lanzadores, componentes, instrumentos y misiones
```

- **`shared/engine.js`**: `analyze(design, missionId)` calcula masa, energía, batería, datos, costo, tiempo y ciencia, y devuelve los problemas con su explicación (*por qué* importan). `simulate(design, missionId, seed)` simula mes a mes con eventos aleatorios reproducibles y calcula el puntaje.
- **`shared/state.js`**: reducer único. En modo un jugador corre en el navegador; en modo equipo corre en el servidor, que tiene la última palabra. Define los 4 roles y qué campos edita cada uno (un rol que nadie tomó lo puede editar cualquiera).
- **Multijugador**: el servidor crea salas con código de 4 letras. La simulación se lanza cuando **todos** marcan "listo", así que el equipo tiene que ponerse de acuerdo. Hay chat y bitácora de cambios.

## Modo exploración (Luna y Marte)

En las misiones `moon_water` y `mars_life`, si la nave aterriza con un rover, el reporte ofrece **🕹️ Manejar el rover**: un modo en tercera persona (cámara suave detrás del rover) donde el rover usa exactamente las piezas diseñadas:

| Pieza del diseño | Efecto al jugar |
|---|---|
| Batería | Autonomía; si se agota, el rover hiberna |
| Paneles / RTG | Recarga solo de día (o siempre con RTG); tormentas de polvo y sombra eterna |
| Radio | Cuántos MB se envían en cada paso del orbitador; la ciencia solo cuenta al llegar a la Tierra |
| Instrumentos | Qué lugares se pueden analizar (los demás quedan 🔒) |
| Tipo de rover | Velocidad y consumo |

- `data/sites.json`: sitios, lugares de interés, cráteres, ciclo día/noche, relevo de comunicaciones.
- `client/src/explore/sim.js`: lógica pura (probada con un piloto automático en `sim.test.js`).
- `client/src/explore/terrain.js`: construye el terreno a partir de **modelos de elevación reales** (`data/dem/*.json`); si un sitio no tiene DEM usa terreno procedural.

### Relieve real (DEM)

| Sitio | Fuente | Ventana |
|---|---|---|
| Cráter Jezero, Marte | [HiRISE DTM Mosaic — Mars 2020 Terrain Relative Navigation](https://astrogeology.usgs.gov/search/map/Mars/Mars2020/JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40) (USGS Astrogeology), 1 m/píxel | 3×3 km: frente del delta y sitio de aterrizaje de Perseverance |
| Polo sur lunar | [LOLA LDEM_80S_20MPP_ADJ](https://pgda.gsfc.nasa.gov/products/90) (NASA GSFC PGDA; Barker et al. 2023, *PSJ* 4:183), 20 m/píxel | 6×6 km a ~12 km del polo, con un cráter en sombra permanente |

```bash
node scripts/fetch-dem.mjs                 # vuelve a descargar ambas ventanas (~7 min Jezero, ~1 min LOLA)
node scripts/analyze-site.mjs mars_jezero  # mapa de texto + lugares altos/bajos/empinados para ubicar POIs
```

`fetch-dem.mjs` descarga **solo los bytes de la ventana** (peticiones HTTP por rango, sin bajar los GB del archivo completo), la reduce a 257×257 y la guarda (~200 KB). Para la Luna también calcula la **sombra permanente**: celdas que no ven el Sol en ninguna dirección con el Sol a 1,6° (máximo en el polo), usando 30 km de relieve alrededor como horizonte. La forma y las pendientes son reales; en Marte la altura se exagera ×2 para que el relieve se note (configurable con `vertical_exaggeration` en `data/sites.json`). El HUD muestra la altitud real en metros.
- Desde la pantalla de inicio hay botones de demo para probarlo directamente.

## Idiomas (es · en · de · fr · it)

- El texto en español del código es la llave: `t('Simular misión')` busca la traducción en `shared/i18n/{en,de,fr,it}.json`; si falta, se muestra en español. Los textos con datos usan marcadores: `t('{n} años', { n: 3 })`.
- Los datos (`data/*.json`) se traducen solos al cambiar de idioma (`shared/catalog.js`), igual que los objetos marcados con `translatable()` (fallas, medallas, roles…).
- En modo equipo cada jugador ve su idioma: el servidor guarda llaves + parámetros y el reporte se recalcula con la misma semilla en el cliente.

```bash
npm run i18n:check                    # lista textos sin traducir por idioma
node scripts/browser-i18n.mjs de      # recorre las pantallas en alemán y señala restos en español
```

Al agregar un texto nuevo: escríbelo con `t('…')`, corre `npm run i18n:check` y añade su traducción a los 4 JSON.

## Cuando lleguen los datasets oficiales

1. Revisar el formato de los datasets.
2. Si los campos se pueden mapear, reemplazar los JSON de `data/` (mismos nombres de campo).
3. Si el formato es distinto (CSV, otros nombres), escribir la conversión en `shared/catalog.js` o un script en `data/` que genere los JSON.
4. Correr `npm test` y recalibrar `target_science` / presupuestos en `data/missions.json` si hace falta.

Los valores actuales son **aproximaciones de ejemplo** basadas en información pública.

## Ideas siguientes

- Animación del lanzamiento y de la simulación en la vista 3D
- Ranking por sala / modo competitivo entre equipos con el mismo objetivo
- Eventos que obliguen a negociar entre roles (p. ej. "recorte de presupuesto del 15%")
- Tutorial guiado para la primera misión
- Exportar el reporte final (PDF/imagen) para compartir
