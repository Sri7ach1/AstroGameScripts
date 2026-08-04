# Astro Resource Calc

Userscript para [Astrogame](https://play.astrogame.org). Suma la producción de recursos de **todos tus planetas** a la vez, en la vista donde el juego solo te muestra un planeta cada vez.

## ¿Qué hace?

Se activa en la página de **Recursos** (`.../game/feedstock`). Añade un panel con un botón "Calcular" que muestra una tabla con la producción total de la cuenta (Metal, Cristal, Deutério) por hora, día, semana y mes, sumando todos tus planetas.

La Energía no se incluye: es un balance instantáneo (no se acumula con el tiempo), así que sumarla entre planetas no tendría sentido.

## Cómo obtiene los datos de cada planeta

1. Lee la lista de tus planetas directamente del panel lateral del juego (excluye las lunas automáticamente).
2. Para cada planeta, pide por red (`fetch`) su página de recursos individual y extrae la tabla de producción de la respuesta.
3. Suma los valores de todos los planetas y los muestra formateados con las abreviaturas oficiales del juego (K, M, Mr, T...).
