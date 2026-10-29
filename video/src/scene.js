// "Una manzana para la sed" — escena animada en canvas.
// Un único diorama 2.5D (valle → cementerio → fosa) recorrido por una cámara continua.
// Todo es función pura del tiempo T: draw(ctx, T) produce siempre el mismo fotograma.

import {
  clamp, lerp, invLerp, smooth, ramp, win, easeInOut, easeOut, easeIn, easeOutBack,
  mulberry32, noise1, lerpColor, rgba, keyframes, hash,
} from './util.js';
import {
  W, H, DURATION, cue, cueEnd, phrases, PROC, procX, marchPause, GRAINS, THROWS,
  GRAVITY, COFFIN, LID_REST_H, APPLE_FALL, APPLE_LAND, APPLE_BOUNCE,
} from './timeline.js';
import { drawPerson, computePose } from './figures.js';
import { setupHalftone, printTo, CSS } from './halftone.js';
import { drawType, drawTitle, SANS } from './type.js';

// En el lienzo de densidad, el rojo puro significa "tinta roja".
const RED = '#ff0000';
const FONT = SANS;

// ---------------------------------------------------------------------------
// Cámara: claves (x, y del centro de pantalla en unidades de mundo; z = zoom)
const C = (t, x, y, z, ease) => ({ t, x, y, z, ease });
const CAM_KEYS = [
  C(0.0, -208, -297, 2.85),
  C(2.9, -196, -290, 2.62),
  C(5.3, -250, -140, 1.3),
  C(5.9, -245, -142, 1.24),
  C(8.0, 380, -300, 0.5),
  C(8.35, 380, -300, 0.5),
  C(9.6, 0, -105, 1.32),
  C(13.2, 0, -95, 1.44),
  C(16.0, 0, -80, 1.36),
  C(18.9, 0, 40, 2.05),
  C(19.7, 0, 35, 2.0),
  C(20.9, -170, -75, 1.55),
  C(25.4, -120, -60, 1.7),
  C(26.4, 280, -80, 1.62),
  C(28.3, 280, -70, 1.75),
  C(29.3, 150, -220, 0.62),
  C(31.6, 180, -150, 0.82),
  C(32.4, -230, -30, 2.55),
  C(34.7, -120, -30, 2.45),
  C(35.6, 30, -80, 1.42),
  C(38.9, 60, -80, 1.48),
  C(40.6, 440, -120, 1.0),
  C(44.2, 580, -110, 1.05),
  C(45.0, 790, -110, 1.38),
  C(48.6, 820, -110, 1.42),
  C(49.3, 2050, -150, 1.02, easeOut),
  C(51.6, 2120, -150, 1.06),
  C(52.3, 1060, -120, 1.9),
  C(53.9, 1070, -122, 1.95),
  C(54.4, 1380, -110, 1.0),
  C(55.2, 1400, -110, 0.98),
  C(57.9, 1600, -190, 0.78),
  C(62.1, 1880, -160, 0.9),
  C(63.0, 1250, -260, 0.62),
  C(64.6, 1200, -260, 0.6),
  C(66.2, 20, -100, 1.45),
  C(69.0, 10, -60, 1.85),
];

export function camera(T) {
  const c = keyframes(CAM_KEYS, T, ['x', 'y', 'z']);
  // leve respiración de cámara en mano
  c.x += noise1(T * 0.35 + 3) * 6 / c.z;
  c.y += noise1(T * 0.31 + 17) * 4 / c.z;
  return c;
}

// ---------------------------------------------------------------------------
// Proyección 2.5D. z = profundidad en el suelo (0 fondo … 400 frente), h = altura (− arriba).
let cam = { x: 0, y: 0, z: 1 };
const depthK = (z) => 0.9 + z * 0.0012;
/** Inclinación de la vista: cuánto sube en pantalla cada unidad de profundidad. */
const GY = 1.3;
function P(x, z, h = 0) {
  const k = depthK(z);
  return [W / 2 + (x - cam.x) * cam.z * k, H / 2 + (z * GY + h * k - cam.y) * cam.z, cam.z * k];
}
/** Transforma el contexto para dibujar en coordenadas locales de un objeto apoyado en (x,z). */
function atGround(ctx, x, z, h = 0, facing = 1) {
  const [sx, sy, s] = P(x, z, h);
  ctx.setTransform(s * facing, 0, 0, s, sx, sy);
}
/** Capas de fondo con parallax p (0 = infinito, 1 = plano principal). */
function layerT(ctx, p) {
  const zl = 1 + (cam.z - 1) * p;
  ctx.setTransform(zl, 0, 0, zl, W / 2 - cam.x * p * zl, H / 2 - cam.y * p * zl);
  return zl;
}
const reset = (ctx) => ctx.setTransform(1, 0, 0, 1, 0, 0);

// ---------------------------------------------------------------------------
// Paleta: día → atardecer → noche
// (valores en gris = cantidad de tinta azul en la trama: blanco = papel, negro = tinta plena)
const DAY = {
  skyTop: '#ececec', skyBot: '#ffffff', m0: '#dcdcdc', m1: '#c8c8c8', m2: '#b0b0b0', m3: '#989898',
  wall: '#ffffff', wallShade: '#d8d8d8', g0: '#f6f6f6', g1: '#d6d6d6', soil: '#585858', ink: '#000000',
  cyp: '#000000', paper: '#ffffff', mist: '#ffffff',
};
const DUSK = {
  skyTop: '#a8a8a8', skyBot: '#ebebeb', m0: '#bcbcbc', m1: '#a4a4a4', m2: '#8c8c8c', m3: '#747474',
  wall: '#e2e2e2', wallShade: '#b4b4b4', g0: '#cfcfcf', g1: '#adadad', soil: '#404040', ink: '#000000',
  cyp: '#000000', paper: '#ffffff', mist: '#ececec',
};
const NIGHT = {
  skyTop: '#1c1c1c', skyBot: '#4c4c4c', m0: '#5a5a5a', m1: '#4c4c4c', m2: '#3e3e3e', m3: '#323232',
  wall: '#9a9a9a', wallShade: '#747474', g0: '#868686', g1: '#727272', soil: '#1a1a1a', ink: '#000000',
  cyp: '#000000', paper: '#ffffff', mist: '#5c5c5c',
};
function palette(T) {
  const dusk = ramp(T, 40, 57) * 0.35 + win(T, 57.9, 59.6, 59.6, 61.4) * 0.65;
  const night = ramp(T, 59.4, 62.2) * (1 - 0.0);
  const out = {};
  for (const k in DAY) {
    const a = lerpColor(DAY[k], DUSK[k], clamp(dusk));
    out[k] = lerpColor(a, NIGHT[k], night);
  }
  out.night = night;
  out.dusk = dusk;
  return out;
}
let pal = DAY;

// ---------------------------------------------------------------------------
// Recursos pre-generados (deterministas)
const R = mulberry32(20110918);

const MOUNTAINS = [0, 1, 2, 3].map((i) => {
  const p = [0.1, 0.2, 0.33, 0.5][i];
  const base = [-330, -270, -215, -150][i];
  const amp = [150, 120, 90, 60][i];
  const seed = R() * 100;
  return { p, base, amp, seed, key: 'm' + i };
});
function ridge(m, x) {
  const s = m.seed;
  return m.base
    - m.amp * (0.55 * Math.sin(x * 0.0011 + s) + 0.3 * Math.sin(x * 0.0027 + s * 2.1) + 0.15 * Math.sin(x * 0.0071 + s * 3.7))
    - m.amp * 0.12 * noise1(x * 0.02 + s);
}
const HOUSES = Array.from({ length: 16 }, (_, i) => {
  const x = -620 + Math.pow(R(), 0.8) * 520;
  return { x, w: 16 + R() * 14, h: 10 + R() * 9, dy: R() * 34, tower: i === 7 };
}).sort((a, b) => a.dy - b.dy);
const CYPRESSES = [-1380, -1010, -290, 380, 860, 1420, 1720, 2060, 2480, 2840, 3150].map((x, i) => ({
  x, h: 330 + hash(i * 7.3) * 220, w: 46 + hash(i * 3.1) * 22, z: -95 - hash(i) * 30,
}));
const GROUND_MARKS = Array.from({ length: 1700 }, () => ({
  x: -2600 + R() * 6200, z: -35 + Math.pow(R(), 1.3) * 760, t: R(), s: 0.6 + R() * 0.9,
})).sort((a, b) => a.z - b.z);
const OLIVES = Array.from({ length: 26 }, (_, i) => ({ x: -2500 + i * 240 + R() * 120, z: 560 + R() * 160, s: 0.7 + R() * 0.5 }));
const BIRDS = Array.from({ length: 7 }, (_, i) => ({ x: -500 + i * 60 + R() * 50, y: -560 - R() * 120, ph: R(), sp: 0.9 + R() * 0.3 }));
const STARS = Array.from({ length: 220 }, () => ({ x: R(), y: Math.pow(R(), 1.6) * 0.62, s: R(), tw: R() * 6 }));

// Árbol del manzano (coordenadas locales: base del tronco en 0,0)
const TREE = (() => {
  const r = mulberry32(77);
  const segs = [];
  const leaves = [];
  function branch(x, y, ang, len, w, depth) {
    const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
    const mx = (x + x2) / 2 + (r() - 0.5) * len * 0.25, my = (y + y2) / 2 + (r() - 0.5) * len * 0.2;
    segs.push({ x, y, mx, my, x2, y2, w, w2: w * 0.68, depth });
    if (depth > 5 || len < 18) {
      for (let i = 0; i < 5; i++) leaves.push({ x: x2 + (r() - 0.5) * 40, y: y2 + (r() - 0.5) * 34, r: 7 + r() * 9, a: r() * 3, d: depth + r() });
      return;
    }
    const n = depth < 2 ? 2 : 2 + (r() < 0.35 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const spread = 0.42 + r() * 0.3;
      const a = ang + (i - (n - 1) / 2) * spread * 1.4 + (r() - 0.5) * 0.3;
      branch(x2, y2, a, len * (0.68 + r() * 0.16), w * 0.68, depth + 1);
    }
  }
  segs.push({ x: 0, y: 0, mx: -12, my: -110, x2: 8, y2: -230, w: 42, w2: 30, depth: 0 });
  branch(8, -230, -0.55, 120, 28, 1);
  branch(8, -230, 0.15, 135, 27, 1);
  // rama larga que se tiende sobre la tumba y sostiene la manzana
  const pts = [[8, -230], [150, -330], [320, -385], [470, -410], [560, -420]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [x2, y2] = pts[i + 1];
    segs.push({ x, y, mx: (x + x2) / 2, my: (y + y2) / 2 - 12, x2, y2, w: 22 - i * 4.5, w2: 22 - (i + 1) * 4.5, depth: 1 + i });
    if (i > 0) for (let k = 0; k < 7; k++) leaves.push({ x: x2 + (r() - 0.5) * 60, y: y2 - 10 + (r() - 0.5) * 36, r: 7 + r() * 8, a: r() * 3, d: 4 });
  }
  return { segs, leaves, apple: [566, -380] };
})();
const TREE_X = -640, TREE_Z = -10;

// Cementerio: tumbas existentes al fondo
const GRAVES = (() => {
  const r = mulberry32(5);
  const g = [];
  for (let i = 0; i < 16; i++) g.push({ x: 1380 + i * 105 + r() * 30, z: -18, type: r() < 0.5 ? 'cross' : 'stele', s: 0.8 + r() * 0.35 });
  for (let i = 0; i < 12; i++) g.push({ x: 1450 + i * 140 + r() * 40, z: 118 + r() * 20, type: r() < 0.4 ? 'cross' : 'stele', s: 0.9 + r() * 0.3 });
  return g;
})();

// Personas: definiciones fijas
const ROPE_MEN = [
  { x: -222, z: 104, f: 1, hat: 'cap' },
  { x: -168, z: 116, f: 1, hat: 'none' },
  { x: 170, z: 104, f: -1, hat: 'cap' },
  { x: 224, z: 116, f: -1, hat: 'none' },
];
const FAMILY_Z = 64;
const HS_GAP = 160; // distancia doliente → familiar durante el apretón de manos
const FAMILY = [
  { kind: 'woman', hat: 'mantilla', H: 290 },  // Genoveva
  { kind: 'man', hat: 'cap', H: 305 },
  { kind: 'woman', hat: 'mantilla', H: 280 },
  { kind: 'oldman', hat: 'none', H: 290 },
  { kind: 'woman', hat: 'beret', H: 262, niece: true },
].map((f, j) => ({ ...f, x: 440 + HS_GAP + 110 * j }));
const MOURNER_STYLE = Array.from({ length: PROC.n }, (_, i) => ({
  kind: i % 3 === 1 ? 'woman' : 'man',
  hat: i % 3 === 1 ? 'mantilla' : (i % 2 ? 'cap' : 'none'),
  H: PROC.heights[i],
}));

// Textura de papel (se genera una vez)
let paperTex = null;
function makePaper() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, W, H);
  const r = mulberry32(42);
  // manchas de baja frecuencia
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, rad = 40 + r() * 220;
    const v = r() < 0.5 ? 0 : 255;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${v},${v},${v},${0.025 + r() * 0.03})`);
    gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibras
  g.lineCap = 'round';
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = r() * H, l = 6 + r() * 28, a = r() * Math.PI;
    const v = r() < 0.5 ? 70 : 200;
    g.strokeStyle = `rgba(${v},${v},${v},${0.08 + r() * 0.1})`;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 6, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 6, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // grano suave (a baja resolución y escalado → menos peso en el vídeo)
  const s = document.createElement('canvas');
  s.width = W / 3; s.height = H / 3;
  const sg = s.getContext('2d');
  const id = sg.createImageData(s.width, s.height);
  for (let i = 0; i < id.data.length; i += 4) {
    const v = 128 + (r() - 0.5) * 34;
    id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
    id.data[i + 3] = 255;
  }
  sg.putImageData(id, 0, 0);
  g.globalAlpha = 0.45;
  g.globalCompositeOperation = 'overlay';
  g.imageSmoothingEnabled = true;
  g.drawImage(s, 0, 0, W, H);
  return c;
}

// Partículas de Eva (muestreadas de su silueta la primera vez)
let evaPts = null;
function sampleEva() {
  const c = document.createElement('canvas');
  c.width = 220; c.height = 340;
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 110, 325);
  drawPerson(g, evaPose(0));
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  const r = mulberry32(9);
  const step = 3;
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      if (d[(y * c.width + x) * 4 + 3] > 120) {
        pts.push({ x: x - 110, y: y - 325, r1: r(), r2: r(), r3: r() });
      }
    }
  }
  return pts;
}
const evaPose = () => ({ kind: 'woman', hat: 'mantilla', bow: 0.25, headTurn: 1, armF: { sh: 0.25, el: 0.5 } });

// Lienzo auxiliar para dibujar figuras con transparencia sin solapes visibles
let scratch = null;

// ---------------------------------------------------------------------------
let dens = null, densCtx = null;
export function init() {
  dens = document.createElement('canvas');
  dens.width = W; dens.height = H;
  densCtx = dens.getContext('2d', { willReadFrequently: true });
  setupHalftone(W, H);
  paperTex = makePaper();
  evaPts = sampleEva();
  scratch = document.createElement('canvas');
  scratch.width = 900; scratch.height = 1200;
}

/**
 * Dibuja una persona en (x,z). Se pinta en un lienzo auxiliar para poder modelarla como
 * el salmón del cartel: tinta plena en el lomo (arriba y detrás) y trama cada vez más
 * abierta hacia el "vientre" (abajo y delante); y para aplicar transparencia sin solapes.
 */
function person(ctx, x, z, o, alpha = 1, h = 0) {
  alpha *= introFigures;
  if (alpha <= 0.003) return null;
  if (!o.ink) o = { ...o, ink: lerpColor(pal.ink, pal.m2, clamp((112 - z) / 112) * 0.22) };
  const facing = o.f || 1;
  const Hh = o.H || 300;
  const [sx, sy, s] = P(x, z, h);
  const sc = s * Hh / 300;
  if (sx < -300 * sc || sx > W + 300 * sc || sy < -50 || sy - 360 * sc > H) return null;
  const bw = Math.ceil(300 * sc), bh = Math.ceil(400 * sc);
  if (bw > scratch.width || bh > scratch.height) { scratch.width = Math.max(bw, scratch.width); scratch.height = Math.max(bh, scratch.height); }
  const g = scratch.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, bw + 2, bh + 2);
  const footY = bh - 20 * sc;
  g.setTransform(sc * facing, 0, 0, sc, bw / 2, footY);
  drawPerson(g, o);
  // modelado: degradado de luz recortado a la silueta
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  const top = footY - 330 * sc;
  const lv = g.createLinearGradient(0, top, 0, footY);
  lv.addColorStop(0, 'rgba(255,255,255,0)');
  lv.addColorStop(0.3, 'rgba(255,255,255,0.04)');
  lv.addColorStop(0.62, 'rgba(255,255,255,0.42)');
  lv.addColorStop(0.8, 'rgba(255,255,255,0.3)');
  lv.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = lv;
  g.fillRect(0, 0, bw, bh);
  const front = bw / 2 + facing * 40 * sc, back = bw / 2 - facing * 40 * sc;
  const lh = g.createLinearGradient(back, 0, front, 0);
  lh.addColorStop(0, 'rgba(255,255,255,0)');
  lh.addColorStop(1, 'rgba(255,255,255,0.22)');
  g.fillStyle = lh;
  g.fillRect(0, 0, bw, footY - 120 * sc);
  g.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch, 0, 0, bw, bh, sx - bw / 2, sy - footY, bw, bh);
  ctx.restore();
  return true;
}
let introFigures = 1;
/** Posición en mundo (x, h) de la mano delantera de una figura situada en (x,z). */
function handWorld(x, z, o) {
  const p = computePose(o);
  const k = depthK(z) * (o.H || 300) / 300;
  const f = o.f || 1;
  return { x: x + p.armF.hand[0] * k * f / depthK(z) * depthK(z), h: p.armF.hand[1] * k, z };
}

// ---------------------------------------------------------------------------
export function draw(ctx, T) {
  cam = camera(T);
  pal = palette(T);
  introFigures = ramp(T, 2.7, 3.9);
  // 1) escena en el lienzo de densidad de tinta
  const d = densCtx;
  reset(d);
  d.globalAlpha = 1;
  d.globalCompositeOperation = 'source-over';
  drawSky(d, T);
  drawMountains(d, T);
  drawBirds(d, T);
  drawCypresses(d, T);
  drawWall(d, T);
  drawGround(d, T);
  drawRipples(d, T);
  drawTree(d, T);
  drawWorld(d, T);
  drawFiesta(d, T);
  drawApple(d, T);
  drawGlows(d, T);
  drawVignette(d, T);
  // 2) impresión a dos tintas (semitono azul + rojo)
  reset(ctx);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  printTo(ctx, d);
  drawPost(ctx, T);
  // 3) tipografía
  drawType(ctx, T, pal.night);
  drawFade(ctx, T);
  drawTitle(ctx, T);
}

// ---------------------------------------------------------------------------
// El gran círculo rojo del cartel: un sol que preside el valle y se pone con «algún día».
const SUN_KEYS = [
  { t: 0, x: -303, y: -207, r: 160 },
  { t: 2.9, x: -303, y: -215, r: 160 },
  { t: 5.6, x: -320, y: -330, r: 165 },
  { t: 57.6, x: -150, y: -350, r: 165 },
  { t: 61.2, x: -60, y: -60, r: 170 },
];
function drawSky(ctx, T) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(0.7, pal.skyBot);
  g.addColorStop(1, pal.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const sun = keyframes(SUN_KEYS, T, ['x', 'y', 'r']);
  if (T < 61.3) {
    layerT(ctx, 0.05);
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.arc(sun.x, sun.y, sun.r, 0, Math.PI * 2); ctx.fill();
    reset(ctx);
  }
  // estrellas y luna (papel que asoma en el cielo nocturno)
  const n = pal.night;
  if (n > 0.02) {
    for (const st of STARS) {
      const tw = 0.6 + 0.4 * Math.sin(T * 2 + st.tw);
      ctx.fillStyle = `rgba(255,255,255,${n * tw * (0.5 + st.s * 0.5)})`;
      const px = ((st.x * W * 1.3 - cam.x * 0.03) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
      const sz = 2 + st.s * 2.5;
      ctx.fillRect(px, st.y * H, sz, sz);
    }
    layerT(ctx, 0.05);
    const mx = 420, my = lerp(-200, -600, ramp(T, 59.5, 64));
    ctx.fillStyle = `rgba(255,255,255,${n})`;
    ctx.beginPath(); ctx.arc(mx, my, 70, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.skyTop;
    ctx.beginPath(); ctx.arc(mx + 30, my - 14, 62, 0, Math.PI * 2); ctx.fill();
    reset(ctx);
  }
}

function drawMountains(ctx, T) {
  for (const m of MOUNTAINS) {
    const zl = layerT(ctx, m.p);
    const x0 = cam.x * m.p - (W / 2) / zl - 40, x1 = cam.x * m.p + (W / 2) / zl + 40;
    const mg0 = ctx.createLinearGradient(0, m.base - m.amp * 1.1, 0, m.base + 160);
    mg0.addColorStop(0, pal[m.key]);
    mg0.addColorStop(1, lerpColor(pal[m.key], pal.skyBot, 0.65));
    ctx.fillStyle = mg0;
    ctx.beginPath();
    ctx.moveTo(x0, 3000);
    for (let x = x0; x <= x1 + 12; x += 12) ctx.lineTo(x, ridge(m, x));
    ctx.lineTo(x1 + 12, 3000);
    ctx.closePath();
    ctx.fill();
    // pueblo en la ladera cercana
    if (m.p === 0.33) {
      for (const h of HOUSES) {
        const by = ridge(m, h.x) + 22 + h.dy;
        ctx.fillStyle = lerpColor(pal.wall, pal.m2, 0.25);
        ctx.fillRect(h.x, by - h.h, h.w, h.h + 8);
        ctx.fillStyle = pal.m3;
        ctx.beginPath();
        ctx.moveTo(h.x - 3, by - h.h);
        ctx.lineTo(h.x + h.w / 2, by - h.h - 9);
        ctx.lineTo(h.x + h.w + 3, by - h.h);
        ctx.fill();
        ctx.fillRect(h.x + h.w * 0.3, by - h.h * 0.55, 4, 5);
        if (h.tower) {
          ctx.fillStyle = lerpColor(pal.wall, pal.m2, 0.25);
          ctx.fillRect(h.x + h.w + 2, by - h.h - 46, 16, 46 + h.h);
          ctx.fillStyle = pal.m3;
          ctx.beginPath();
          ctx.moveTo(h.x + h.w, by - h.h - 46);
          ctx.lineTo(h.x + h.w + 10, by - h.h - 64);
          ctx.lineTo(h.x + h.w + 20, by - h.h - 46);
          ctx.fill();
          // campana que oscila con el "amén"
          const sw = Math.sin((T - cue('amén')) * 7) * Math.exp(-Math.max(0, T - cue('amén')) * 0.6) * (T > cue('amén') ? 0.5 : 0);
          ctx.save();
          ctx.translate(h.x + h.w + 10, by - h.h - 40);
          ctx.rotate(sw);
          ctx.fillRect(-3, 0, 6, 9);
          ctx.restore();
          if (pal.night > 0.3) {
            ctx.fillStyle = rgba('#ffffff', pal.night * 0.9);
            ctx.fillRect(h.x + h.w * 0.3, by - h.h * 0.55, 4, 5);
          }
        }
        if (pal.night > 0.3 && hash(h.x) > 0.4) {
          ctx.fillStyle = rgba('#ffffff', pal.night * 0.9);
          ctx.fillRect(h.x + h.w * 0.3, by - h.h * 0.55, 4, 5);
        }
      }
    }
    // bruma en la base de cada capa
    const gy = m.base + 40;
    const mg = ctx.createLinearGradient(0, gy - 90, 0, gy + 60);
    mg.addColorStop(0, rgba(pal.mist, 0));
    mg.addColorStop(1, rgba(pal.mist, 0.55));
    ctx.fillStyle = mg;
    ctx.fillRect(x0, gy - 90, x1 - x0, 400);
  }
  reset(ctx);
}

function drawBirds(ctx, T) {
  // vuelan hasta que se extiende el silencio: entonces planean y se desvanecen
  const t0 = cue('silencio');
  const a = 1 - ramp(T, t0 + 0.4, t0 + 2.4);
  if (a <= 0 || T < 2) return;
  const zl = layerT(ctx, 0.42);
  ctx.strokeStyle = rgba(pal.ink, 0.7 * a);
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (const b of BIRDS) {
    const x = b.x + (T - 2) * 70 * b.sp;
    const y = b.y + Math.sin(T * 0.8 + b.ph * 6) * 10;
    const still = ramp(T, t0, t0 + 0.8);
    const flap = Math.sin(T * 9 * b.sp + b.ph * 6) * (1 - still) + 0.25 * still;
    const s = 9;
    ctx.beginPath();
    ctx.moveTo(x - s, y - flap * s * 0.8);
    ctx.quadraticCurveTo(x - s * 0.4, y - 2, x, y + 1.5);
    ctx.quadraticCurveTo(x + s * 0.4, y - 2, x + s, y - flap * s * 0.8);
    ctx.stroke();
  }
  reset(ctx);
}

function drawCypresses(ctx, T) {
  for (const c of CYPRESSES) {
    const [sx, sy, s] = P(c.x, c.z);
    if (sx < -200 || sx > W + 200) continue;
    ctx.setTransform(s, 0, 0, s, sx, sy);
    const sway = Math.sin(T * 0.9 + c.x) * 4;
    ctx.fillStyle = pal.cyp;
    ctx.beginPath();
    ctx.moveTo(-c.w * 0.18, 0);
    ctx.bezierCurveTo(-c.w * 0.7, -c.h * 0.35, -c.w * 0.45, -c.h * 0.75, sway, -c.h);
    ctx.bezierCurveTo(c.w * 0.45 + sway * 0.5, -c.h * 0.75, c.w * 0.7, -c.h * 0.35, c.w * 0.18, 0);
    ctx.closePath();
    ctx.fill();
  }
  reset(ctx);
}

const WALL_Z = -40, WALL_H = 170, WALL_X0 = -1800, WALL_X1 = 3500;
function drawWall(ctx, T) {
  const [x0, yb] = P(WALL_X0, WALL_Z, 0);
  const [x1, yt] = P(WALL_X1, WALL_Z, -WALL_H);
  const s = P(0, WALL_Z)[2];
  ctx.fillStyle = pal.wall;
  ctx.fillRect(x0, yt, x1 - x0, yb - yt + 2);
  // sombra inferior
  const g = ctx.createLinearGradient(0, yt, 0, yb);
  g.addColorStop(0, rgba(pal.wallShade, 0));
  g.addColorStop(1, rgba(pal.wallShade, 0.9));
  ctx.fillStyle = g;
  ctx.fillRect(x0, yt, x1 - x0, yb - yt + 2);
  // albardilla de teja
  ctx.fillStyle = pal.ink;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x0, yt - 10 * s, x1 - x0, 12 * s);
  ctx.globalAlpha = 0.5;
  for (let x = WALL_X0; x < WALL_X1; x += 38) {
    const [tx, ty] = P(x, WALL_Z, -WALL_H);
    if (tx < -50 || tx > W + 50) continue;
    ctx.beginPath();
    ctx.arc(tx, ty + 2 * s, 10 * s, 0, Math.PI);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // nichos en el extremo del cementerio
  for (let col = 0; col < 18; col++) {
    for (let row = 0; row < 3; row++) {
      const nx = 1560 + col * 82, nh = -28 - row * 46;
      const [px, py, ps] = P(nx, WALL_Z, nh);
      if (px < -100 || px > W + 100) continue;
      ctx.strokeStyle = rgba(pal.ink, 0.55);
      ctx.lineWidth = 1.6 * ps;
      ctx.strokeRect(px, py - 38 * ps, 70 * ps, 38 * ps);
      ctx.fillStyle = rgba(pal.ink, 0.12);
      ctx.fillRect(px + 4 * ps, py - 34 * ps, 62 * ps, 30 * ps);
      ctx.fillStyle = rgba(pal.ink, 0.45);
      ctx.fillRect(px + 22 * ps, py - 24 * ps, 26 * ps, 2 * ps);
      ctx.fillRect(px + 26 * ps, py - 18 * ps, 18 * ps, 2 * ps);
    }
  }
  // grietas a tinta
  ctx.strokeStyle = rgba(pal.ink, 0.25);
  ctx.lineWidth = 1.2 * s;
  for (let i = 0; i < 26; i++) {
    const wx = WALL_X0 + 120 + i * 210 + hash(i) * 80;
    if (wx > 1500 && wx < 3060) continue;
    const [px, py] = P(wx, WALL_Z, -20 - hash(i + 3) * 120);
    if (px < -50 || px > W + 50) continue;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + 8 * s, py + 14 * s);
    ctx.lineTo(px + 3 * s, py + 26 * s);
    ctx.lineTo(px + 11 * s, py + 40 * s);
    ctx.stroke();
  }
}

const TERRACE_Z = 420;
function drawGround(ctx, T) {
  const yTop = P(0, WALL_Z)[1];
  const yEdge = P(0, TERRACE_Z)[1];
  const g = ctx.createLinearGradient(0, yTop, 0, Math.max(yTop + 1, yEdge));
  g.addColorStop(0, pal.g0);
  g.addColorStop(1, pal.g1);
  ctx.fillStyle = g;
  ctx.fillRect(0, yTop, W, Math.max(0, Math.min(H, yEdge) - yTop) + 1);
  // borde del bancal: muro de piedra seca y terraza inferior con olivos
  if (yEdge < H) {
    const s = cam.z;
    const wallB = yEdge + 150 * s;
    ctx.fillStyle = lerpColor(pal.g1, pal.ink, 0.35);
    ctx.fillRect(0, yEdge, W, wallB - yEdge);
    const r = mulberry32(3);
    ctx.strokeStyle = rgba(pal.ink, 0.45);
    ctx.lineWidth = 1.4 * s;
    for (let row = 0; row < 6; row++) {
      const yy = yEdge + row * 25 * s;
      const off = (row % 2) * 30;
      for (let x = -2600 + off; x < 3800; x += 60) {
        const [px] = P(x, TERRACE_Z);
        if (px < -60 || px > W + 60) continue;
        ctx.beginPath();
        ctx.ellipse(px, yy + 12 * s, 27 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = lerpColor(pal.g0, pal.m3, 0.35);
    ctx.fillRect(0, wallB, W, H - wallB + 1);
    for (const o of OLIVES) {
      const [px, py, ps] = P(o.x, o.z, 0);
      const yy = wallB + (o.z - 560) * 0.5 * s + 20 * s;
      if (px < -100 || px > W + 100 || yy > H + 100) continue;
      ctx.fillStyle = rgba(pal.ink, 0.6);
      ctx.fillRect(px - 3 * s, yy - 26 * s * o.s, 6 * s, 26 * s * o.s);
      ctx.beginPath();
      ctx.ellipse(px, yy - 38 * s * o.s, 34 * s * o.s, 20 * s * o.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // texturas del suelo: matas y piedrecitas
  for (const m of GROUND_MARKS) {
    if (m.z > TERRACE_Z - 4) continue;
    const [px, py, ps] = P(m.x, m.z);
    if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
    if (m.t < 0.55) {
      ctx.strokeStyle = rgba(pal.ink, 0.35);
      ctx.lineWidth = 1.1 * ps;
      ctx.beginPath();
      const l = 9 * m.s * ps;
      ctx.moveTo(px - l * 0.5, py - l); ctx.lineTo(px, py);
      ctx.lineTo(px + l * 0.15, py - l * 1.2);
      ctx.moveTo(px, py); ctx.lineTo(px + l * 0.6, py - l * 0.8);
      ctx.stroke();
    } else {
      ctx.fillStyle = rgba(pal.ink, 0.22);
      ctx.beginPath();
      ctx.ellipse(px, py, 4 * m.s * ps, 1.8 * m.s * ps, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRipples(ctx, T) {
  // "y el silencio se extendió por todo el valle": ondas que nacen del cura
  const t0 = cue('silencio') - 0.1;
  if (T < t0 || T > t0 + 5) return;
  const [cx, cy, s] = P(-420, 40);
  for (let i = 0; i < 5; i++) {
    const ts = t0 + i * 0.42;
    const u = (T - ts) / 3.4;
    if (u <= 0 || u >= 1) continue;
    const rx = easeOut(u) * 3600 * s;
    const a = (1 - u) * 0.55;
    ctx.strokeStyle = rgba(pal.ink, a);
    ctx.lineWidth = (2.5 - u * 1.5) * Math.max(0.6, s);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, rx * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawTree(ctx, T) {
  const [bx, by, s] = P(TREE_X, TREE_Z);
  if (bx > W + 900 * s || bx < -700 * s) return;
  ctx.setTransform(s, 0, 0, s, bx, by);
  ctx.fillStyle = pal.ink;
  ctx.strokeStyle = pal.ink;
  ctx.lineCap = 'round';
  const wind = (y) => Math.sin(T * 1.1 + y * 0.01) * (-y) * 0.006;
  for (const sg of TREE.segs) {
    ctx.lineWidth = (sg.w + sg.w2) / 2;
    ctx.beginPath();
    ctx.moveTo(sg.x + wind(sg.y), sg.y);
    ctx.quadraticCurveTo(sg.mx + wind(sg.my), sg.my, sg.x2 + wind(sg.y2), sg.y2);
    ctx.stroke();
  }
  // raíces
  ctx.beginPath();
  ctx.moveTo(-40, 4); ctx.quadraticCurveTo(-10, -30, 0, -40); ctx.quadraticCurveTo(14, -30, 46, 5); ctx.closePath();
  ctx.fill();
  for (const l of TREE.leaves) {
    const x = l.x + wind(l.y) + Math.sin(T * 2 + l.a * 5) * 1.5;
    ctx.beginPath();
    ctx.ellipse(x, l.y, l.r, l.r * 0.55, l.a, 0, Math.PI * 2);
    ctx.fill();
  }
  reset(ctx);
}

// ---------------------------------------------------------------------------
// Mundo: personajes, fosa, ataúd, tierra… ordenados por profundidad
function drawWorld(ctx, T) {
  const items = [];
  const add = (z, fn) => items.push({ z, fn });

  // Tumbas existentes
  for (const g of GRAVES) add(g.z, () => drawGrave(ctx, g.x, g.z, g.type, g.s, 1, 0, false, T));

  // Lápidas nuevas (los dolientes "ensalzados a la categoría de difuntos")
  add(PROC.z - 0.5, () => drawNewGraves(ctx, T));

  // Familia en guardia
  const famA = ramp(T, 37.6, 39.2) * (1 - ramp(T, 58.6, 60.2));
  FAMILY.forEach((fm, j) => {
    add(FAMILY_Z + j * 0.01, () => {
      const o = familyPose(fm, j, T);
      person(ctx, fm.x, FAMILY_Z, o, famA);
    });
  });

  // Procesión
  for (let i = 0; i < PROC.n; i++) add(PROC.z + i * 0.01, () => drawMourner(ctx, i, T));

  // Cura
  add(40, () => {
    const a = 1 - ramp(T, 28.4, 29.2);
    const o = priestPose(T);
    person(ctx, -420, 40, o, a);
    drawBlessing(ctx, T);
  });

  // Genoveva (primera parte)
  add(lerp(60, 100, ramp(T, cue('genoveva') - 0.1, cue('genoveva') + 1.0)), () => drawGenoveva(ctx, T));

  // Fosa + ataúd + travesaños
  add(70, () => drawPit(ctx, T));

  // Hombres de los travesaños
  for (const side of [-1, 1]) add(side < 0 ? 92 : 126, () => drawBarMan(ctx, side, T));
  // Hombres de las cuerdas
  ROPE_MEN.forEach((m, i) => add(m.z, () => drawRopeMan(ctx, m, i, T)));

  // Montón de tierra
  add(140, () => drawMound(ctx, T));
  // Eva y el chico
  add(125, () => drawEva(ctx, T));
  add(150, () => drawBoy(ctx, T));

  items.sort((a, b) => a.z - b.z);
  for (const it of items) it.fn();
  reset(ctx);

  drawRopes(ctx, T);
  drawGrainsInFlight(ctx, T);
  drawPasadoWord(ctx, T);
  drawNumerals(ctx, T);
  drawHandshakeSparks(ctx, T);
  drawCrosses(ctx, T);
  reset(ctx);
}

// --- Cura y bendición
function priestPose(T) {
  const ta = cue('amén');
  const raise = win(T, ta - 0.25, ta + 0.15, ta + 1.3, ta + 1.9);
  return {
    f: 1, kind: 'priest', hat: 'skull', bow: 0.35 * (1 - raise) + 0.1,
    armF: { sh: 0.85, el: 1.25 }, holding: 'book',
    armB: { sh: lerp(0.15, 2.75, raise), el: lerp(0.2, 0.15, raise) },
    edge: rgba(pal.paper, 0.4),
  };
}
function drawBlessing(ctx, T) {
  const ta = cue('amén');
  const u = invLerp(ta + 0.1, ta + 0.9, T);
  const a = win(T, ta + 0.05, ta + 0.2, ta + 1.4, ta + 2.2);
  if (a <= 0) return;
  const [cx, cy, s] = P(-370, 40, -330);
  ctx.save();
  ctx.strokeStyle = rgba(RED, a);
  ctx.lineWidth = 7 * s;
  ctx.lineCap = 'round';
  const v = clamp(u * 2), hz = clamp(u * 2 - 1);
  ctx.beginPath();
  ctx.moveTo(cx, cy - 40 * s);
  ctx.lineTo(cx, cy - 40 * s + 80 * s * v);
  if (hz > 0) { ctx.moveTo(cx - 28 * s, cy - 14 * s); ctx.lineTo(cx - 28 * s + 56 * s * hz, cy - 14 * s); }
  ctx.stroke();
  ctx.restore();
}

// --- Hombres de las cuerdas
function ropeState(T) {
  const lift = ramp(T, cue('levantaron') + 0.1, cue('ataúd') + 0.4);
  const lower = ramp(T, cue('y', 1) - 0.05, cue('fosa') + 0.05);
  const release = ramp(T, cueEnd('fosa') + 0.25, cueEnd('fosa') + 0.8);
  const leave = ramp(T, cueEnd('fosa') + 0.6, cueEnd('fosa') + 2.6);
  return { lift, lower, release, leave };
}
function coffinBottomH(T) {
  const { lift, lower } = ropeState(T);
  const sway = Math.sin(T * 2.3) * 2 * lift * (1 - lower);
  return lerp(lerp(-14, -48, easeInOut(lift)), LID_REST_H + COFFIN.height, easeInOut(lower)) + sway;
}
function ropeManPose(m, i, T) {
  const s = ropeState(T);
  const tc = cue('cuatro') + i * 0.24;
  const pop = win(T, tc, tc + 0.15, tc + 0.4, tc + 0.8);
  const pull = s.lift * (1 - s.lower);
  const grab = ramp(T, tc - 0.15, tc + 0.3); // agarran la soga al oír su número
  return {
    f: s.leave > 0 ? -m.f : m.f, hat: m.hat, kind: 'man',
    lean: -0.16 * pull + 0.28 * s.lower * (1 - s.release) - 0.05 * pop,
    crouch: 0.18 * s.lower * (1 - s.release),
    armF: { sh: lerp(0.12, lerp(0.62, 0.25, s.lower), grab) * (1 - s.release) + 0.12 * s.release, el: lerp(0.18, lerp(0.55, 0.3, s.lower), grab) },
    armB: { sh: lerp(0.1, lerp(0.5, 0.2, s.lower), grab) * (1 - s.release), el: lerp(0.2, 0.5, grab) },
    walk: s.leave > 0 && s.leave < 1 ? 1 : 0, phase: s.leave * 3,
    edge: rgba(pal.paper, 0.35), bow: 0.25,
  };
}
function ropeManX(m, T) {
  const s = ropeState(T);
  return m.x + Math.sign(m.x) * 420 * s.leave;
}
function drawRopeMan(ctx, m, i, T) {
  const s = ropeState(T);
  const a = 1 - ramp(T, cueEnd('fosa') + 1.8, cueEnd('fosa') + 2.6);
  person(ctx, ropeManX(m, T), m.z, ropeManPose(m, i, T), a);
}
function drawRopes(ctx, T) {
  const s = ropeState(T);
  if (s.release >= 1) return;
  const bottom = coffinBottomH(T);
  ROPE_MEN.forEach((m, i) => {
    const tc = cue('cuatro') + i * 0.24;
    const draw = easeOut(invLerp(tc, tc + 0.55, T));
    if (draw <= 0) return;
    const o = ropeManPose(m, i, T);
    const p = computePose(o);
    const k = depthK(m.z);
    const hx = ropeManX(m, T) + p.armF.hand[0] * m.f;
    const hh = p.armF.hand[1];
    const [ax, ay] = P(hx, m.z, hh * 1);
    const ex = m.x < 0 ? -92 : 92;
    const ez = m.z < 110 ? COFFIN.z0 + 8 : COFFIN.z1 - 8;
    const [bx, by] = P(ex, ez, bottom - 6);
    // la cuerda se "dibuja" desde la mano hacia el ataúd y luego se suelta
    const rx = lerp(ax, bx, draw), ry = lerp(ay, by, draw);
    const sag = (1 - s.lift * 0.8) * 26 * cam.z * (1 - s.release);
    ctx.strokeStyle = rgba('#3a3a3a', (1 - s.release));
    ctx.lineWidth = 3.2 * cam.z;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    // vibración de la soga al tensarse ("cuatro cabos de soga")
    const vib = win(T, cue('cabos') - 0.2, cue('cabos'), cueEnd('soga'), cueEnd('soga') + 0.4) * Math.sin(T * 60 + i) * 2.5 * cam.z;
    ctx.quadraticCurveTo((ax + rx) / 2 + vib, (ay + ry) / 2 + sag + vib, rx, ry);
    ctx.stroke();
  });
}
function drawNumerals(ctx, T) {
  const nums = ['I', 'II', 'III', 'IV'];
  ROPE_MEN.forEach((m, i) => {
    const tc = cue('cuatro') + i * 0.24;
    const a = win(T, tc, tc + 0.18, tc + 1.6, tc + 2.4);
    if (a <= 0) return;
    const [x, y, s] = P(m.x, m.z, -345 - 14 * easeOutBack(invLerp(tc, tc + 0.4, T)));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = RED;
    ctx.font = `800 ${52 * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(nums[i], x, y);
    ctx.restore();
  });
}

// --- Travesaños
function barPull(T) { return easeInOut(invLerp(cue('retiraron') - 0.05, cueEnd('travesaños') + 0.2, T)); }
function drawBarMan(ctx, side, T) {
  const u = barPull(T);
  const x = side * lerp(300, 580, u);
  const z = side < 0 ? 92 : 126;
  const pulling = u > 0 && u < 1;
  const a = 1 - ramp(T, cueEnd('fosa') + 1.4, cueEnd('fosa') + 2.4);
  const tc = cue('otros');
  const pop = win(T, tc, tc + 0.2, tc + 1.2, tc + 1.8);
  person(ctx, x, z, {
    f: -side, kind: 'man', hat: side < 0 ? 'none' : 'cap',
    lean: pulling ? -0.22 : 0.04 - 0.06 * pop, crouch: pulling ? 0.12 : 0.05 * pop,
    armF: { sh: pulling || u === 0 ? 0.75 : 0.15, el: 0.2 }, armB: { sh: pulling || u === 0 ? 0.6 : 0.1, el: 0.3 },
    walk: pulling ? 0.7 : 0, phase: -u * 3.2, edge: rgba(pal.paper, 0.35), bow: 0.2,
  }, a);
}
function drawBars(ctx, T) {
  const u = barPull(T);
  const a = 1 - ramp(T, cueEnd('fosa') + 1.4, cueEnd('fosa') + 2.4);
  if (a <= 0) return;
  for (const side of [-1, 1]) {
    const z = side < 0 ? 95 : 125;
    const off = side * lerp(0, 280, u);
    const [x0, y0, s] = P(-270 + off, z, -7);
    const [x1] = P(270 + off, z, -7);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#2e2e2e';
    ctx.lineWidth = 13 * s;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    ctx.strokeStyle = rgba('#9a9a9a', 0.7);
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x0, y0 - 3 * s); ctx.lineTo(x1, y0 - 3 * s); ctx.stroke();
    ctx.restore();
  }
}

// --- Fosa y ataúd
const PIT = { x0: -140, x1: 140, z0: 70, z1: 150 };
function pitFill(T) { return ramp(T, 42.8, 44.4); }
function drawPit(ctx, T) {
  const fill = pitFill(T);
  const c = [P(PIT.x0, PIT.z0), P(PIT.x1, PIT.z0), P(PIT.x1, PIT.z1), P(PIT.x0, PIT.z1)];
  if (fill < 1) {
    // boca de la fosa
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(c[0][0], c[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
    ctx.closePath();
    ctx.fillStyle = lerpColor(pal.soil, '#000000', 0.72);
    ctx.fill();
    ctx.clip();
    // pared del fondo (la más iluminada) y paredes laterales
    const D = 90;
    const quad = (pts, fill) => {
      ctx.beginPath();
      pts.forEach(([x, z, h], i) => { const p = P(x, z, h); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
    };
    const [, yb0] = P(0, PIT.z0, 0), [, yb1] = P(0, PIT.z0, D);
    const gw = ctx.createLinearGradient(0, yb0, 0, yb1);
    gw.addColorStop(0, lerpColor(pal.soil, pal.g1, 0.35));
    gw.addColorStop(1, lerpColor(pal.soil, '#000000', 0.55));
    quad([[PIT.x0, PIT.z0, 0], [PIT.x1, PIT.z0, 0], [PIT.x1, PIT.z0, D], [PIT.x0, PIT.z0, D]], gw);
    quad([[PIT.x0, PIT.z0, 0], [PIT.x0, PIT.z1, 0], [PIT.x0, PIT.z1, D], [PIT.x0, PIT.z0, D]], lerpColor(pal.soil, '#000000', 0.35));
    quad([[PIT.x1, PIT.z0, 0], [PIT.x1, PIT.z1, 0], [PIT.x1, PIT.z1, D], [PIT.x1, PIT.z0, D]], lerpColor(pal.soil, '#000000', 0.45));
    // estratos de la pared del fondo
    ctx.strokeStyle = rgba(pal.ink, 0.25);
    ctx.lineWidth = 1.2 * cam.z;
    for (let i = 1; i < 6; i++) {
      const [ax, ay] = P(PIT.x0, PIT.z0, i * 9);
      const [bx] = P(PIT.x1, PIT.z0, i * 9);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      for (let x = ax; x < bx; x += 20) ctx.lineTo(x, ay + Math.sin(x * 0.05 + i) * 2 * cam.z);
      ctx.stroke();
    }
    ctx.restore();
    // ataúd (recortado por el borde frontal cuando baja)
    ctx.save();
    const frontY = c[2][1];
    if (coffinBottomH(T) > -2) {
      ctx.beginPath();
      ctx.rect(0, -10, W, frontY + 10);
      ctx.clip();
    }
    drawCoffin(ctx, T);
    drawLandedGrains(ctx, T);
    ctx.restore();
    // sombra interior que se va oscureciendo con la profundidad
    drawBars(ctx, T);
    // labio del borde frontal
    ctx.strokeStyle = rgba(pal.ink, 0.6);
    ctx.lineWidth = 2.4 * cam.z;
    ctx.beginPath();
    ctx.moveTo(c[3][0], c[3][1]); ctx.lineTo(c[2][0], c[2][1]);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.g0, 0.9);
    ctx.lineWidth = 3 * cam.z;
    ctx.beginPath();
    ctx.moveTo(c[3][0], c[3][1] + 2 * cam.z); ctx.lineTo(c[2][0], c[2][1] + 2 * cam.z);
    ctx.stroke();
  }
  if (fill > 0) drawGraveMound(ctx, T, fill);
}

const COFFIN_TOP = [[-100, 104], [-72, 86], [100, 93], [100, 127], [-72, 134], [-100, 116]];
function drawCoffin(ctx, T) {
  const bottom = coffinBottomH(T);
  const top = bottom - COFFIN.height;
  const depth = clamp(top / LID_REST_H);
  const dark = 0.15 + 0.55 * clamp(depth);
  const wood = lerpColor('#4a4a4a', '#0a0a0a', dark + pal.night * 0.3);
  const woodTop = lerpColor('#7a7a7a', '#121212', dark + pal.night * 0.3);
  // banda lateral
  const tp = COFFIN_TOP.map(([x, z]) => P(x, z, top));
  const bp = COFFIN_TOP.map(([x, z]) => P(x, z, bottom));
  ctx.fillStyle = wood;
  ctx.beginPath();
  for (const i of [2, 3, 4, 5, 0]) ctx.lineTo(tp[i][0], tp[i][1]);
  for (const i of [0, 5, 4, 3, 2]) ctx.lineTo(bp[i][0], bp[i][1]);
  ctx.closePath();
  ctx.fill();
  // tapa
  ctx.fillStyle = woodTop;
  ctx.beginPath();
  tp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = rgba('#000000', 0.35);
  ctx.lineWidth = 1.5 * cam.z;
  ctx.stroke();
  // cruz en la tapa
  const [cx, cy, s] = P(-20, 110, top);
  ctx.strokeStyle = rgba('#ffffff', 0.55 * (1 - depth * 0.6));
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.moveTo(cx - 34 * s, cy); ctx.lineTo(cx + 40 * s, cy);
  ctx.moveTo(cx - 14 * s, cy - 11 * s); ctx.lineTo(cx - 14 * s, cy + 11 * s);
  ctx.stroke();
  // tierra acumulada sobre la tapa
  const cover = landedFraction(T);
  if (cover > 0) {
    ctx.fillStyle = rgba(lerpColor(pal.soil, '#000', 0.3), clamp(cover * 1.4) * 0.85);
    ctx.beginPath();
    tp.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.save();
    ctx.clip();
    const r = mulberry32(8);
    for (let i = 0; i < 26; i++) {
      const [px, py] = P(lerp(-95, 95, r()), lerp(88, 132, r()), top);
      if (r() < cover * 1.2) {
        ctx.beginPath();
        ctx.ellipse(px, py, (16 + r() * 22) * cam.z, (5 + r() * 6) * cam.z, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
function landedFraction(T) {
  let n = 0;
  for (const g of GRAINS) if (T >= g.t0 + g.dt) n++;
  return n / GRAINS.length;
}
function grainPos(g, T) {
  const t = clamp(T - g.t0, 0, g.dt);
  const u = t / g.dt;
  return [lerp(g.x0, g.x1, u), lerp(g.z0, g.z1, u), g.h0 + g.vh * t + 0.5 * GRAVITY * t * t];
}
function drawLandedGrains(ctx, T) {
  const top = coffinBottomH(T) - COFFIN.height;
  for (const g of GRAINS) {
    if (T < g.t0 + g.dt) continue;
    const [px, py, s] = P(g.x1, g.z1, top - 1);
    ctx.fillStyle = lerpColor('#9a9a9a', '#d4d4d4', g.shade);
    ctx.beginPath();
    ctx.ellipse(px, py, g.size * s, g.size * 0.6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
function drawGrainsInFlight(ctx, T) {
  for (const g of GRAINS) {
    if (T < g.t0 || T >= g.t0 + g.dt) continue;
    const [x, z, h] = grainPos(g, T);
    const [px, py, s] = P(x, z, h);
    ctx.fillStyle = lerpColor('#222222', '#6a6a6a', g.shade * 0.5);
    ctx.beginPath();
    ctx.ellipse(px, py, g.size * s, g.size * 0.75 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGraveMound(ctx, T, fill) {
  ctx.save();
  ctx.globalAlpha = fill;
  const r = mulberry32(31);
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    const x = lerp(PIT.x0 - 18, PIT.x1 + 18, u);
    const bump = Math.sin(u * Math.PI);
    pts.push(P(x, lerp(PIT.z0, PIT.z1, 0.5), -bump * 30 - (r() - 0.5) * 5 * bump));
  }
  const base = [P(PIT.x1 + 22, PIT.z1 + 6), P(PIT.x0 - 22, PIT.z1 + 6)];
  ctx.fillStyle = lerpColor(pal.soil, pal.g1, 0.25);
  ctx.beginPath();
  const b0 = P(PIT.x0 - 22, PIT.z0 - 4);
  ctx.moveTo(b0[0], b0[1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  const b1 = P(PIT.x1 + 22, PIT.z0 - 4);
  ctx.lineTo(b1[0], b1[1]);
  ctx.lineTo(base[0][0], base[0][1]);
  ctx.lineTo(base[1][0], base[1][1]);
  ctx.closePath();
  ctx.fill();
  // terrones
  ctx.fillStyle = rgba(pal.ink, 0.3);
  for (let i = 0; i < 40; i++) {
    const [px, py, s] = P(lerp(PIT.x0, PIT.x1, r()), lerp(PIT.z0, PIT.z1, r()), -r() * 20);
    ctx.beginPath();
    ctx.ellipse(px, py, (2 + r() * 4) * s, (1.4 + r() * 2) * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // cruz de madera
  const [cx, cy, s] = P(-6, PIT.z0 + 2, -24);
  ctx.fillStyle = lerpColor('#3a3a3a', pal.ink, 0.4);
  ctx.fillRect(cx - 4 * s, cy - 96 * s, 8 * s, 96 * s);
  ctx.fillRect(cx - 28 * s, cy - 76 * s, 56 * s, 8 * s);
  ctx.restore();
}

function drawMound(ctx, T) {
  // montón de tierra junto a la fosa
  const a = 1 - pitFill(T);
  if (a <= 0) return;
  const r = mulberry32(12);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = lerpColor(pal.soil, pal.g1, 0.3);
  ctx.beginPath();
  const b0 = P(-360, 168);
  ctx.moveTo(b0[0], b0[1]);
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    const [px, py] = P(lerp(-360, -160, u), lerp(168, 150, u), -Math.sin(u * Math.PI) * (44 + (r() - 0.5) * 10));
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(pal.ink, 0.28);
  for (let i = 0; i < 22; i++) {
    const u = r();
    const [px, py, s] = P(lerp(-350, -170, u), 160, -Math.sin(u * Math.PI) * 40 * r());
    ctx.beginPath();
    ctx.ellipse(px, py, 3 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPasadoWord(ctx, T) {
  const t0 = cue('pasado');
  const a = win(T, t0 - 0.05, t0 + 0.35, cueEnd('fosa') + 0.2, cueEnd('fosa') + 0.9);
  if (a <= 0) return;
  const c3 = P(PIT.x0, PIT.z1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, c3[1]);
  ctx.clip();
  const word = 'EL PASADO';
  ctx.font = `800 ${34 * cam.z}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(pal.paper, a);
  for (let i = 0; i < word.length; i++) {
    const lag = i * 0.06;
    const b = coffinBottomH(T - lag);
    const [x, y] = P(-84 + i * 21, 114, b - COFFIN.height - 4);
    ctx.fillText(word[i], x, y);
  }
  ctx.restore();
}

// --- Genoveva
function genovevaState(T) {
  const tg = cue('genoveva');
  const walk = invLerp(tg - 0.1, tg + 1.0, T);
  const ta = cue('arrojar');
  const crouch = win(T, ta - 0.75, ta - 0.4, ta - 0.25, ta + 0.1);
  const swing = invLerp(ta + 0.05, ta + 0.55, T);
  const after = ramp(T, ta + 0.7, ta + 1.4);
  return { walk, crouch, swing, after };
}
function genovevaPose(T) {
  const s = genovevaState(T);
  const walking = s.walk > 0 && s.walk < 1;
  const sw = easeOut(s.swing);
  return {
    f: 1, kind: 'woman', hat: 'mantilla', H: 290,
    walk: walking ? 0.8 : 0, phase: s.walk * 2,
    crouch: s.crouch * 0.85,
    lean: -0.08 * sw * (1 - s.after),
    bow: 0.2 + 0.45 * s.after,
    armF: s.swing > 0 && s.after < 1
      ? { sh: lerp(0.3, 1.45, sw) * (1 - s.after) + 0.12 * s.after, el: lerp(0.3, -0.1, sw) * (1 - s.after) + 0.2 * s.after }
      : { sh: lerp(0.12, 0.5, s.crouch), el: lerp(0.18, 0.2, s.crouch) },
    edge: rgba(pal.paper, 0.4),
  };
}
function drawGenoveva(ctx, T) {
  const s = genovevaState(T);
  const x = lerp(-470, -262, easeInOut(s.walk));
  const z = lerp(60, 100, easeInOut(s.walk));
  const a = 1 - ramp(T, 28.4, 29.2);
  person(ctx, x, z, genovevaPose(T), a);
}

// --- Eva y el chico
function drawEva(ctx, T) {
  const td = cue('eva') + 0.05;
  const tEnd = cueEnd('desvaneció') + 0.5;
  const move = invLerp(cueEnd('fosa') + 0.9, cueEnd('fosa') + 2.6, T);
  const x = lerp(470, 300, easeInOut(move));
  const z = 125;
  const o = { ...evaPose(), f: -1, walk: move > 0 && move < 1 ? 0.8 : 0, phase: move * 2.2, edge: rgba(pal.paper, 0.4) };
  if (T < td) { person(ctx, x, z, o); return; }
  if (T > tEnd + 2.5) return;
  // disolución: la silueta se deshace en motas que el viento arrastra
  const [sx, sy, s] = P(x, z);
  const u = invLerp(td, tEnd, T);
  ctx.fillStyle = pal.ink;
  for (const p of evaPts) {
    // el viento barre de arriba abajo y de atrás adelante
    const thr = 0.15 + 0.7 * (1 - (p.y + 320) / 330) * 0.6 + p.r1 * 0.35;
    const lt = (u * 1.25 - thr * 0.9);
    const lx = -p.x; // figura mirando a la izquierda
    if (lt <= 0) {
      ctx.fillRect(sx + lx * s - 1.7 * s, sy + p.y * s - 1.7 * s, 3.4 * s, 3.4 * s);
      continue;
    }
    const tt = lt * 3.2 + Math.max(0, T - tEnd) * 0.8;
    const fade = 1 - clamp(tt * 0.55);
    if (fade <= 0) continue;
    const dx = (tt * 120 + tt * tt * 60) * (0.6 + p.r2) + Math.sin(tt * 3 + p.r3 * 9) * 18;
    const dy = -(tt * 90 + tt * tt * 40) * (0.4 + p.r3) + Math.cos(tt * 2 + p.r1 * 7) * 10;
    const sz = 3.2 * (1 - clamp(tt * 0.4)) * s;
    ctx.globalAlpha = fade;
    ctx.fillRect(sx + (lx + dx) * s - sz / 2, sy + (p.y + dy) * s - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
}
const BOY_X = 228;
function boyPose(T) {
  const move = invLerp(cueEnd('fosa') + 0.9, cueEnd('fosa') + 2.6, T);
  const turn = win(T, cue('volvían') + 0.05, cue('volvían') + 0.35, cue('saludaban') - 0.4, cue('saludaban'));
  const appleLook = ramp(T, 65.6, 66.4);
  return {
    f: -1, kind: 'boy', H: 192, hat: 'none',
    walk: move > 0 && move < 1 ? 0.8 : 0, phase: move * 3,
    bow: lerp(0.35, 0.65, ramp(T, cue('mirando'), cue('pies'))) * (1 - ramp(T, 39, 40)) + 0.3 + appleLook * 0.4,
    headTurn: lerp(1, -1, turn),
    armF: { sh: 0.1, el: 0.25 },
    edge: rgba(pal.paper, 0.45),
  };
}
function drawBoy(ctx, T) {
  const move = invLerp(cueEnd('fosa') + 0.9, cueEnd('fosa') + 2.6, T);
  const x = lerp(400, BOY_X, easeInOut(move));
  // un leve haz de luz cuando se queda solo
  const solo = win(T, cue('chico') - 0.2, cue('solo'), cue('mirando') - 0.4, cue('mirando') + 0.3);
  if (solo > 0) {
    const [sx, sy, s] = P(x, 150);
    const g = ctx.createRadialGradient(sx, sy - 80 * s, 0, sx, sy - 80 * s, 420 * s);
    g.addColorStop(0, rgba(pal.paper, 0.55 * solo));
    g.addColorStop(1, rgba(pal.paper, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx - 420 * s, sy - 500 * s, 840 * s, 840 * s);
  }
  person(ctx, x, 150, boyPose(T));
}
// --- Procesión de dolientes
function mournerX(i, T) { return procX(T) - i * PROC.spacing; }
function mournerPose(i, T) {
  const st = MOURNER_STYLE[i];
  const x = mournerX(i, T);
  const X = procX(T), X2 = procX(T + 1 / 60);
  const moving = Math.abs(X2 - X) > 0.05;
  const phase = x / 220;
  // lanzar tierra en la fosa
  let armF = { sh: 0.12, el: 0.2 }, crouch = 0, lean = 0;
  for (let k = 0; k < PROC.throws; k++) {
    if (k !== i) continue;
    const tr = THROWS[k + 1].t;
    const prep = win(T, tr - 0.36, tr - 0.22, tr - 0.18, tr - 0.04);
    const sw = easeOut(invLerp(tr - 0.16, tr + 0.04, T)) * (1 - ramp(T, tr + 0.18, tr + 0.5));
    crouch = prep * 0.55;
    if (sw > 0) armF = { sh: lerp(0.3, 1.2, sw), el: lerp(0.4, 0.05, sw) };
    else if (prep > 0) armF = { sh: 0.45, el: 0.2 };
  }
  // apretones de manos
  const hs = handshakeAmount(i, T);
  if (hs > 0) armF = { sh: lerp(armF.sh, 0.62 + Math.sin(T * 26) * 0.06 * hs, hs), el: lerp(armF.el, 0.8, hs) };
  // saludo a la sobrina: se llevan la mano a la gorra
  const tip = nieceGreet(i, T);
  if (tip > 0) armF = { sh: lerp(armF.sh, 2.15, tip), el: lerp(armF.el, 1.25, tip) };
  // santiguarse
  const cr = crossAmount(i, T);
  if (cr.a > 0) armF = { sh: lerp(armF.sh, cr.sh, cr.a), el: lerp(armF.el, cr.el, cr.a) };
  const look = win(T, cue('volvían'), cue('volvían') + 0.3, cue('saludaban') - 0.2, cue('saludaban') + 0.3);
  const bow = (T > PROC.marchStart - 0.3 ? 0.55 : 0.3) * (1 - look) * (1 - 0.6 * tip) + 0.1;
  return {
    f: 1, kind: st.kind, hat: st.hat, H: st.H,
    walk: moving ? 1 : 0, phase, crouch, lean, bow,
    armF, armB: { sh: 0.08, el: 0.2 }, edge: rgba(pal.paper, 0.4),
  };
}
function drawMourner(ctx, i, T) {
  const x = mournerX(i, T);
  const enter = ramp(T, PROC.enter - 0.3, PROC.enter + 0.4);
  const rise = ramp(T, riseT(i), riseT(i) + 0.7);
  const a = enter * (1 - rise);
  if (a <= 0) return;
  person(ctx, x, PROC.z, mournerPose(i, T), a, -46 * easeIn(rise));
}
const riseT = (i) => cue('ensalzados') - 0.1 + i * 0.13;

function handshakeAmount(i, T) {
  const mp = marchPause(T);
  if (!mp || T < cue('iban') - 0.4 || T > cueEnd('guardia') + 0.9) return 0;
  const pos = mournerX(i, mp.start + 0.01);
  const j = Math.round((pos - 440) / 110);
  if (j < 0 || j >= FAMILY.length || Math.abs(pos - (440 + 110 * j)) > 2) return 0;
  return Math.sin(Math.PI * clamp(mp.u)) ** 0.6;
}
function familyHandshake(j, T) {
  for (let i = 0; i < PROC.n; i++) {
    const mp = marchPause(T);
    if (!mp) return 0;
    const pos = mournerX(i, mp.start + 0.01);
    if (Math.abs(pos - (440 + 110 * j)) < 2) return handshakeAmount(i, T);
  }
  return 0;
}
function nieceGreet(i, T) {
  const t0 = cue('saludaban') - 0.1, t1 = cueEnd('boina') + 0.4;
  if (T < t0 || T > t1) return 0;
  const x = mournerX(i, T);
  const d = Math.abs(x - (FAMILY[4].x - HS_GAP));
  return clamp(1 - d / 200) * win(T, t0, t0 + 0.3, t1 - 0.3, t1);
}
const CROSS_T = () => cue('santiguaban') - 0.1;
function crossAmount(i, T) {
  const t0 = CROSS_T() + i * 0.04;
  const u = invLerp(t0, t0 + 1.05, T);
  if (u <= 0 || u >= 1) return { a: 0 };
  // frente → pecho → hombro → hombro
  const keys = [[0, 0.12, 0.2], [0.18, 0.55, 2.7], [0.42, 0.75, 1.75], [0.62, 0.95, 2.1], [0.8, 0.55, 2.0], [1, 0.12, 0.2]];
  let a = keys[0], b = keys[1];
  for (let k = 0; k < keys.length - 1; k++) if (u >= keys[k][0] && u <= keys[k + 1][0]) { a = keys[k]; b = keys[k + 1]; }
  const v = easeInOut((u - a[0]) / (b[0] - a[0]));
  return { a: 1, sh: lerp(a[1], b[1], v), el: lerp(a[2], b[2], v) };
}
function drawCrosses(ctx, T) {
  // trazos dorados de la señal de la cruz
  for (let i = 0; i < PROC.n; i++) {
    const t0 = CROSS_T() + i * 0.04;
    const u = invLerp(t0 + 0.12, t0 + 0.95, T);
    const a = win(T, t0 + 0.1, t0 + 0.3, t0 + 1.2, t0 + 1.9);
    if (a <= 0) continue;
    const x = mournerX(i, T);
    const [cx, cy, s0] = P(x + 30, PROC.z, -232);
    const s = s0 * MOURNER_STYLE[i].H / 300;
    const v = clamp(u * 2), hz = clamp(u * 2 - 1);
    ctx.save();
    ctx.strokeStyle = rgba(RED, a);
    ctx.lineWidth = 5.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 34 * s); ctx.lineTo(cx, cy - 34 * s + 74 * s * v);
    if (hz > 0) { ctx.moveTo(cx - 22 * s, cy - 8 * s); ctx.lineTo(cx - 22 * s + 44 * s * hz, cy - 8 * s); }
    ctx.stroke();
    ctx.restore();
  }
}
function drawHandshakeSparks(ctx, T) {
  for (let i = 0; i < PROC.n; i++) {
    const hs = handshakeAmount(i, T);
    if (hs < 0.5) continue;
    const x = mournerX(i, T) + HS_GAP / 2;
    const [px, py, s] = P(x, (PROC.z + FAMILY_Z) / 2, -185);
    ctx.fillStyle = rgba(RED, clamp((hs - 0.5) * 2));
    ctx.beginPath();
    ctx.arc(px, py, 9 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Familia
function familyPose(fm, j, T) {
  const look = win(T, cue('volvían') + j * 0.05, cue('volvían') + 0.3 + j * 0.05, cue('saludaban') - 0.2, cue('saludaban') + 0.3);
  const hs = familyHandshake(j, T);
  let armF = { sh: 0.12, el: 0.25 };
  if (hs > 0) armF = { sh: lerp(0.12, 0.5 + Math.sin(T * 26) * 0.06 * hs, hs), el: lerp(0.25, 0.85, hs) };
  const nod = fm.niece ? win(T, cue('sobrina'), cue('sobrina') + 0.25, cueEnd('boina'), cueEnd('boina') + 0.4) : 0;
  return {
    f: -1, kind: fm.kind === 'oldman' ? 'man' : fm.kind, hat: fm.hat, H: fm.H,
    hatColor: fm.niece ? RED : undefined,
    headTurn: lerp(1, -1, look), bow: 0.3 * (1 - look) + 0.35 * nod + (fm.kind === 'oldman' ? 0.25 : 0),
    lean: fm.kind === 'oldman' ? 0.12 : 0,
    armF, armB: { sh: 0.1, el: 0.3 }, edge: rgba(pal.paper, 0.4),
  };
}

// --- Tumbas
function drawGrave(ctx, x, z, type, sc, alpha, hop, engraved, T, glowCandle = 0, fresh = false) {
  const [sx, sy, s0] = P(x, z, 0);
  if (sx < -200 || sx > W + 200) return;
  const s = s0 * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sx, sy - hop * s);
  ctx.fillStyle = fresh ? '#ffffff' : lerpColor(pal.wallShade, pal.ink, 0.25);
  ctx.strokeStyle = rgba(pal.ink, 0.8);
  ctx.lineWidth = 2 * s;
  if (type === 'cross') {
    ctx.fillStyle = fresh ? ctx.fillStyle : pal.ink;
    if (fresh) {
      ctx.strokeRect(-6 * s, -110 * s, 12 * s, 110 * s);
      ctx.strokeRect(-34 * s, -86 * s, 68 * s, 11 * s);
    }
    ctx.fillRect(-6 * s, -110 * s, 12 * s, 110 * s);
    ctx.fillRect(-34 * s, -86 * s, 68 * s, 11 * s);
  } else {
    ctx.beginPath();
    ctx.moveTo(-34 * s, 0);
    ctx.lineTo(-34 * s, -70 * s);
    ctx.arc(0, -70 * s, 34 * s, Math.PI, 0);
    ctx.lineTo(34 * s, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.ink, 0.6 * (engraved === false ? 1 : engraved));
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(0, -92 * s); ctx.lineTo(0, -64 * s);
    ctx.moveTo(-10 * s, -82 * s); ctx.lineTo(10 * s, -82 * s);
    ctx.moveTo(-18 * s, -46 * s); ctx.lineTo(18 * s, -46 * s);
    ctx.moveTo(-14 * s, -36 * s); ctx.lineTo(14 * s, -36 * s);
    ctx.stroke();
  }
  ctx.restore();
  // vela
  const nc = pal.night * glowCandle;
  if (nc > 0.01) {
    ctx.fillStyle = rgba('#ffffff', nc);
    ctx.fillRect(sx + 40 * s, sy - 18 * s, 7 * s, 18 * s);
    ctx.fillStyle = rgba(RED, nc);
    ctx.beginPath();
    ctx.ellipse(sx + 43.5 * s, sy - 25 * s, 4 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    GLOWS.push({ x: sx + 43 * s, y: sy - 24 * s, r: 70 * s, a: nc * (0.85 + 0.15 * Math.sin(T * 13 + x)) });
  }
}
function drawNewGraves(ctx, T) {
  for (let i = 0; i < PROC.n; i++) {
    const t0 = riseT(i) + 0.25;
    const u = invLerp(t0, t0 + 0.9, T);
    if (u <= 0) continue;
    const x = mournerX(i, t0);
    const eng = ramp(T, cue('categoría') + i * 0.1, cue('categoría') + 0.6 + i * 0.1);
    // a ritmo de vals en la fiesta
    const tw = cue('serían');
    const beat = 0.35;
    const bt = T - tw;
    const hop = bt > 0 && T < 65.6 ? Math.abs(Math.sin((bt / (beat * 3)) * Math.PI)) * 9 * ramp(T, tw, tw + 0.5) * (1 - ramp(T, 65, 65.6)) : 0;
    const candle = ramp(T, tw + 0.15 + i * 0.09, tw + 0.35 + i * 0.09);
    // emergen del suelo (ensalzados)
    const rise = easeOutBack(u);
    ctx.save();
    const [sx, sy] = P(x, PROC.z);
    ctx.beginPath();
    ctx.rect(0, 0, W, sy + 1);
    ctx.clip();
    drawGrave(ctx, x, PROC.z, i % 3 === 1 ? 'cross' : 'stele', 1.1, 1, (rise - 1) * 120 + hop, eng, T, candle, true);
    ctx.restore();
    // halo al elevarse
    const ha = win(T, t0, t0 + 0.2, t0 + 0.6, t0 + 1.5);
    if (ha > 0) {
      const [hx, hy, s] = P(x, PROC.z, -150);
      ctx.strokeStyle = rgba(RED, ha);
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.ellipse(hx, hy - 10 * s * ha, 30 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// La fiesta: papel picado, farolillos, confeti
let GLOWS = [];
const PICADO_COLORS = [RED, '#000000', RED, '#8a8a8a', '#ffffff'];
function drawFiesta(ctx, T) {
  const t0 = cue('serían');
  if (T < t0 - 0.1) return;
  const strings = [
    { x0: 1080, x1: 2700, h: -330, z: 10, sag: 70 },
    { x0: 1200, x1: 2650, h: -270, z: 60, sag: 50 },
    { x0: -200, x1: 1100, h: -330, z: 0, sag: 60 },
  ];
  strings.forEach((st, si) => {
    const unf = easeOut(invLerp(t0 + si * 0.25, t0 + 1.2 + si * 0.25, T));
    if (unf <= 0) return;
    const pt = (u) => {
      const x = lerp(st.x0, st.x1, u);
      return P(x, st.z, st.h + Math.sin(u * Math.PI) * st.sag + Math.sin(T * 1.5 + u * 8) * 3);
    };
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2 * cam.z;
    ctx.beginPath();
    for (let u = 0; u <= unf + 1e-6; u += 0.02) {
      const [x, y] = pt(u);
      u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    const n = 26;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      if (u > unf) break;
      const [x, y, s] = pt(u);
      const drop = easeOutBack(clamp((unf - u) * 6));
      const sw = Math.sin(T * 3 + k) * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sw);
      ctx.scale(1, drop);
      ctx.fillStyle = PICADO_COLORS[(k + si * 3) % PICADO_COLORS.length];
      const fw = 30 * s, fh = 38 * s;
      ctx.beginPath();
      ctx.moveTo(-fw / 2, 0);
      ctx.lineTo(fw / 2, 0);
      ctx.lineTo(fw / 2, fh);
      for (let z = 0; z < 4; z++) ctx.lineTo(fw / 2 - (z + 0.5) * fw / 4, fh - (z % 2 ? 0 : 6 * s)), ctx.lineTo(fw / 2 - (z + 1) * fw / 4, fh);
      ctx.closePath();
      ctx.fill();
      // calados
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(0, fh * 0.45, 6 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
      // farolillos cada pocos banderines
      if (k % 6 === 3) {
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.arc(x, y + 24 * s, 15 * s, 0, Math.PI * 2);
        ctx.fill();
        GLOWS.push({ x, y: y + 22 * s, r: 110 * s, a: 0.8 + 0.2 * Math.sin(T * 7 + k) });
      }
    }
  });
  // confeti con "fiesta"
  const tf = cue('fiesta') - 0.1;
  if (T > tf) {
    const r = mulberry32(64);
    for (let i = 0; i < 240; i++) {
      const born = tf + r() * 1.6;
      const x0 = lerp(400, 2700, r()), vx = (r() - 0.5) * 60, ph = r() * 6;
      const col = PICADO_COLORS[i % PICADO_COLORS.length];
      const sz = 4 + r() * 5;
      if (T < born) continue;
      const dt = T - born;
      const [px, py, s] = P(x0 + vx * dt + Math.sin(dt * 3 + ph) * 20, 60, -620 + dt * 160);
      const fa = 1 - ramp(T, 66.2, 67.4);
      if (py > H + 20 || fa <= 0) continue;
      ctx.save();
      ctx.globalAlpha = fa;
      ctx.translate(px, py);
      ctx.rotate(dt * 4 + ph);
      ctx.scale(1, Math.sin(dt * 7 + ph));
      ctx.fillStyle = col;
      ctx.fillRect(-sz * s / 2, -sz * s / 4, sz * s, sz * s / 2);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------
// La manzana: roja, siempre colgando… hasta que cae sobre la tumba al final.
function drawApple(ctx, T) {
  const [bx, by, s] = P(TREE_X, TREE_Z);
  const hang = [bx + TREE.apple[0] * s, by + TREE.apple[1] * s];
  let x, y, sc = s, rotA = 0;
  const wind = Math.sin(T * 1.1 + TREE.apple[1] * 0.01) * (-TREE.apple[1]) * 0.006 * s;
  if (T < APPLE_FALL) {
    const shake = win(T, APPLE_FALL - 0.7, APPLE_FALL - 0.5, APPLE_FALL - 0.1, APPLE_FALL) * Math.sin(T * 40) * 0.12;
    x = hang[0] + wind;
    y = hang[1];
    rotA = Math.sin(T * 1.3) * 0.08 + shake;
    // tallo
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 3 * s;
    ctx.beginPath();
    ctx.moveTo(x, y - 30 * s);
    ctx.lineTo(x + Math.sin(rotA) * 18 * s, y - 14 * s);
    ctx.stroke();
    x += Math.sin(rotA) * 18 * s;
  } else {
    // caída hasta el montículo de la tumba (x = -10, z = 110, h ≈ -28)
    const land = { x: -14, z: 112, h: -34 };
    const dt = T - APPLE_FALL;
    const fallDur = APPLE_LAND - APPLE_FALL;
    if (dt < fallDur) {
      const u = dt / fallDur;
      const [lx, ly, ls] = P(land.x, land.z, land.h);
      x = lerp(hang[0], lx, u);
      y = lerp(hang[1], ly, u * u);
      sc = lerp(s, ls, u);
      rotA = u * 2.4;
    } else {
      // rebote y pequeño rodar
      const bt = dt - fallDur;
      const bounce = Math.abs(Math.sin(Math.min(bt, APPLE_BOUNCE) / APPLE_BOUNCE * Math.PI)) * 26 * Math.exp(-bt * 2) * (bt < APPLE_BOUNCE ? 1 : 0);
      const roll = easeOut(clamp(bt / 1.1)) * 22;
      const [lx, ly, ls] = P(land.x + roll, land.z, land.h);
      x = lx; y = ly - bounce * ls; sc = ls;
      rotA = 2.4 + roll * 0.08;
    }
  }
  drawAppleShape(ctx, x, y, sc, rotA);
}
function drawAppleShape(ctx, x, y, s, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const r = 19 * s;
  ctx.fillStyle = RED;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.bezierCurveTo(r * 0.5, -r * 1.15, r * 1.25, -r * 0.7, r * 1.05, r * 0.15);
  ctx.bezierCurveTo(r * 0.9, r * 0.95, r * 0.35, r * 1.1, 0, r * 0.92);
  ctx.bezierCurveTo(-r * 0.35, r * 1.1, -r * 0.9, r * 0.95, -r * 1.05, r * 0.15);
  ctx.bezierCurveTo(-r * 1.25, -r * 0.7, -r * 0.5, -r * 1.15, 0, -r * 0.7);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.48, -r * 0.3, r * 0.13, r * 0.26, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.ellipse(r * 0.38, -r * 0.98, r * 0.46, r * 0.17, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
function drawGlows(ctx, T) {
  if (!GLOWS.length) return;
  ctx.save();
  for (const g of GLOWS) {
    const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    gr.addColorStop(0, `rgba(255,255,255,${0.75 * g.a})`);
    gr.addColorStop(0.35, `rgba(255,255,255,${0.3 * g.a})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  }
  ctx.restore();
  GLOWS = [];
}

function drawPost(ctx, T) {
  // textura de papel sobre la impresión
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.55;
  ctx.drawImage(paperTex, 0, 0);
  ctx.restore();
}

/** Viñeta en la propia trama (más intensa cuando el chico se queda solo). */
function drawVignette(ctx, T) {
  const solo = win(T, cue('chico') - 0.4, cue('solo'), cue('mirando') - 0.4, cue('mirando') + 0.2);
  const v = 0.1 + 0.4 * solo;
  const g = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.38, W / 2, H * 0.5, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawFade(ctx, T) {
  // entra desde el papel en blanco y termina en papel, con el título impreso encima
  const a = Math.max(1 - ramp(T, 0, 0.5), ramp(T, 68.05, 68.8));
  if (a <= 0) return;
  ctx.fillStyle = CSS.paper;
  ctx.globalAlpha = a;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
}
