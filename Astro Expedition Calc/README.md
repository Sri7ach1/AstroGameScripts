# Astro Expedition Calc

Userscript (Tampermonkey/Violentmonkey) para [Astrogame](https://play.astrogame.org). Guarda y suma automáticamente el botín de tus expediciones de los últimos 7 días, aunque borres los mensajes del juego.

## ¿Qué hace?

Se activa en la página de **Mensajes** (`.../game/messages`). Añade un panel con una tabla de Metal, Cristal, Deutério y Materia Oscura conseguidos **hoy** y en los **últimos 7 días**.

Cada vez que pulsas "Actualizar":

1. Descarga todos los mensajes de la categoría "Expediciones" (paginando si hace falta).
2. Lee el texto de cada mensaje nuevo y lo compara contra una lista de patrones conocidos (`PATTERNS`) para identificar qué tipo de resultado fue: botín con cifras, combate con botín, hallazgo de naves, o un evento narrativo sin recompensa (tormenta, virus informático, flota perdida, etc.).
3. Guarda cada mensaje ya interpretado en `localStorage`, indexado por su ID, para no tener que volver a descargarlo ni reinterpretarlo.
4. Suma los recursos de los mensajes de los últimos 7 días y purga los más antiguos.

## Por qué guarda en local en vez de sumar sobre la marcha

El juego borra o pagina los mensajes con el tiempo. Guardando cada mensaje ya interpretado (con su resultado, no el texto crudo) en `localStorage`, el histórico de 7 días sobrevive aunque el mensaje original desaparezca del buzón.

## Mensajes "no reconocidos"

Si un mensaje no coincide con ningún patrón conocido, se guarda igualmente (con su texto) mostrando un aviso en el panel y en la consola. Cuando se añade un patrón nuevo al script, en la siguiente carga **reintenta automáticamente** los mensajes guardados como "no reconocidos" contra los patrones actuales — no hace falta volver a descargarlos.

## Hora "del servidor"

Usa la variable de página `window.serverTime` para saber el "ahora" y calcular qué es "hoy" y qué entra en los "últimos 7 días", en vez del reloj del navegador.
