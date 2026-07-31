# Astro Cereal Stats

Userscript para [Astrogame](https://play.astrogame.org). Fork/reimplementación de [CerealOgameStats](https://github.com/ouraios/ogame-scripts) adaptado a Astrogame: genera la evolución de puntuación de tu alianza en Markdown listo para pegar en Discord.

## ¿Qué hace?

Se activa en la página de **Miembros de la alianza** (`.../game/alliance/memberList`). Añade un panel con dos botones:

- **Nuevo punto de control**: guarda el estado actual (puntos de cada miembro) como referencia. Es la única acción que sobrescribe ese punto de control.
- **Generar informe**: compara el estado actual contra el último punto de control guardado y genera un bloque de texto Markdown (con colores ANSI para Discord) con la evolución de puntos de cada miembro, ordenado de mayor a menor subida. "Generar informe" solo lee y compara — se puede pulsar tantas veces como se quiera sin perder la referencia.

El informe también destaca automáticamente quién más subió, quién más bajó, quién se unió y quién abandonó la alianza desde el punto de control. Si la tabla es muy larga para el límite de un mensaje de Discord, se trocea en varias partes con botón de copiar cada una.

También añade una columna "Δ Puntos" directamente en la tabla real de miembros del juego, para verla de un vistazo sin generar el informe completo.

## Hora "del servidor"

Al guardar el punto de control y al mostrar la fecha del informe, usa como referencia el reloj que el propio juego pinta en la cabecera (`.servertimeTop`), no la variable JS `window.serverTime` (que puede dar una hora desfasada) ni el reloj del sistema del navegador. Así el punto de control es consistente para cualquier miembro de la alianza, sea cual sea su huso horario.
