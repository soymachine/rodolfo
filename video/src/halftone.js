// Impresión a dos tintas sobre papel: convierte el lienzo de "densidad" en un semitono azul
// (trama de puntos a 45°) y una tinta roja plana con el grano típico de la serigrafía.
//
// Convención del lienzo de densidad:
//   - gris: cantidad de tinta azul (negro = tinta sólida, blanco = papel)
//   - rojo puro (#ff0000): tinta roja
import { mulberry32 } from './util.js';

export const PAPER = [236, 228, 210];
export const BLUE = [30, 76, 156];
export const RED = [214, 66, 40];
export const CSS = {
  paper: 'rgb(236,228,210)', blue: 'rgb(30,76,156)', red: 'rgb(214,66,40)', black: '#1c1b1a',
};

const CELL = 9;          // tamaño de la trama en píxeles
const ANGLE = Math.PI / 4;
const ANGLE_RED = Math.PI / 12;
const SOFT = 1 / 30;     // suavizado del borde del punto (antialias)

let thr = null, thrR = null, speck = null, out = null, w = 0, h = 0;

export function setupHalftone(width, height) {
  w = width; h = height;
  // cada tinta con su ángulo de trama, como en la imprenta (evita el moiré entre ambas)
  const screen = (angle) => {
    const t = new Uint8Array(w * h);
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = (x * c + y * s) / CELL, v = (-x * s + y * c) / CELL;
        const spot = (Math.cos(2 * Math.PI * u) + Math.cos(2 * Math.PI * v)) / 2; // 1 en el centro del punto
        t[y * w + x] = 14 + Math.round(((1 - spot) / 2) * 227);
      }
    }
    return t;
  };
  thr = screen(ANGLE);
  thrR = screen(ANGLE_RED);
  // grano de la tinta roja: pequeños huecos de papel
  speck = new Uint8Array(w * h);
  const r = mulberry32(7);
  for (let i = 0; i < w * h * 0.012; i++) {
    const x = Math.floor(r() * w), y = Math.floor(r() * h), rad = r() < 0.8 ? 1 : 2;
    for (let dy = 0; dy < rad; dy++) for (let dx = 0; dx < rad; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < w && yy < h) speck[yy * w + xx] = 1;
    }
  }
}

/** Lee el lienzo de densidad y escribe la "impresión" en ctx. */
export function printTo(ctx, densCtx) {
  const src = densCtx.getImageData(0, 0, w, h).data;
  if (!out) out = ctx.createImageData(w, h);
  const dst = out.data;
  const [pr, pg, pb] = PAPER, [br, bg, bb] = BLUE, [rr, rg, rb] = RED;
  for (let i = 0, j = 0; i < w * h; i++, j += 4) {
    const r = src[j], g = src[j + 1], b = src[j + 2];
    const mx = g > b ? g : b;
    let red = r - mx;
    if (red < 0) red = 0;
    // la parte roja cuenta como papel para la tinta azul que hay debajo
    let L = ((g + b) >> 1) + red;
    if (L > 255) L = 255;
    let a = ((255 - L) - thr[i]) * SOFT + 0.5;
    if (a < 0) a = 0; else if (a > 1) a = 1;
    let cr = pr + (br - pr) * a, cg = pg + (bg - pg) * a, cb = pb + (bb - pb) * a;
    if (red > 0) {
      // rojo plano donde es pleno; tramado en puntos donde es parcial
      let ra = red > 235 ? 1 : (red - thrR[i]) * SOFT + 0.5;
      if (ra < 0) ra = 0; else if (ra > 1) ra = 1;
      if (speck[i]) ra *= 0.1;
      cr += (rr - cr) * ra; cg += (rg - cg) * ra; cb += (rb - cb) * ra;
    }
    dst[j] = cr; dst[j + 1] = cg; dst[j + 2] = cb; dst[j + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
}
