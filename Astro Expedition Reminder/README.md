# Astro Expedition Reminder

Userscript para [Astrogame](https://play.astrogame.org). Aviso flotante muy simple: te avisa si no tienes ninguna expedición volando ahora mismo, para no dejar naves paradas sin explorar.

## ¿Qué hace?

Se activa en **cualquier página del juego** (`.../game/*`). Al cargar, comprueba si tienes alguna flota propia en misión de expedición activa. Si no tienes ninguna, muestra un banner flotante en la esquina superior derecha con un enlace directo a la Base de la Flota, cerrable con la ✕.

## Cómo detecta las expediciones activas

Lee la variable `activeFleetActs` que el propio juego declara en la página (con `const`, en el `<head>`). Como esa variable no cuelga de `window`, el script la referencia directamente por su nombre (posible gracias a `@grant none`, que comparte el documento con la página) en vez de acceder a `window.activeFleetActs`, que siempre daría `undefined`.

Si esa variable no existe en la página actual (por ejemplo, aún no ha cargado), el script simplemente no hace nada — no fuerza ningún aviso falso.
