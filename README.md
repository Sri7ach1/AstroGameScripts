# AstroGameScripts

Colección de userscripts (Tampermonkey/Violentmonkey) para [Astrogame](https://play.astrogame.org), un juego de navegador estilo OGame. Cada script vive en su propia carpeta, es independiente de los demás, y se activa solo en las páginas del juego que le corresponden (`@match`).

## Scripts

| Script | Se activa en | Qué hace |
|---|---|---|
| [Astro Expedition Calc](Astro%20Expedition%20Calc/README.md) | Mensajes | Suma el botín de expediciones de los últimos 7 días, aunque borres los mensajes |
| [Astro Expedition Reminder](Astro%20Expedition%20Reminder/README.md) | Cualquier página | Avisa si no tienes ninguna expedición volando ahora mismo |
| [Astro ROI](Astro%20ROI/README.md) | Recursos / Investigación | Calcula los días para recuperar la inversión de mejorar una mina o investigación de producción |
| [Astro Resource Calc](Astro%20Resource%20Calc/README.md) | Recursos | Suma la producción de recursos de todos tus planetas a la vez |
| [Astro Cereal Stats](Astro%20Cereal%20Stats/README.md) | Miembros de la alianza | Genera la evolución de puntos de la alianza en Markdown para Discord |

Cada carpeta tiene su propio `README.md` con el detalle de funcionamiento del script correspondiente.

## Convenciones comunes entre scripts

- **IIFE + `'use strict'`**, con cabecera de metadatos estándar de userscript (`@match`, `@grant none`, `@run-at document-idle`).
- **`@grant none`**: los scripts comparten el documento con la página del juego, pero no necesariamente su scope léxico (`let`/`const` de la página no cuelgan de `window`). Cuando un script necesita datos de la página, prioriza leer el **DOM** (atributos `data-*`, texto de elementos ya renderizados) sobre confiar en variables JS de la página, que pueden no estar accesibles o pueden dar valores inconsistentes entre páginas.
- **Reloj "del servidor"**: para evitar depender del huso horario o reloj del navegador de cada jugador, los scripts que necesitan "la hora actual" leen el reloj que el propio juego pinta en el DOM en vez de fiarse ciegamente de `Date.now()` o de variables JS de la página.
- **Formato de números**: abreviaturas oficiales de Astrogame (K, M, Mr, T, KaT...) con el valor completo disponible en tooltip, siguiendo el mismo estilo visual que las tablas nativas del juego (`resourcesTable`, `tooltip-parent`).