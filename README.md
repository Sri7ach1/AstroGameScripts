# AstroGameScripts

Userscript (Tampermonkey/Violentmonkey) para [Astrogame](https://play.astrogame.org), un juego de navegador estilo OGame.

## Script activo

- **[AstroGame Suite](AstroGame%20Suite/README.md)** — instalación única que reúne todas las herramientas (expediciones, ROI, producción, flotas en vuelo, estadísticas de alianza, resaltado, usabilidad) en un solo userscript con un panel de ajustes común.

## Scripts independientes (deprecados)

Los scripts originales, uno por herramienta, se han retirado en favor de AstroGame Suite y se movieron a [`DEPRECATED/`](DEPRECATED/) como referencia histórica. No reciben actualizaciones y no deberían instalarse en un perfil nuevo — instala solo AstroGame Suite.

## Instalación

1. Instala la extensión [Tampermonkey](https://www.tampermonkey.net/) (o [Violentmonkey](https://violentmonkey.github.io/)) en tu navegador.
2. Haz clic en el [enlace raw de AstroGame Suite](https://raw.githubusercontent.com/Sri7ach1/AstroGameScripts/main/AstroGame%20Suite/AstroGame%20Suite.user.js). Tampermonkey detectará el userscript automáticamente y abrirá la pantalla de instalación.
3. Confirma la instalación con **Instalar**.
4. Entra a [Astrogame](https://play.astrogame.org) y navega por el juego; cada módulo se activa solo en la página que le corresponde.

Al actualizar el script en el repositorio, Tampermonkey detecta el cambio en el enlace raw y ofrece actualizarlo automáticamente (según su configuración de "Check for userscript updates").

## Convenciones comunes entre scripts

- **IIFE + `'use strict'`**, con cabecera de metadatos estándar de userscript (`@match`, `@grant none`, `@run-at document-idle`).
- **`@grant none`**: los scripts comparten el documento con la página del juego, pero no necesariamente su scope léxico (`let`/`const` de la página no cuelgan de `window`). Cuando un script necesita datos de la página, prioriza leer el **DOM** (atributos `data-*`, texto de elementos ya renderizados) sobre confiar en variables JS de la página, que pueden no estar accesibles o pueden dar valores inconsistentes entre páginas.
- **Reloj "del servidor"**: para evitar depender del huso horario o reloj del navegador de cada jugador, los scripts que necesitan "la hora actual" leen el reloj que el propio juego pinta en el DOM en vez de fiarse ciegamente de `Date.now()` o de variables JS de la página.
- **Formato de números**: abreviaturas oficiales de Astrogame (K, M, Mr, T, KaT...) con el valor completo disponible en tooltip, siguiendo el mismo estilo visual que las tablas nativas del juego (`resourcesTable`, `tooltip-parent`).