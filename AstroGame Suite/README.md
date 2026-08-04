# AstroGame Suite

Userscript único (Tampermonkey/Violentmonkey) que unifica las herramientas de [AstroGameScripts](../README.md) en una sola instalación, con un registro de módulos compartido en vez de scripts independientes.

**Estado actual: única instalación soportada.** Los scripts individuales que dieron origen a estos módulos se movieron a [`DEPRECATED/`](../DEPRECATED/) como referencia histórica y no reciben actualizaciones.

## Por qué existe

Los 5 scripts compartían convenciones (lectura de hora del servidor desde el DOM, formato de números, patrón fetch + `DOMParser`) pero se instalaban y actualizaban por separado, y cada uno reimplementaba sus propios helpers. Esta suite centraliza esas utilidades y decide, según la URL de la página, qué módulo(s) activar — una sola instalación, un solo `@version`, un panel de ajustes común.

**Nota:** este proyecto no tiene relación de código ni de licencia con ninguna extensión de terceros para juegos tipo OGame. Es una reescritura propia desde cero de la funcionalidad ya implementada en los scripts de este mismo repositorio.

## Arquitectura

```
AstroGame Suite.user.js
├── Núcleo
│   ├── getServerNow() / getServerNowFromDom()      — hora del servidor
│   ├── readJSON() / writeJSON()                    — storage seguro (try/catch)
│   ├── formatFull() / formatShort() / toNumber()   — formato de números (tabla SUFFIXES de 40 entradas)
│   ├── createPanel() / insertPanelAfter() / buildResourceTable() — UI al estilo nativo del juego
│   ├── addNavButton() / removeNavButton()          — botones en la barra lateral
│   ├── Settings (getSettings/setSettings/getModuleSettings/setModuleSettings) — localStorage `astro_suite_settings_v1`
│   └── Página de settings a pantalla completa, vinculada a la URL (`?astroSuite=settings`) — checkbox de activación por módulo + registerSettingsSection para campos propios
├── MODULES[]          — un registro por módulo: id, label, matches(path), init(ctx)
└── init()              — añade el botón de la Suite, resuelve qué módulos aplican a la página actual y respetan enabled/disabled
```

Cada módulo recibe un `ctx` con todas las utilidades del núcleo (`getServerNow`, `formatFull`, `formatShort`, `toNumber`, `readJSON`, `writeJSON`, `createPanel`, `insertPanelAfter`, `buildResourceTable`, `getModuleSettings`, `setModuleSettings`, `addNavButton`, `removeNavButton`, `registerSettingsSection`), en vez de reimplementarlas.

## Módulos migrados

| Módulo (`id`) | Se activa en | Origen |
|---|---|---|
| `expeditionCalc` | Mensajes | [Astro Expedition Calc](../DEPRECATED/Astro%20Expedition%20Calc/) (deprecado) |
| `expeditionReminder` | Cualquier página | [Astro Expedition Reminder](../DEPRECATED/Astro%20Expedition%20Reminder/) (deprecado) |
| `cerealStats` | Miembros de la alianza | [Astro Cereal Stats](../DEPRECATED/Astro%20Cereal%20Stats/) (deprecado) |

## Módulos nuevos (Fase 2)

| Módulo (`id`) | Se activa en | Qué hace |
|---|---|---|
| `resourceDashboard` | Recursos / Edificios / Investigación | Fusiona `roi` y `resourceCalc` (los dos módulos migrados originales) bajo un único id/toggle de settings: en Recursos muestra la producción total de la cuenta (todos los planetas); en Edificios/Investigación muestra los días de ROI de la siguiente mejora disponible. `initResourceDashboard(ctx)` decide cuál de los dos renderizar según la URL actual |
| `highlighter` | Mensajes / Miembros de la alianza / Galaxia | Resalta en color configurable los nombres de jugador/alianza que coincidan con reglas definidas en el panel de settings (texto + color por regla). En galaxia usa un `MutationObserver` sobre `#ajaxGalaxyBodyTableTBody` porque esa tabla se recarga vía AJAX al cambiar de sistema, sin recarga de página |
| `usability` | Cualquier página | Fusiona los antiguos módulos `usability` y `chatFooter` bajo un único id/toggle de settings (`initUsability` llama a `initChatFooter` internamente): atajos de teclado de navegación (G/M/R/I/F/A/D/O, desactivables en settings), botón de copiar coordenadas en la vista de galaxia (`.tdTooltipHeader .coords`, con `MutationObserver` para el AJAX de sistema), botón flotante "volver arriba", y barra/ventana de chat flotante (estilo OGame) con `iframe` a `universeChat`, minimizable, redimensionable y con tamaño/estado persistentes en `localStorage` (excepto en la propia página de chat). El tamaño guardado y el límite de redimensionado dejan siempre un margen de 140px libre en la parte superior de la ventana para que no tape banners fijos como el de `expeditionReminder` |

Nota de comportamiento: `roi` usaba internamente una tabla de abreviaturas reducida (`'', 'K', 'M', 'Mr', 'T'`) que truncaba visualmente números grandes; al migrar pasó a usar la tabla completa de 40 entradas compartida con el resto de módulos, así que ahora puede mostrar sufijos mayores a `T` en vez de cortar el número.

`cerealStats` conserva, sin modificar, el bloque de atribución a CerealOgameStats (MIT, Elías Grande/Ouraios) justo antes de su código — es un requisito de licencia, no de estilo.

## Cómo añadir un módulo nuevo

1. Escribir una función `initMiModulo(ctx)` que construya el panel (con `ctx.createPanel`/`ctx.insertPanelAfter`) y use `ctx.getServerNow`/`ctx.formatShort`/`ctx.readJSON`/etc. en vez de reimplementarlos.
2. Añadir una entrada en `MODULES[]` con `id`, `label`, `matches(path)` e `init: initMiModulo`.
3. Si el módulo necesita ajustes propios, usar `ctx.registerSettingsSection(id, renderFn)` para pintarlos dentro del panel de settings de la Suite.

## Backlog (Fase 2+, no implementado todavía)

Funciones nuevas, diseñadas y escritas desde cero, agrupadas solo por categoría de nombre (sin código ni lógica de terceros de por medio) y marcadas por viabilidad cliente-only (`@grant none`, sin backend):

| Categoría | ¿Viable ya (DOM/fetch)? | Nota |
|---|---|---|
| Recursos/edificios (dashboard combinado) | **Hecho** | Implementado como `resourceDashboard`, fusión de los antiguos módulos `resourceCalc` y `roi` bajo un único toggle de settings |
| Coloreado/resaltado (jugador/alianza/estado) | **Hecho** | Implementado como `highlighter`: reglas texto→color configurables, aplicadas en mensajes y lista de miembros de alianza |
| Panel de información (resumen de cuenta) | Retirado | Se implementó como `accountPanel` (edificios, flota, defensas, ranking de puntos) pero se consideró sin utilidad real una vez existe la vista de imperio nativa del juego, y se eliminó |
| Mensajes: acciones masivas (borrado real) | Revisar viabilidad | Se probó un módulo `messageFilter` (listado por umbral + borrado vía `POST /uni25/game/messages/action`, acción `deletemarked`) y se retiró porque el borrado no funcionaba de forma fiable contra el juego real; retomar solo si se identifica por qué fallaba |
| Herramientas (simuladores, calculadoras de coste) | Retirado | Se implementó como `costCalculator` (coste del siguiente nivel en Recursos/Instalaciones/Investigación) pero se consideró sin utilidad real frente a `roi` y se eliminó |
| Skin & usabilidad (atajos, táctil, tooltips) | **Hecho** | Implementado como `usability`: atajos de teclado de navegación, copiar coordenadas en galaxia, botón "volver arriba" |
| Movimientos de flota (resumen, phalanx, fleetsave) | Resumen retirado; phalanx/fleetsave sin inspeccionar | Se implementó el resumen como `fleetSummary` pero se consideró sin utilidad real y se eliminó. Automatizar acciones (no solo leer) queda fuera de alcance por riesgo de ToS |
| Vista de galaxia mejorada | Revisar viabilidad | No se ha inspeccionado aún el DOM/datos de esa página |
| Base de datos de jugadores/universo vía API | Revisar viabilidad, probablemente inviable | Implicaría scraping masivo página a página o una API no documentada |
| Backup/sync de settings entre dispositivos | Revisar viabilidad, probablemente necesita backend | Sin backend, solo viable como export/import manual de JSON en el panel de settings — no sync real |

### Detalle de viabilidad — Panel de información (resumen de cuenta)

Se llegó a implementar (`accountPanel`): edificios/instalaciones por planeta, flota y defensas totales de la cuenta, y ranking de puntos, con los nombres resueltos vía `languageData.tech`. Se retiró porque el juego ya tiene una vista de imperio nativa que cubre la misma necesidad sin duplicar el trabajo con fetches adicionales. No se seguirá esta línea salvo que aparezca un caso de uso que la vista de imperio no cubra.

### Detalle de viabilidad — Movimientos de flota (resumen, phalanx, fleetsave)

Se llegó a implementar el resumen (`fleetSummary`): tabla de flotas propias en movimiento (`tr.fleetRows.own`) con countdown en vivo (`data-fleet-end-time` vs. `ctx.getServerNow()`), misión, origen/destino y composición leída del tooltip. Se retiró por considerarse sin utilidad real. Phalanx y fleetsave quedan sin inspeccionar; no se retoma esta línea salvo petición explícita.
