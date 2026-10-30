# Una manzana para la sed — vídeo animado

Vídeo de 69 s en 16:9 (1920×1080, 30 fps) que ilustra la locución
`Locu Una manzana 18_09_11 17_13.m4a`. Está hecho íntegramente con código:

- **Animación**: JavaScript + Canvas 2D. Un único diorama 2.5D (valle → cementerio → fosa)
  recorrido por una cámara continua. Todo el dibujo es función pura del tiempo, así que cada
  fotograma es reproducible.
- **Estética de cartel serigráfico** (referencia: cartel japonés «SALMON», 1980): papel crema y
  dos tintas. La escena se dibuja primero como un mapa de densidad de tinta y una pasada de
  semitono (`src/halftone.js`) la convierte en trama de puntos azul a 45° (siluetas con el
  lomo en tinta plena y el «vientre» tramado) y rojo plano con grano, tramado a 15° donde es
  parcial. Rojo sólo para lo esencial: el gran sol, la manzana, la boina, las cruces y las
  palabras clave.
- **Tipografía** (`src/type.js`): Inter Tight. Palabras clave gigantes en rojo que cruzan la
  ilustración al pronunciarse, numerales negros apilados (capítulo / total), rótulo vertical con
  el capítulo y subtítulos en bloque alineado a la derecha.
- **Música y efectos**: Web Audio (`OfflineAudioContext`), sin muestras de audio externas.
- **Render**: Playwright dibuja cada fotograma en Chromium y FFmpeg lo codifica en H.264;
  después mezcla la locución (comprimida, con ducking de la música) y normaliza a −16 LUFS.

El resultado está en [`../una-manzana-para-la-sed.mp4`](../una-manzana-para-la-sed.mp4).

## Versión de tipografía cinética

[`../una-manzana-para-la-sed-tipografico.mp4`](../una-manzana-para-la-sed-tipografico.mp4) cuenta la
misma locución sólo con letras, partículas y algunas formas vectoriales, con la paleta del cartel
(papel `#ECE4D2`, azul `#1E4C9C`, rojo `#D6422A`, negro `#1C1B1A`). Cada una de las 25 frases tiene su
propia escena y cada palabra entra cuando se pronuncia; entre escenas hay transiciones de trama de
puntos, círculos, franjas, barridos en diagonal y empujes de cámara, y la imagen se sacude con los
golpes de la banda sonora. Algunos momentos: «AMÉN» cae como una campanada con ondas; «SILENCIO» se
estira hasta los bordes y se queda en contorno; cuatro barras rojas al ritmo de los timbales;
«PASADO» se precipita letra a letra en la fosa, que después lo traga todo; «GENOVEVA» baraja letras
antes de fijarse y «ARROJAR» lanza un puñado de granos (con los mismos tiempos que el sonido de la
tierra); «EVA» se desintegra; huellas rojas a cada paso; «UNO TRAS OTRO» marcha a golpes; las
palabras se dan la mano; «VOLVÍAN LA CABEZA» gira y la cámara barre hasta un campo de cruces; la
boina cae sobre «BOINA»; «ENSALZADOS» se eleva letra a letra; «FIESTA» estalla en confeti y, al
callar el vals, cae la manzana. El código está en `src/kinetic.js`:

```bash
node render.mjs --scene tipo
```

En el navegador: `video/index.html?scene=tipo`.

## Sincronización

Los tiempos de cada palabra (`src/words.js`) se obtuvieron transcribiendo la locución con
Whisper (marcas de tiempo por palabra) y se ajustaron con `silencedetect` de FFmpeg. La voz
entra a los 3 s del vídeo. Cada acción se ancla a una palabra con `cue('palabra')`:

| Palabra | Lo que ocurre |
| --- | --- |
| «amén» | el cura bendice; suena la campana del pueblo; «AMÉN» en rojo |
| «silencio … valle» | ondas que se extienden por el valle; los pájaros dejan de batir las alas; la música se apaga |
| «Cuatro hombres» | numerales I–IV y un golpe de timbal por cada hombre; se tienden las cuerdas |
| «levantaron el ataúd» / «cabos de soga» | el ataúd se eleva; las sogas vibran |
| «retiraron los travesaños» | dos hombres sacan los travesaños (golpes de madera) |
| «el pasado se hundió en la fosa» | el ataúd baja con las letras «el pasado»; golpe grave al tocar fondo |
| «arrojar el primer puñado de tierra» | Genoveva coge tierra y la lanza; cada grano suena al caer |
| «Eva se desvaneció» | Eva se deshace en motas que arrastra el viento |
| «el chico se quedó solo» | plano general, todos desaparecen salvo él |
| «mirando los pies» | cámara a ras de suelo; pasos sincronizados |
| «un puñado de tierra sobre el féretro» | cada doliente arroja su puñado |
| «disciplinadamente» | marcha a golpes: paso–pausa, todos a la vez, a tempo de la música |
| «estrechar la mano» | apretones simultáneos en cada pausa |
| «volvían la cabeza … cementerio» | giran todas las cabezas y la cámara barre hasta el extremo del cementerio |
| «la sobrina con la boina» | boina roja y el tema de la manzana |
| «se santiguaban» | cruces rojas trazadas en el aire |
| «ensalzados … difuntos» | cae la noche; los dolientes se elevan y se convierten en lápidas |
| «la fiesta» | papel picado, farolillos, velas, confeti y un vals irónico |
| final | la manzana cae sobre la tumba |

## Uso

Requisitos: Node 18+, FFmpeg y Playwright con Chromium (`npm install` + `npx playwright install chromium`).

```bash
npm run render
```

Fotogramas sueltos para revisar (se guardan en `build/stills/`):

```bash
node render.mjs --stills 5,22.6,46.4
```

Un tramo con audio (en `build/preview.mp4`):

```bash
node render.mjs --from 40 --to 50
```

Previsualización interactiva en el navegador (con voz y música en tiempo real): sirve la raíz
del repositorio con cualquier servidor estático y abre `video/index.html`, por ejemplo:

```bash
npx serve .. -l 8080
```

## Estructura

- `src/words.js` — tiempos de cada palabra de la locución.
- `src/timeline.js` — duración, subtítulos y coreografía compartida por imagen y sonido
  (procesión, puñados de tierra, caída de la manzana).
- `src/scene.js` — cámara, mundo, personajes, efectos, subtítulos y títulos.
- `src/figures.js` — siluetas articuladas (andar, brazos, cabeza, sombreros).
- `src/music.js` — partitura y síntesis (cuerdas, campanas, celesta, timbales, acordeón, efectos).
- `render.mjs` — render con Playwright + FFmpeg.
- `src/halftone.js` — impresión a dos tintas (semitono azul + rojo).
- `src/type.js` — palabras clave, columna de capítulo, subtítulos y título.
- `src/kinetic.js` — versión de tipografía cinética (escenas, transiciones, partículas).
- `fonts/` — Inter Tight (SIL Open Font License).
