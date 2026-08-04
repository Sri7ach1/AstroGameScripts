# Astro ROI

Userscript para [Astrogame](https://play.astrogame.org). Calcula cuántos **días** tardas en recuperar la inversión (ROI) de mejorar una mina de recursos o una investigación de producción al siguiente nivel.

## ¿Qué hace?

Se activa en las páginas de **Recursos** (`.../game/buildings?side=resources`) e **Investigación** (`.../game/research`). Añade un panel con una tabla ordenada de menor a mayor ROI:

- Minas: Metal, Cristal, Sintetizador de Deuterio.
- Investigaciones de producción: Máxima producción de metal/cristal/deuterio (niveles 131/132/133).

Para cada una muestra: nivel actual → siguiente, coste de la mejora, producción extra por día, y días hasta recuperar esa inversión.

## Cómo calcula la producción extra

- **Minas**: fórmula estándar de OGame, `producción(nivel) = C · nivel · 1.1^nivel · k`. Al comparar el ratio entre el nivel actual y el siguiente, las constantes (tipo de recurso, velocidad del servidor, bonos) se cancelan — no hace falta conocerlas, se recalibra solo con tu producción actual.
- **Investigaciones**: bono aditivo plano de +10% por nivel. Se despeja la producción base a partir de tu producción actual y se reaplica con el nivel siguiente.

## Cómo compara costes heterogéneos

El coste de una mejora puede ser Metal + Cristal + Deutério a la vez, y cada recurso vale distinto en el mercado. Se usa una tasa de cambio fija (**4 Metal = 2 Cristal = 1 Deutério**) para poner coste y producción extra en una misma unidad de "valor" comparable, y así calcular los días de forma justa entre mejoras de distintos recursos.

## De dónde saca los datos

- El coste y nivel de cada mina/investigación se lee de variables JS (`buildingData` / `researchData`) que el propio servidor incrusta en `<script>` inline de la página — leídas directamente del DOM, sin volver a pedir la página por red (un Service Worker del juego puede interceptar y cachear ese `fetch`, así que no es fiable).
- La producción actual se lee de los tooltips de recursos de la cabecera (`data-production`), ya que la variable `resourceTable` solo existe en algunas páginas del juego y en otras no.

## Qué no incluye

Los edificios de energía (Planta Solar, Fusión) no están incluidos: su fórmula de producción no viene en los datos públicos de la página.
