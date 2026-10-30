// "Una manzana para la sed" — versión de tipografía cinética.
// Sólo letras, partículas y alguna forma vectorial, con la paleta del cartel de referencia
// (papel crema, azul cobalto, rojo bermellón y negro). Cada frase tiene su propia escena y
// cada palabra entra cuando se pronuncia. Todo es función pura del tiempo T.

import {
  clamp, lerp, invLerp, ramp, win, easeOut, easeIn, easeInOut, easeOutBack, mulberry32, hash, noise1,
} from './util.js';
import {
  W, H, cue, cueEnd, phrases, PROC, footfalls, GRAINS, THROWS, APPLE_FALL, APPLE_LAND, APPLE_BOUNCE,
} from './timeline.js';

const C = { paper: '#ECE4D2', blue: '#1E4C9C', red: '#D6422A', black: '#1C1B1A' };
const FONT = (w, s) => `${w} ${s}px "Inter Tight", Helvetica, Arial, sans-serif`;
const TAU = Math.PI * 2;

/** Inicio de la palabra k de la frase p (tiempo de vídeo). */
const w = (p, k) => phrases[p].words[k].s;
const we = (p, k) => phrases[p].words[k].e;

// ---------------------------------------------------------------------------
// Utilidades tipográficas
const widthCache = new Map();
function letterWidths(ctx, s) {
  const key = ctx.font + '|' + s;
  let v = widthCache.get(key);
  if (!v) { v = [...s].map((ch) => ctx.measureText(ch).width); widthCache.set(key, v); }
  return v;
}
/** Ancho de un texto con su tracking (en em). */
function measure(ctx, s, size, weight = 800, track = -0.03) {
  ctx.font = FONT(weight, size);
  const ws = letterWidths(ctx, s);
  return ws.reduce((a, b) => a + b, 0) + track * size * (ws.length - 1);
}
/**
 * Dibuja un texto letra a letra. fn(i, n, ch) puede devolver
 * {dx, dy, rot, sx, sy, a, color, skip}. Devuelve {x0, width, xs[]}.
 */
function text(ctx, s, x, y, o) {
  const size = o.size, weight = o.weight ?? 800, track = (o.track ?? -0.03) * size;
  ctx.font = FONT(weight, size);
  ctx.textBaseline = 'alphabetic';
  const chars = [...s];
  const ws = letterWidths(ctx, s);
  const total = ws.reduce((a, b) => a + b, 0) + track * (chars.length - 1);
  let cx = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  const x0 = cx, xs = [];
  for (let i = 0; i < chars.length; i++) {
    const f = o.fn ? o.fn(i, chars.length, chars[i]) : null;
    xs.push(cx + ws[i] / 2);
    if (!(f && (f.skip || f.a <= 0))) {
      ctx.save();
      ctx.translate(cx + ws[i] / 2 + (f?.dx || 0), y + (f?.dy || 0));
      if (f?.rot) ctx.rotate(f.rot);
      if (f && (f.sx !== undefined || f.sy !== undefined)) ctx.scale(f.sx ?? 1, f.sy ?? 1);
      if (f && f.a !== undefined) ctx.globalAlpha *= clamp(f.a);
      ctx.fillStyle = f?.color || o.color;
      if (o.stroke) { ctx.strokeStyle = f?.color || o.color; ctx.lineWidth = o.stroke; ctx.strokeText(chars[i], -ws[i] / 2, 0); }
      else ctx.fillText(chars[i], -ws[i] / 2, 0);
      ctx.restore();
    }
    cx += ws[i] + track;
  }
  return { x0, width: total, xs, ws };
}
/** Entrada estándar: cada letra sube desde abajo con rebote, escalonada. */
const rise = (T, t0, size, st = 0.03, d = 0.34) => (i) => {
  const u = invLerp(t0 + i * st, t0 + i * st + d, T);
  if (u <= 0) return { a: 0 };
  return { dy: (1 - easeOutBack(u)) * size * 0.55, a: clamp(u * 3) };
};
/** Entrada por máscara de línea (las letras emergen de la línea base). */
function masked(ctx, x0, y, width, size, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 40, y - size * 1.05, width + 80, size * 1.3);
  ctx.clip();
  draw();
  ctx.restore();
}
const fromBelow = (T, t0, size, st = 0.025, d = 0.3) => (i) => {
  const u = easeOut(invLerp(t0 + i * st, t0 + i * st + d, T));
  return u <= 0 ? { a: 0 } : { dy: (1 - u) * size * 1.05 };
};

function rect(ctx, x, y, w2, h2, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w2, h2); }
function circle(ctx, x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); ctx.fill(); }
function bg(ctx, color) { ctx.fillStyle = color; ctx.fillRect(-200, -200, W + 400, H + 400); }

/** Ataúd de perfil (hexágono alargado). */
function coffin(ctx, cx, cy, w2, h2, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - w2 / 2, cy);
  ctx.lineTo(cx - w2 / 2 + h2 * 0.5, cy - h2 / 2);
  ctx.lineTo(cx + w2 / 2 - h2 * 0.35, cy - h2 / 2);
  ctx.lineTo(cx + w2 / 2, cy - h2 * 0.1);
  ctx.lineTo(cx + w2 / 2, cy + h2 * 0.1);
  ctx.lineTo(cx + w2 / 2 - h2 * 0.35, cy + h2 / 2);
  ctx.lineTo(cx - w2 / 2 + h2 * 0.5, cy + h2 / 2);
  ctx.closePath();
  ctx.fill();
}
/** La manzana: círculo rojo con rabito y hoja. */
function apple(ctx, x, y, r, rot = 0, squash = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(1 + squash, 1 - squash);
  circle(ctx, 0, 0, r, C.red);
  ctx.strokeStyle = C.black;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.09;
  ctx.beginPath(); ctx.moveTo(0, -r * 0.85); ctx.quadraticCurveTo(r * 0.05, -r * 1.15, r * 0.18, -r * 1.3); ctx.stroke();
  ctx.fillStyle = C.blue;
  ctx.beginPath(); ctx.ellipse(r * 0.45, -r * 1.12, r * 0.38, r * 0.15, -0.45, 0, TAU); ctx.fill();
  ctx.restore();
}

/** «UNA MANZANA / PARA LA SED» en dos líneas; cada palabra entra con una nota. */
function titleLines(ctx, T, notes, y0, size) {
  const lines = [[['UNA', 0], ['MANZANA', 1]], [['PARA', 2], ['LA', 3], ['SED', 4]]];
  const space = measure(ctx, ' ', size, 900) + size * -0.03;
  lines.forEach((ln, li) => {
    const y = y0 + li * size * 0.95;
    const tot = ln.reduce((a, [wd]) => a + measure(ctx, wd, size, 900), 0) + space * (ln.length - 1);
    let x = 960 - tot / 2;
    for (const [wd, k] of ln) {
      const wdt = measure(ctx, wd, size, 900);
      masked(ctx, x, y, wdt, size, () => text(ctx, wd, x, y, { size, weight: 900, color: li === 0 ? C.blue : C.black, fn: fromBelow(T, notes[k] - 0.05, size) }));
      x += wdt + space;
    }
  });
}

// ---------------------------------------------------------------------------
// Partículas de texto (se muestrean una vez)
const pointsCache = new Map();
function textPoints(str, size, weight, step) {
  const key = `${str}|${size}|${weight}|${step}`;
  if (pointsCache.has(key)) return pointsCache.get(key);
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = FONT(weight, size);
  const wd = Math.ceil(g.measureText(str).width + 40);
  c.width = wd; c.height = Math.ceil(size * 1.3);
  g.font = FONT(weight, size);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#000';
  g.fillText(str, 20, size);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  const r = mulberry32(str.length * 31 + size);
  for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) {
    if (d[(y * c.width + x) * 4 + 3] > 128) pts.push({ x: x - 20, y: y - size, r1: r(), r2: r(), r3: r() });
  }
  const res = { pts, width: wd - 40 };
  pointsCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
// Sacudidas de cámara en los golpes de la banda sonora
const SHAKES = [
  { t: cue('amén'), a: 16 },
  ...[0, 1, 2, 3].map((i) => ({ t: cue('cuatro') + i * 0.24, a: 9 })),
  { t: cue('retiraron'), a: 7 }, { t: cue('retiraron') + 0.32, a: 6 }, { t: cueEnd('travesaños') + 0.1, a: 8 },
  { t: cue('fosa') + 0.05, a: 34 },
  { t: cue('volvían'), a: 6 },
  { t: cue('fiesta'), a: 18 },
  { t: APPLE_LAND, a: 26 }, { t: APPLE_LAND + APPLE_BOUNCE, a: 8 },
];
function shake(T) {
  let x = 0, y = 0, r = 0;
  for (const s of SHAKES) {
    const dt = T - s.t;
    if (dt < 0 || dt > 0.8) continue;
    const e = s.a * Math.exp(-dt * 9);
    x += Math.sin(dt * 70 + s.t) * e;
    y += Math.cos(dt * 83 + s.t * 2) * e;
    r += Math.sin(dt * 55) * e * 0.0006;
  }
  return { x, y, r };
}

// ---------------------------------------------------------------------------
// Escenas
const SCENES = [];
const scene = (t0, tr, ink, draw) => SCENES.push({ t0, tr, ink, draw });

// 0 · Intro: la manzana y el título, nota a nota del tema de la caja de música
scene(0, null, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const pop = easeOutBack(invLerp(0.05, 0.55, T));
  const notes = [0.45, 0.9, 1.35, 1.8, 2.55, 3.0, 3.45];
  let pulse = 0;
  for (const n of notes) pulse += Math.exp(-Math.max(0, T - n) * 9) * (T > n ? 1 : 0);
  // destellos que salen de la manzana en cada nota
  const rr = mulberry32(3);
  notes.forEach((n, k) => {
    const u = invLerp(n, n + 0.9, T);
    if (u <= 0 || u >= 1) return;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + k * 0.4, d = 170 + easeOut(u) * 160;
      circle(ctx, 960 + Math.cos(a) * d, 400 + Math.sin(a) * d, 7 * (1 - u), i % 2 ? C.blue : C.red);
    }
  });
  apple(ctx, 960, 400, 150 * pop * (1 + pulse * 0.05), Math.sin(T * 2) * 0.05);
  titleLines(ctx, T, [0.45, 0.9, 1.35, 1.8, 2.55], 790, 150);
  text(ctx, 'UNA LOCUCIÓN EN 25 FRASES', 960, 1010, { size: 26, weight: 700, color: C.black, align: 'center', track: 0.2, fn: (i) => ({ a: ramp(T, 2.6 + i * 0.01, 2.9 + i * 0.01) }) });
});

// 1 · «El cura dijo amén»: la palabra cae como una campanada
scene(3.6, { type: 'circle', cx: 960, cy: 400, dur: 0.45 }, C.black, (ctx, T) => {
  bg(ctx, C.red);
  const ta = cue('amén');
  // ondas de la campana
  for (let i = 0; i < 4; i++) {
    const u = invLerp(ta + i * 0.18, ta + i * 0.18 + 1.6, T);
    if (u <= 0 || u >= 1) continue;
    ctx.strokeStyle = C.paper;
    ctx.globalAlpha = 1 - u;
    ctx.lineWidth = 14 * (1 - u) + 2;
    ctx.beginPath(); ctx.arc(960, 760, 100 + easeOut(u) * 1100, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const s1 = 150;
  [['EL', 0, 0], ['CURA', 0, 1], ['DIJO', 1, 2]].forEach(([wd, line, k]) => {
    const x = line === 0 && k === 1 ? 140 + measure(ctx, 'EL ', s1, 900) : 140;
    const y = 250 + line * 150;
    masked(ctx, x, y, measure(ctx, wd, s1, 900), s1, () => text(ctx, wd, x, y, { size: s1, weight: 900, color: C.black, fn: fromBelow(T, w(0, k), s1) }));
  });
  // AMÉN: golpe desde muy grande
  const u = invLerp(ta - 0.04, ta + 0.16, T);
  if (u > 0) {
    const sc = lerp(2.4, 1, easeOut(u));
    ctx.save();
    ctx.translate(960, 820);
    ctx.scale(sc, sc);
    ctx.globalAlpha = clamp(u * 2);
    text(ctx, 'AMÉN', 0, 0, { size: 400, weight: 900, color: C.paper, align: 'center', track: -0.05 });
    ctx.restore();
  }
  // «y…»: arranca la frase siguiente
  text(ctx, 'y', 1780, 1000, { size: 90, weight: 800, color: C.black, align: 'right', fn: rise(T, w(1, 0), 90) });
});

// 2 · «…el silencio se extendió por todo el valle»: la palabra se estira hasta los bordes
scene(5.62, { type: 'dots', dur: 0.4 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const t0 = w(1, 2);
  const ext = easeInOut(invLerp(w(1, 4) - 0.3, cueEnd('valle') + 0.2, T));
  text(ctx, 'el', 140, 300, { size: 80, weight: 700, color: C.blue, fn: rise(T, w(1, 1), 80) });
  // SILENCIO: el tracking crece hasta cubrir todo el ancho y la tinta se adelgaza
  const size = 230;
  const n = 8;
  const base = measure(ctx, 'SILENCIO', size, 900, -0.03);
  const track = lerp(-0.03, (1700 - base) / (size * (n - 1)) - 0.03, ext);
  const fillA = 1 - ext * 0.9;
  text(ctx, 'SILENCIO', 960, 560, { size, weight: 900, color: C.blue, align: 'center', track, fn: (i) => {
    const r = rise(T, t0, size, 0.04)(i);
    return { ...r, a: (r.a ?? 1) * fillA };
  } });
  if (ext > 0.05) {
    ctx.globalAlpha = ext;
    text(ctx, 'SILENCIO', 960, 560, { size, weight: 900, color: C.blue, align: 'center', track, stroke: 3 });
    ctx.globalAlpha = 1;
  }
  const t2 = lerp(-0.02, 0.6, ext);
  text(ctx, 'SE EXTENDIÓ', 960, 700, { size: 70, weight: 800, color: C.black, align: 'center', track: t2, fn: (i) => (i < 2 ? rise(T, w(1, 3), 70)(i) : rise(T, w(1, 4), 70)(i - 2)) });
  // el valle: líneas onduladas que se dibujan y se van aplanando (el silencio)
  for (let L = 0; L < 3; L++) {
    const draw = easeInOut(invLerp(w(1, 5) + L * 0.12, w(1, 8) + 0.5 + L * 0.12, T));
    if (draw <= 0) continue;
    const flat = ramp(T, w(1, 8), w(1, 8) + 1.0);
    const amp = (40 - L * 10) * (1 - flat);
    ctx.strokeStyle = L === 1 ? C.red : C.blue;
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (let x = 0; x <= W * draw; x += 12) {
      const y = 860 + L * 34 + Math.sin(x * 0.006 + L * 1.7 + T * 1.5) * amp + Math.sin(x * 0.013 + L) * amp * 0.4;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  text(ctx, 'POR TODO EL VALLE.', 140, 1000, { size: 46, weight: 700, color: C.black, track: 0.08, fn: (i) => {
    const k = i < 4 ? 5 : i < 9 ? 6 : i < 12 ? 7 : 8;
    return rise(T, w(1, k), 46, 0.02)(i);
  } });
});

// 3 · «Cuatro hombres levantaron el ataúd»: cuatro barras al ritmo de los timbales
const COF = { x: 960, w: 960, h: 190 };
scene(8.45, { type: 'wipeUp', dur: 0.38 }, C.paper, (ctx, T) => {
  bg(ctx, C.blue);
  const lift = easeOut(invLerp(w(2, 2), w(2, 2) + 1.0, T)) * 110;
  for (let i = 0; i < 4; i++) {
    const t = cue('cuatro') + i * 0.24;
    const u = invLerp(t - 0.1, t, T);
    if (u <= 0) continue;
    const sq = Math.exp(-Math.max(0, T - t) * 10) * 0.2;
    const hgt = 560 * easeIn(u);
    ctx.save();
    ctx.translate(200 + i * 92, 130 - lift);
    ctx.scale(1 + sq, 1 - sq);
    rect(ctx, -26, 0, 52, hgt, C.red);
    ctx.restore();
  }
  text(ctx, 'CUATRO', 620, 380 - lift, { size: 210, weight: 900, color: C.paper, fn: rise(T, w(2, 0), 210) });
  text(ctx, 'HOMBRES', 620, 590 - lift, { size: 210, weight: 900, color: C.paper, fn: rise(T, w(2, 1), 210) });
  text(ctx, 'LEVANTARON', 620, 720 - lift, { size: 96, weight: 800, color: C.red, track: 0.04, fn: (i) => {
    const u = easeOut(invLerp(w(2, 2) + i * 0.03, w(2, 2) + i * 0.03 + 0.5, T));
    return u <= 0 ? { a: 0 } : { dy: (1 - u) * 160, a: u };
  } });
  // el ataúd sube desde abajo
  const cu = easeOutBack(invLerp(w(2, 3) - 0.1, w(2, 4) + 0.4, T));
  const cy = lerp(H + 200, 920, cu);
  coffin(ctx, COF.x, cy, COF.w, COF.h, C.black);
  text(ctx, 'EL ATAÚD', COF.x, cy + 34, { size: 92, weight: 900, color: C.paper, align: 'center', fn: (i) => (i < 2 ? rise(T, w(2, 3), 92)(i) : rise(T, w(2, 4), 92)(i - 3)) });
});

// 4 · «tirando de cuatro cabos de soga»: el ataúd queda colgado de cuatro cuerdas
scene(10.95, { type: 'cut', dur: 0 }, C.paper, (ctx, T) => {
  bg(ctx, C.blue);
  const t0 = 10.95;
  const move = easeInOut(invLerp(t0, t0 + 0.5, T));
  const cy = lerp(920, 560, move);
  const vib = win(T, cue('cabos') - 0.2, cue('cabos'), cueEnd('soga'), cueEnd('soga') + 0.4);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const ends = [[0, 0], [W, 0], [0, H], [W, H]];
  corners.forEach(([sx, sy], i) => {
    const d = easeOut(invLerp(w(3, 0) + i * 0.12, w(3, 0) + i * 0.12 + 0.4, T));
    if (d <= 0) return;
    const ax = COF.x + sx * COF.w * 0.42, ay = cy + sy * COF.h * 0.4;
    const bx = lerp(ax, ends[i][0], d), by = lerp(ay, ends[i][1], d);
    const mx = (ax + bx) / 2 + Math.sin(T * 50 + i) * 14 * vib, my = (ay + by) / 2 + Math.cos(T * 47 + i) * 14 * vib;
    ctx.strokeStyle = C.paper;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(mx, my, bx, by); ctx.stroke();
  });
  // TIRANDO: se estira como si tiraran de ella
  const pull = easeOutBack(invLerp(w(3, 0), w(3, 0) + 0.6, T));
  ctx.save();
  ctx.translate(960, 250);
  ctx.scale(lerp(0.6, 1.25, pull) + Math.sin(T * 40) * 0.01 * vib, 1);
  text(ctx, 'TIRANDO', 0, 0, { size: 170, weight: 900, color: C.paper, align: 'center', fn: rise(T, w(3, 0), 170, 0.02) });
  ctx.restore();
  coffin(ctx, COF.x, cy, COF.w, COF.h, C.black);
  text(ctx, 'EL ATAÚD', COF.x, cy + 34, { size: 92, weight: 900, color: C.paper, align: 'center' });
  const line = 'DE CUATRO CABOS DE SOGA,';
  const ks = [1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 5, 5, 5, 5, 5];
  text(ctx, line, 960, 900, { size: 84, weight: 900, color: C.red, align: 'center', fn: (i) => {
    const k = ks[i] ?? 5;
    const r = rise(T, w(3, k), 84, 0.015)(i);
    return { ...r, dy: (r.dy || 0) + Math.sin(T * 45 + i) * 3 * vib };
  } });
});

// 5 · «otros dos retiraron los travesaños»: dos barras que se van, cada una a un lado
scene(13.28, { type: 'slicesH', dur: 0.36 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const s = 230;
  const inL = easeOutBack(invLerp(w(4, 0), w(4, 0) + 0.4, T));
  const inR = easeOutBack(invLerp(w(4, 1), w(4, 1) + 0.4, T));
  const wO = measure(ctx, 'OTROS', s, 900), wD = measure(ctx, 'DOS', s, 900);
  const gap = 50, tot = wO + gap + wD, x0 = 960 - tot / 2;
  text(ctx, 'OTROS', lerp(-wO - 50, x0, inL), 330, { size: s, weight: 900, color: C.black });
  text(ctx, 'DOS', lerp(W + 50, x0 + wO + gap, inR), 330, { size: s, weight: 900, color: C.red });
  // RETIRARON se separa con cada golpe de madera
  const k1 = easeOut(invLerp(cue('retiraron'), cue('retiraron') + 0.25, T));
  const k2 = easeOut(invLerp(cue('retiraron') + 0.32, cue('retiraron') + 0.6, T));
  text(ctx, 'RETIRARON', 960, 520, { size: 130, weight: 900, color: C.blue, align: 'center', track: -0.03 + 0.08 * k1 + 0.1 * k2, fn: rise(T, w(4, 2), 130, 0.02) });
  const out = easeIn(invLerp(cueEnd('travesaños') - 0.15, cueEnd('travesaños') + 0.35, T));
  [['LOS', 690, -1, w(4, 3)], ['TRAVESAÑOS', 850, 1, w(4, 4)]].forEach(([wd, y, dir, t]) => {
    const inn = easeOut(invLerp(t - 0.05, t + 0.3, T));
    if (inn <= 0) return;
    const off = dir * out * (W + 200);
    const bw = W * inn;
    const bx = (dir < 0 ? 0 : W - bw) + off;
    rect(ctx, bx, y - 62, bw, 124, C.black);
    ctx.save();
    ctx.beginPath(); ctx.rect(bx, y - 62, bw, 124); ctx.clip();
    text(ctx, wd, 960 + off, y + 38, { size: 108, weight: 900, color: C.paper, align: 'center', track: 0.12 });
    ctx.restore();
  });
});

// 6 · «y el pasado se hundió en la fosa»: las letras caen en la fosa y la fosa lo traga todo
scene(16.32, { type: 'pushUp', dur: 0.4 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const tf = cue('fosa');
  const holeTop = lerp(780, -200, easeIn(invLerp(tf, tf + 0.45, T)));
  const holeL = lerp(560, -200, easeIn(invLerp(tf, tf + 0.45, T))), holeR = W - holeL;
  text(ctx, 'Y EL', 140, 200, { size: 80, weight: 800, color: C.black, fn: (i) => (i < 1 ? rise(T, w(5, 0), 80)(i) : rise(T, w(5, 1), 80)(i - 2)) });
  text(ctx, 'SE HUNDIÓ', 1780, 200, { size: 80, weight: 800, color: C.red, align: 'right', fn: (i) => (i < 2 ? rise(T, w(5, 3), 80)(i) : rise(T, w(5, 4), 80)(i - 3)) });
  // PASADO: cada letra se precipita en la fosa; dentro de la oscuridad se vuelve papel
  const size = 280;
  const th = cue('hundió');
  const drawPasado = (color) => text(ctx, 'PASADO', 960, 600, { size, weight: 900, color, align: 'center', fn: (i) => {
    const r = rise(T, w(5, 2), size, 0.04)(i);
    const tfall = th + i * 0.09;
    const fu = Math.max(0, T - tfall);
    const dy = 0.5 * 2600 * fu * fu;
    return { ...r, dy: (r.dy || 0) + dy, rot: fu * (i % 2 ? 0.8 : -0.6) };
  } });
  ctx.save();
  ctx.beginPath(); ctx.rect(-200, -200, W + 400, holeTop + 200); ctx.clip();
  drawPasado(C.blue);
  ctx.restore();
  // la fosa
  rect(ctx, holeL, holeTop, holeR - holeL, H + 400, C.black);
  ctx.save();
  ctx.beginPath(); ctx.rect(holeL, holeTop, holeR - holeL, H + 400); ctx.clip();
  drawPasado(C.paper);
  ctx.restore();
  text(ctx, 'EN LA FOSA.', 960, 1000, { size: 64, weight: 900, color: C.paper, align: 'center', track: 0.3, fn: (i) => (i < 2 ? rise(T, w(5, 5), 64)(i) : i < 5 ? rise(T, w(5, 6), 64)(i - 3) : rise(T, w(5, 7), 64)(i - 6)) });
});

// 7 · «Genoveva … arrojar el primer puñado de tierra sobre su madrastra»
const G_ORIGIN = { x: 1080, y: 590 };
scene(19.45, { type: 'cut', dur: 0 }, C.paper, (ctx, T) => {
  bg(ctx, C.black);
  // GENOVEVA: letras que barajan caracteres antes de fijarse
  const tg = w(6, 0);
  const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const settle = (i) => tg + 0.3 + i * 0.06;
  const lay = text(ctx, 'GENOVEVA', 140, 300, { size: 220, weight: 900, color: C.red, fn: (i) => (T < settle(i) ? { skip: true } : {}) });
  ctx.font = FONT(900, 220);
  ctx.fillStyle = C.paper;
  ctx.textAlign = 'center';
  for (let i = 0; i < 8; i++) {
    if (T < tg + i * 0.03 || T >= settle(i)) continue;
    const ch = glyphs[Math.floor(hash(Math.floor(T * 24) * 13 + i) * glyphs.length)];
    ctx.fillText(ch, lay.xs[i], 300);
  }
  ctx.textAlign = 'left';
  text(ctx, 'TUVO EL HONOR', 140, 420, { size: 74, weight: 800, color: C.paper, track: 0.04, fn: (i) => (i < 4 ? rise(T, w(6, 1), 74)(i) : i < 7 ? rise(T, w(6, 2), 74)(i - 5) : rise(T, w(6, 3), 74)(i - 8)) });
  // ARROJAR: se echa hacia atrás y lanza
  const ta = THROWS[0].t;
  const wind = win(T, ta - 0.45, ta - 0.1, ta - 0.1, ta + 0.05);
  const fling = Math.exp(-Math.max(0, T - ta) * 6) * (T > ta ? 1 : 0);
  text(ctx, 'DE ARROJAR', 140, 600, { size: 150, weight: 900, color: C.paper, fn: (i) => {
    const r = i < 2 ? rise(T, w(6, 4), 150)(i) : rise(T, w(6, 5), 150)(i - 3);
    return { ...r, dx: -wind * 30 * (i / 10) + fling * 40 * (i / 10), rot: -wind * 0.08 + fling * 0.12 };
  } });
  text(ctx, 'EL PRIMER PUÑADO', 1780, 720, { size: 74, weight: 800, color: C.paper, align: 'right', track: 0.04, fn: (i) => (i < 2 ? rise(T, w(7, 0), 74)(i) : i < 9 ? rise(T, w(7, 1), 74)(i - 3) : rise(T, w(7, 2), 74)(i - 10)) });
  text(ctx, 'DE TIERRA', 1780, 880, { size: 170, weight: 900, color: C.red, align: 'right', fn: (i) => (i < 2 ? rise(T, w(7, 3), 170)(i) : rise(T, w(7, 4), 170)(i - 3)) });
  text(ctx, 'SOBRE SU MADRASTRA.', 140, 1010, { size: 54, weight: 800, color: C.paper, track: 0.1, fn: (i) => (i < 5 ? rise(T, w(7, 5), 54)(i) : i < 8 ? rise(T, w(7, 6), 54)(i - 6) : rise(T, w(7, 7), 54, 0.02)(i - 9)) });
  // el puñado: granos (los mismos tiempos que el sonido de la tierra)
  drawGrains(ctx, T, 0, G_ORIGIN, { x0: 160, x1: 1000, y: 950 }, [C.paper, C.red, '#B9B2A2']);
});

/** Granos de un lanzamiento: vuelo parabólico hasta una franja de aterrizaje y quedan allí. */
function drawGrains(ctx, T, throwIdx, origin, land, colors, arc = 260) {
  const th = THROWS[throwIdx];
  const r = mulberry32(900 + throwIdx);
  for (const g of GRAINS) {
    if (g.t0 < th.t || g.t0 > th.t + 0.2) continue;
    const lx = lerp(land.x0, land.x1, r()), ly = land.y - r() * 16;
    const col = colors[Math.floor(r() * colors.length)];
    const sz = 4 + g.size * 2;
    if (T < g.t0) continue;
    const u = clamp((T - g.t0) / g.dt);
    const x = lerp(origin.x, lx, u);
    const y = lerp(origin.y, ly, u) - arc * 4 * u * (1 - u);
    ctx.fillStyle = col;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.shade * 6 + u * 4);
    ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }
}

// 8 · «Después Eva se desvaneció»: EVA se deshace en partículas
scene(25.78, { type: 'dots', dur: 0.4 }, C.paper, (ctx, T) => {
  bg(ctx, C.blue);
  text(ctx, 'DESPUÉS', 140, 230, { size: 90, weight: 900, color: C.paper, track: 0.1, fn: rise(T, w(8, 0), 90) });
  const size = 560;
  const te = w(8, 1);
  const td = te + 0.35, tEnd = cueEnd('desvaneció') + 0.4;
  const { pts, width } = textPoints('EVA', size, 900, 6);
  const ox = 960 - width / 2, oy = 790;
  if (T < td) {
    const u = easeOutBack(invLerp(te, te + 0.35, T));
    ctx.save();
    ctx.translate(960, oy);
    ctx.scale(1, u);
    text(ctx, 'EVA', 0, 0, { size, weight: 900, color: C.paper, align: 'center', track: 0 });
    ctx.restore();
  } else {
    const u = invLerp(td, tEnd, T);
    ctx.fillStyle = C.paper;
    for (const p of pts) {
      const thr = (p.x / width) * 0.7 + p.r1 * 0.3;
      const lt = u * 1.4 - thr;
      if (lt <= 0) { ctx.fillStyle = C.paper; ctx.fillRect(ox + p.x - 3.5, oy + p.y - 3.5, 7, 7); continue; }
      const tt = lt * 2.6 + Math.max(0, T - tEnd) * 1.2;
      const fade = 1 - clamp(tt * 0.5);
      if (fade <= 0) continue;
      const dx = (tt * 260 + tt * tt * 120) * (0.6 + p.r2);
      const dy = -(tt * 140 + tt * tt * 60) * (0.3 + p.r3) + Math.sin(tt * 4 + p.r1 * 9) * 20;
      const sz = 7 * fade;
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.r3 > 0.85 ? C.red : C.paper;
      ctx.fillRect(ox + p.x + dx - sz / 2, oy + p.y + dy - sz / 2, sz, sz);
    }
  }
  text(ctx, 'SE DESVANECIÓ', 1780, 1000, { size: 70, weight: 800, color: C.paper, align: 'right', track: lerp(0.04, 0.5, ramp(T, w(8, 3), tEnd)), fn: (i) => {
    const r = i < 2 ? rise(T, w(8, 2), 70)(i) : rise(T, w(8, 3), 70)(i - 3);
    return { ...r, a: (r.a ?? 1) * (1 - ramp(T, w(8, 3) + 0.3 + i * 0.05, tEnd + 0.3 + i * 0.05)) };
  } });
});

// 9 · «y el chico se quedó solo, al borde de la tumba»
scene(28.38, { type: 'wipeLeft', dur: 0.36 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const ts = cue('solo');
  const scatter = easeIn(invLerp(ts - 0.1, ts + 0.7, T));
  const lines = [['Y EL CHICO', 430, [0, 1, 2]], ['SE QUEDÓ', 580, [3, 4]]];
  lines.forEach(([str, y, ks]) => {
    text(ctx, str, 960, y, { size: 140, weight: 900, color: C.black, align: 'center', fn: (i, n) => {
      const parts = str.split(' ');
      let acc = 0, k = 0;
      for (let p = 0; p < parts.length; p++) { if (i < acc + parts[p].length) { k = p; break; } acc += parts[p].length + 1; }
      const r = rise(T, w(9, ks[k]), 140)(i - acc);
      const ang = (i / n) * TAU + hash(i + y) * 2;
      return { ...r, dx: Math.cos(ang) * scatter * 1400, dy: (r.dy || 0) + Math.sin(ang) * scatter * 900, rot: scatter * (hash(i) - 0.5) * 4, a: (r.a ?? 1) * (1 - scatter) };
    } });
  });
  // la tumba sube y SOLO queda en su borde
  const tb = w(10, 0);
  const tombY = lerp(H + 40, 640, easeOutBack(invLerp(tb - 0.15, tb + 0.45, T)));
  rect(ctx, 0, tombY, W, H, C.black);
  const soloY = Math.min(520, tombY - 6);
  text(ctx, 'SOLO,', 960, soloY, { size: 44, weight: 900, color: C.red, align: 'center', track: 0.1, fn: rise(T, ts, 44) });
  text(ctx, 'AL BORDE DE LA TUMBA,', 140, tombY + 110, { size: 70, weight: 900, color: C.paper, track: 0.06, fn: (i) => {
    const k = i < 2 ? 0 : i < 8 ? 1 : i < 11 ? 2 : i < 14 ? 3 : 4;
    return rise(T, w(10, k), 70, 0.015)(i);
  } });
});

// 10 · «mirando los pies de los que se acercaban»: huellas al ritmo de los pasos
const STEPS = footfalls().filter((t) => t > 31.6 && t < 35.4);
scene(31.78, { type: 'pushUp', dur: 0.4 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  text(ctx, 'MIRANDO', 140, 220, { size: 130, weight: 900, color: C.black, fn: (i) => {
    const r = rise(T, w(11, 0), 130)(i);
    return { ...r, rot: ramp(T, w(11, 0) + 0.3, w(11, 0) + 0.9) * 0.35 };
  } });
  text(ctx, 'LOS', 140, 330, { size: 70, weight: 800, color: C.black, fn: rise(T, w(11, 1), 70) });
  // huellas rojas, alternando pie izquierdo y derecho
  STEPS.forEach((t, k) => {
    const a = win(T, t - 0.02, t + 0.05, t + 1.6, t + 2.2);
    if (a <= 0) return;
    const x = 120 + k * 170, y = 600 + (k % 2 ? 46 : -46);
    const pop = easeOutBack(invLerp(t - 0.02, t + 0.15, T));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 2);
    ctx.scale(pop, pop);
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.ellipse(0, -18, 24, 34, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 36, 17, 20, 0, 0, TAU); ctx.fill();
    ctx.restore();
  });
  // PIES, a ras del borde inferior
  text(ctx, 'PIES', 960, H + 70, { size: 520, weight: 900, color: C.blue, align: 'center', track: -0.05, fn: (i) => {
    const u = easeOutBack(invLerp(w(11, 2) + i * 0.05, w(11, 2) + i * 0.05 + 0.35, T));
    // en cada paso saltan las letras pares o las impares, como pies que se alternan
    let n = 0, last = -9;
    for (const t of STEPS) if (t <= T) { n++; last = t; }
    const hop = i % 2 === n % 2 ? Math.exp(-(T - last) * 10) * 40 : 0;
    return u <= 0 ? { a: 0 } : { dy: (1 - u) * 400 - hop };
  } });
  // DE LOS QUE SE ACERCABAN: crece al acercarse
  const ta = w(11, 7);
  const grow = easeIn(invLerp(ta, ta + 0.7, T));
  text(ctx, 'DE LOS QUE SE', 1780, 300, { size: 64, weight: 800, color: C.black, align: 'right', track: 0.06, fn: (i) => {
    const k = i < 2 ? 3 : i < 6 ? 4 : i < 10 ? 5 : 6;
    return rise(T, w(11, k), 64)(i);
  } });
  ctx.save();
  ctx.translate(1780, 430);
  ctx.scale(lerp(1, 1.9, grow), lerp(1, 1.9, grow));
  text(ctx, 'ACERCABAN', 0, 0, { size: 96, weight: 900, color: C.red, align: 'right', fn: rise(T, ta, 96) });
  ctx.restore();
});

// 11 · «a tirar el triste tributo de un puñado de tierra sobre el féretro»
const F_COFFIN = { x: 960, y: 935, w: 1100, h: 170 };
scene(34.82, { type: 'wipeRight', dur: 0.36 }, C.black, (ctx, T) => {
  bg(ctx, C.red);
  text(ctx, 'A TIRAR', 140, 200, { size: 84, weight: 900, color: C.paper, track: 0.08, fn: (i) => (i < 1 ? rise(T, w(12, 0), 84)(i) : rise(T, w(12, 1), 84)(i - 2)) });
  text(ctx, 'EL TRISTE', 140, 370, { size: 170, weight: 900, color: C.black, fn: (i) => (i < 2 ? rise(T, w(12, 2), 170)(i) : rise(T, w(12, 3), 170)(i - 3)) });
  text(ctx, 'TRIBUTO', 140, 570, { size: 220, weight: 900, color: C.paper, fn: rise(T, w(12, 4), 220) });
  text(ctx, 'DE UN PUÑADO DE TIERRA', 1780, 720, { size: 64, weight: 800, color: C.black, align: 'right', track: 0.06, fn: (i) => {
    const k = i < 2 ? 0 : i < 5 ? 1 : i < 12 ? 2 : i < 15 ? 3 : 4;
    return rise(T, w(13, k), 64, 0.015)(i);
  } });
  coffin(ctx, F_COFFIN.x, F_COFFIN.y, F_COFFIN.w, F_COFFIN.h, C.black);
  text(ctx, 'SOBRE EL FÉRETRO.', F_COFFIN.x, F_COFFIN.y + 26, { size: 72, weight: 900, color: C.paper, align: 'center', track: 0.12, fn: (i) => (i < 5 ? rise(T, w(13, 5), 72)(i) : i < 8 ? rise(T, w(13, 6), 72)(i - 6) : rise(T, w(13, 7), 72)(i - 9)) });
  // cinco puñados, uno tras otro, que caen sobre la tapa
  for (let k = 1; k <= 5; k++) {
    const fromRight = k % 2 === 0;
    drawGrains(ctx, T, k, { x: fromRight ? 1850 : 1500, y: 380 + k * 30 }, { x0: 520, x1: 1400, y: F_COFFIN.y - F_COFFIN.h / 2 }, [C.paper, C.black, C.blue], 180);
  }
});

// 12 · «Luego, uno tras otro, disciplinadamente apesadumbrados»: marcha a golpes
function marchX(T) {
  // posición de la fila: avanza a pasos (0.5 s) y se detiene (0.7 s), como la procesión
  const mt = T - PROC.marchStart;
  if (mt < 0) return 0;
  const k = Math.floor(mt / PROC.marchCycle), f = mt - k * PROC.marchCycle;
  return (k + (f < PROC.marchStep ? easeInOut(f / PROC.marchStep) : 1)) * 170;
}
function marchBeat(T) {
  const mt = T - PROC.marchStart;
  if (mt < 0) return 0;
  const f = mt % PROC.marchCycle;
  return Math.exp(-f * 10);
}
scene(39.45, { type: 'slicesV', dur: 0.36 }, C.paper, (ctx, T) => {
  bg(ctx, C.blue);
  text(ctx, 'LUEGO,', 140, 220, { size: 120, weight: 900, color: C.paper, fn: rise(T, w(14, 0), 120) });
  // fila de UNO · TRAS · OTRO que marcha
  const row = ['UNO', 'TRAS', 'OTRO'];
  const mx = marchX(T);
  const appear = [w(14, 1), w(14, 2), w(14, 3)];
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 300, W, 200); ctx.clip();
  for (let k = -6; k < 10; k++) {
    const wd = row[((k % 3) + 3) % 3];
    const x = -600 + k * 340 + mx;
    const bob = marchBeat(T) * 18;
    const show = k >= 3 && k <= 5 ? ramp(T, appear[k - 3] - 0.05, appear[k - 3] + 0.15) : ramp(T, w(14, 3) + 0.3, w(14, 3) + 0.6);
    text(ctx, wd, x, 450 + bob, { size: 120, weight: 900, color: k % 3 === 0 ? C.red : C.paper, fn: () => ({ a: show }) });
  }
  ctx.restore();
  // DISCIPLINADAMENTE: rejilla rígida; en cada paso todas las letras dan un golpe a la vez
  const td = w(15, 0);
  text(ctx, 'DISCIPLINADAMENTE', 960, 700, { size: 150, weight: 900, color: C.paper, align: 'center', track: -0.02, fn: (i) => {
    const u = invLerp(td + i * 0.025, td + i * 0.025 + 0.12, T);
    if (u <= 0) return { a: 0 };
    return { sy: 1 - marchBeat(T) * 0.25, dy: 0 };
  } });
  // APESADUMBRADOS: las letras se vencen por el peso
  const tp = w(15, 1);
  text(ctx, 'APESADUMBRADOS,', 960, 900, { size: 120, weight: 900, color: C.black, align: 'center', fn: (i, n) => {
    const r = rise(T, tp, 120, 0.03)(i);
    const sag = easeOutBack(invLerp(tp + 0.4 + i * 0.05, tp + 1.1 + i * 0.05, T));
    const mid = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2);
    return { ...r, dy: (r.dy || 0) + sag * (1 - mid * mid) * 70, rot: sag * (i < n / 2 ? 0.25 : -0.25) * mid };
  } });
});

// 13 · «iban a estrechar la mano de cada familiar que formaba la guardia»: palabras que se dan la mano
const MEET = [
  { l: 'ESTRECHAR', r: 'LA MANO', y: 400, tl: w(16, 2), tr: w(16, 4), lc: C.blue, rc: C.black },
  { l: 'DE CADA', r: 'FAMILIAR', y: 590, tl: w(16, 5), tr: w(16, 7), lc: C.blue, rc: C.black },
  { l: 'QUE FORMABA', r: 'LA GUARDIA,', y: 780, tl: w(17, 0), tr: w(17, 3), lc: C.blue, rc: C.black },
];
scene(44.42, { type: 'dots', dur: 0.4 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  text(ctx, 'IBAN A', 140, 200, { size: 84, weight: 900, color: C.black, track: 0.06, fn: (i) => (i < 4 ? rise(T, w(16, 0), 84)(i) : rise(T, w(16, 1), 84)(i - 5)) });
  for (const m of MEET) {
    const size = 130;
    const wl = measure(ctx, m.l, size, 900), wr = measure(ctx, m.r, size, 900);
    const ul = easeOut(invLerp(m.tl - 0.05, m.tl + 0.35, T));
    const ur = easeOut(invLerp(m.tr - 0.25, m.tr + 0.05, T));
    const hit = m.tr + 0.05;
    const k = Math.exp(-Math.max(0, T - hit) * 8) * (T > hit ? 1 : 0);
    const gap = 26;
    const xl = lerp(-wl - 40, 960 - gap - wl, ul) - k * 14;
    const xr = lerp(W + 40, 960 + gap, ur) + k * 14;
    if (ul > 0) text(ctx, m.l, xl, m.y, { size, weight: 900, color: m.lc });
    if (ur > 0) text(ctx, m.r, xr, m.y, { size, weight: 900, color: m.rc });
    // chispa del apretón
    if (T > hit) {
      const u = invLerp(hit, hit + 0.6, T);
      circle(ctx, 960, m.y - size * 0.36, 22 * (1 - u * 0.4) + 8, C.red);
      if (u < 1) {
        ctx.strokeStyle = C.red; ctx.lineWidth = 6 * (1 - u);
        ctx.beginPath(); ctx.arc(960, m.y - size * 0.36, 30 + easeOut(u) * 120, 0, TAU); ctx.stroke();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          circle(ctx, 960 + Math.cos(a) * (40 + easeOut(u) * 160), m.y - size * 0.36 + Math.sin(a) * (40 + easeOut(u) * 110), 6 * (1 - u), i % 2 ? C.blue : C.red);
        }
      }
    }
  }
});

// 14 · «volvían la cabeza hacia el extremo del cementerio»: giro y barrido hasta las cruces
const CROSSES = Array.from({ length: 70 }, (_, i) => ({ x: (i % 14) * 132 + 70 + ((i / 14 | 0) % 2) * 66, y: 230 + (i / 14 | 0) * 150, d: hash(i * 3.3) }));
scene(48.6, { type: 'cut', dur: 0 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const pan = easeInOut(invLerp(49.85, 50.3, T));
  // panel A: VOLVÍAN LA CABEZA (giran sobre su eje)
  ctx.save();
  ctx.translate(-pan * W * 1.1, 0);
  const flip = (t0, i) => {
    const u = invLerp(t0 + i * 0.03, t0 + i * 0.03 + 0.45, T);
    return Math.cos(easeInOut(u) * TAU);
  };
  text(ctx, 'VOLVÍAN', 960, 440, { size: 220, weight: 900, color: C.black, align: 'center', fn: (i) => ({ ...rise(T, w(18, 0) - 0.1, 220)(i), sx: flip(w(18, 0), i) }) });
  text(ctx, 'LA CABEZA', 960, 680, { size: 220, weight: 900, color: C.red, align: 'center', fn: (i) => ({ ...(i < 2 ? rise(T, w(18, 1), 220)(i) : rise(T, w(18, 2), 220)(i - 3)), sx: flip(w(18, 2), i) }) });
  text(ctx, 'HACIA EL', 1780, 900, { size: 84, weight: 900, color: C.blue, align: 'right', track: 0.06, fn: (i) => (i < 5 ? rise(T, w(18, 3), 84)(i) : rise(T, w(18, 4), 84)(i - 6)) });
  ctx.restore();
  // panel B: el extremo del cementerio, un campo de cruces
  ctx.save();
  ctx.translate((1 - pan) * W * 1.1, 0);
  if (pan > 0) {
    for (const c of CROSSES) {
      const u = easeOutBack(invLerp(50.1 + c.d * 0.7, 50.4 + c.d * 0.7, T));
      if (u <= 0) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(u, u);
      rect(ctx, -5, -34, 10, 68, C.blue);
      rect(ctx, -22, -18, 44, 10, C.blue);
      ctx.restore();
    }
    text(ctx, 'EXTREMO', W - 60, 330, { size: 210, weight: 900, color: C.black, align: 'right', fn: rise(T, Math.max(w(18, 5), 50.0), 210) });
    rect(ctx, 0, 520, W, 230, C.black);
    text(ctx, 'DEL CEMENTERIO,', 960, 690, { size: 150, weight: 900, color: C.paper, align: 'center', fn: (i) => (i < 3 ? rise(T, w(18, 6), 150)(i) : rise(T, w(18, 7), 150, 0.025)(i - 4)) });
  }
  ctx.restore();
});

// 15 · «saludaban a la sobrina con la boina»: la palabra saluda y la boina cae
scene(51.72, { type: 'wipeDown', dur: 0.34 }, C.paper, (ctx, T) => {
  bg(ctx, C.blue);
  const ts = w(19, 0);
  text(ctx, 'SALUDABAN', 960, 330, { size: 210, weight: 900, color: C.paper, align: 'center', fn: (i) => {
    const r = rise(T, ts, 210)(i);
    const wave = ramp(T, ts + 0.3, ts + 0.6) * Math.sin(T * 9 - i * 0.7) * 26;
    return { ...r, dy: (r.dy || 0) + wave, rot: wave * 0.004 };
  } });
  text(ctx, 'A LA SOBRINA', 960, 510, { size: 110, weight: 900, color: C.paper, align: 'center', track: 0.04, fn: (i) => (i < 1 ? rise(T, w(19, 1), 110)(i) : i < 4 ? rise(T, w(19, 2), 110)(i - 2) : rise(T, w(19, 3), 110)(i - 5)) });
  text(ctx, 'CON LA', 960, 660, { size: 84, weight: 900, color: C.black, align: 'center', track: 0.1, fn: (i) => (i < 3 ? rise(T, w(19, 4), 84)(i) : rise(T, w(19, 5), 84)(i - 4)) });
  const tb = w(19, 6);
  const r = text(ctx, 'BOINA,', 960, 950, { size: 280, weight: 900, color: C.paper, align: 'center', fn: rise(T, tb, 280, 0.03) });
  // boina roja sobre la «O»
  const ox = r.xs[1], oy = 950 - 280 * 0.74;
  const fall = invLerp(tb + 0.1, tb + 0.45, T);
  if (fall > 0) {
    const bounce = fall >= 1 ? Math.exp(-(T - tb - 0.45) * 8) * Math.sin((T - tb - 0.45) * 30) * 10 : 0;
    const by = lerp(-150, oy - 6, easeIn(fall)) - Math.abs(bounce);
    ctx.save();
    ctx.translate(ox + 10, by);
    ctx.rotate(-0.22 + bounce * 0.01);
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.ellipse(0, 0, 120, 40, 0, 0, TAU); ctx.fill();
    ctx.fillRect(-6, -60, 12, 26);
    ctx.restore();
  }
  // las tres notas del tema de la manzana
  [0, 0.16, 0.32].forEach((dt, k) => {
    const u = invLerp(tb + dt, tb + dt + 0.7, T);
    if (u > 0 && u < 1) circle(ctx, ox + 200 + k * 70, oy - 120 - easeOut(u) * 120, 16 * (1 - u) + 4, C.red);
  });
});

// 16 · «se santiguaban»: una cruz roja trazada en dos golpes
scene(54.08, { type: 'flash', dur: 0.2 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  const t0 = w(20, 0);
  const v = easeOut(invLerp(t0, t0 + 0.35, T));
  const h2 = easeOut(invLerp(t0 + 0.38, t0 + 0.7, T));
  rect(ctx, 960 - 80, 60, 160, 980 * v, C.red);
  rect(ctx, 960 - 620 * h2, 300, 1240 * h2, 160, C.red);
  text(ctx, 'SE', 960, 230, { size: 110, weight: 900, color: C.paper, align: 'center', fn: rise(T, t0, 110) });
  ctx.save();
  ctx.beginPath(); ctx.rect(960 - 620 * h2, 300, 1240 * h2, 160); ctx.clip();
  text(ctx, 'SANTIGUABAN', 960, 425, { size: 130, weight: 900, color: C.paper, align: 'center', track: 0.04 });
  ctx.restore();
});

// 17 · «y dejaban el luctuoso bancal»: se van, y quedan los escalones del bancal
scene(54.95, { type: 'slicesH', dur: 0.34 }, C.paper, (ctx, T) => {
  bg(ctx, C.black);
  text(ctx, 'Y', 140, 230, { size: 120, weight: 900, color: C.paper, fn: rise(T, w(21, 0), 120) });
  // DEJABAN: las letras se marchan por la derecha dejando una estela
  const td = w(21, 1);
  for (let g = 3; g >= 0; g--) {
    ctx.globalAlpha = g === 0 ? 1 : 0.18;
    text(ctx, 'DEJABAN', 300, 230, { size: 120, weight: 900, color: g === 0 ? C.paper : C.red, fn: (i, n) => {
      const r = rise(T, td, 120)(i);
      const leave = easeIn(invLerp(td + 0.55 + (n - i) * 0.07, td + 1.2 + (n - i) * 0.07, T - g * 0.04));
      return { ...r, dx: leave * 1800 };
    } });
  }
  ctx.globalAlpha = 1;
  // bancal: terrazas escalonadas con una palabra en cada escalón
  const steps = [['EL', w(21, 2)], ['LUCTUOSO', w(21, 3)], ['BANCAL', w(21, 4)]];
  steps.forEach(([wd, t], k) => {
    const u = easeOut(invLerp(t - 0.1, t + 0.35, T));
    if (u <= 0) return;
    const y = 520 + k * 170;
    const x0 = k * 330;
    rect(ctx, x0 - (1 - u) * W, y, W, H, k === 1 ? C.red : C.blue);
    rect(ctx, x0 - (1 - u) * W, y, W, 8, C.paper);
    text(ctx, wd, x0 + 40 - (1 - u) * W, y + 140, { size: 130, weight: 900, color: C.paper });
  });
});

// 18 · «en el que algún día, ensalzados a la categoría de difuntos»
scene(57.75, { type: 'wipeUp', dur: 0.36 }, C.black, (ctx, T) => {
  bg(ctx, C.paper);
  text(ctx, 'EN EL QUE', 140, 200, { size: 80, weight: 900, color: C.black, track: 0.06, fn: (i) => (i < 2 ? rise(T, w(22, 0), 80)(i) : i < 5 ? rise(T, w(22, 1), 80)(i - 3) : rise(T, w(22, 2), 80)(i - 6)) });
  // ALGÚN DÍA: el sol sale y se pone varias veces; los días pasan
  const td = w(22, 3);
  const cyc = invLerp(td, w(23, 0), T) * 3.2;
  if (T > td) {
    const ph = cyc % 1;
    const sx = lerp(260, 1660, ph), sy = 620 - Math.sin(ph * Math.PI) * 360;
    circle(ctx, sx, sy, 70, C.red);
  }
  rect(ctx, 0, 620, W, 6, C.black);
  text(ctx, 'ALGÚN DÍA,', 960, 560, { size: 190, weight: 900, color: C.blue, align: 'center', fn: (i) => (i < 5 ? rise(T, td, 190)(i) : rise(T, w(22, 4), 190)(i - 6)) });
  const days = Math.floor(easeIn(invLerp(w(22, 4), w(23, 0), T)) * 18262) + 1;
  if (T > w(22, 4)) text(ctx, `DÍA ${String(days).padStart(5, '0')}`, 960, 700, { size: 54, weight: 800, color: C.black, align: 'center', track: 0.2 });
  // ENSALZADOS: las letras se elevan una a una (con las notas del glockenspiel)
  const te = w(23, 0);
  text(ctx, 'ENSALZADOS', 960, 870, { size: 170, weight: 900, color: C.red, align: 'center', fn: (i) => {
    const r = rise(T, te - 0.05, 170, 0.02)(i);
    const up = easeOutBack(invLerp(te + 0.15 + i * 0.1, te + 0.45 + i * 0.1, T));
    return { ...r, dy: (r.dy || 0) - up * 70 };
  } });
  text(ctx, 'A LA CATEGORÍA DE', 960, 960, { size: 52, weight: 800, color: C.black, align: 'center', track: 0.2, fn: (i) => {
    const k = i < 1 ? 1 : i < 4 ? 2 : i < 14 ? 3 : 4;
    return rise(T, w(23, k), 52, 0.01)(i);
  } });
  // DIFUNTOS grabado en una lápida que sube
  const tf = w(23, 5);
  const u = easeOutBack(invLerp(tf - 0.1, tf + 0.35, T));
  if (u > 0) {
    const top = lerp(H + 20, 260, u);
    ctx.fillStyle = C.blue;
    ctx.beginPath();
    ctx.moveTo(560, H + 50); ctx.lineTo(560, top + 260); ctx.arc(960, top + 260, 400, Math.PI, 0); ctx.lineTo(1360, H + 50);
    ctx.closePath(); ctx.fill();
    rect(ctx, 945, top + 40, 30, 150, C.paper);
    rect(ctx, 900, top + 85, 120, 26, C.paper);
    text(ctx, 'DIFUNTOS,', 960, top + 420, { size: 150, weight: 900, color: C.paper, align: 'center' });
  }
});

// 19 · «serían los protagonistas de la fiesta» + la manzana + el título
const BEAT = 0.35;
const CONFETTI = Array.from({ length: 260 }, (_, i) => {
  const r = mulberry32(i * 7 + 1);
  return { a: r() * TAU, v: 500 + r() * 1300, c: [C.blue, C.black, C.red, C.blue][i % 4], s: 10 + r() * 18, sp: (r() - 0.5) * 18, ph: r() * 6 };
});
scene(62.22, { type: 'circle', cx: 960, cy: 540, dur: 0.36 }, C.paper, (ctx, T) => {
  const tw = w(24, 0), tf = w(24, 5);
  const beat = (T - tw) / BEAT;
  const onBeat = T > tw ? Math.exp(-((beat % 1 + 1) % 1) * BEAT * 9) : 0;
  const down = T > tw ? Math.exp(-((((beat / 3) % 1) + 1) % 1) * 3 * BEAT * 6) : 0;
  const isFiesta = T >= tf;
  const drop = Math.max(0, T - 65.25); // al terminar el vals, todo cae
  const gfall = 0.5 * 3200 * drop * drop;
  bg(ctx, isFiesta || drop > 0 ? C.paper : C.red);
  ctx.save();
  ctx.translate(0, gfall);
  if (T < 66.5) {
    // banderines (papel picado vectorial)
    for (let s = 0; s < 2; s++) {
      const unf = easeOut(invLerp(tw + s * 0.2, tw + 0.9 + s * 0.2, T));
      const n = 22;
      for (let k = 0; k < n * unf; k++) {
        const x = (k + 0.5) * (W / n), y = 70 + s * 90 + Math.sin((k / n) * Math.PI) * 50;
        const col = [C.blue, C.paper, C.black][(k + s) % 3];
        const sway = Math.sin(T * 6 + k) * 0.15 + onBeat * 0.2 * (k % 2 ? 1 : -1);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(sway);
        ctx.fillStyle = isFiesta && col === C.paper ? C.red : col;
        ctx.beginPath(); ctx.moveTo(-36, 0); ctx.lineTo(36, 0); ctx.lineTo(0, 70); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    const ink = isFiesta ? C.black : C.paper;
    text(ctx, 'SERÍAN', 140, 340, { size: 120, weight: 900, color: ink, fn: (i) => ({ ...rise(T, tw, 120)(i), sy: 1 + down * 0.15 }) });
    text(ctx, 'LOS', 1780, 340, { size: 120, weight: 900, color: ink, align: 'right', fn: rise(T, w(24, 1), 120) });
    // PROTAGONISTAS baila el vals: cada letra salta en su tiempo del compás
    text(ctx, 'PROTAGONISTAS', 960, 580, { size: 190, weight: 900, color: isFiesta ? C.blue : C.paper, align: 'center', fn: (i) => {
      const r = rise(T, w(24, 2), 190, 0.025)(i);
      const hop = T > w(24, 2) + 0.4 ? Math.abs(Math.sin((beat + i * 0.33) * Math.PI)) * 30 * (i % 3 === Math.floor(beat) % 3 ? 1.6 : 0.6) : 0;
      return { ...r, dy: (r.dy || 0) - hop };
    } });
    text(ctx, 'DE LA', 960, 720, { size: 90, weight: 900, color: ink, align: 'center', track: 0.1, fn: (i) => (i < 2 ? rise(T, w(24, 3), 90)(i) : rise(T, w(24, 4), 90)(i - 3)) });
    // FIESTA: estallido
    if (isFiesta) {
      const u = invLerp(tf, tf + 0.2, T);
      const sc = lerp(2.2, 1, easeOut(u)) * (1 + onBeat * 0.04);
      ctx.save();
      ctx.translate(960, 1000);
      ctx.scale(sc, sc);
      text(ctx, 'FIESTA.', 0, 0, { size: 330, weight: 900, color: C.red, align: 'center', track: -0.04 });
      ctx.restore();
      const dt = T - tf;
      for (const c of CONFETTI) {
        const x = 960 + Math.cos(c.a) * c.v * dt;
        const y = 720 + Math.sin(c.a) * c.v * dt + 900 * dt * dt;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(c.sp * dt + c.ph);
        ctx.scale(1, Math.sin(dt * 9 + c.ph));
        rect(ctx, -c.s / 2, -c.s / 4, c.s, c.s / 2, c.c);
        ctx.restore();
      }
    }
  }
  ctx.restore();
  // La manzana cae (crujido de la rama, golpe y rebote, como en la banda sonora)
  if (T > APPLE_FALL - 0.1) {
    const groundY = 520;
    let y, sq = 0;
    if (T < APPLE_LAND) {
      const u = invLerp(APPLE_FALL, APPLE_LAND, T);
      y = lerp(-200, groundY, u * u);
    } else {
      const bt = T - APPLE_LAND;
      const b = bt < APPLE_BOUNCE ? Math.sin((bt / APPLE_BOUNCE) * Math.PI) * 110 : 0;
      y = groundY - b;
      sq = Math.exp(-bt * 14) * 0.25 * (bt < 0.2 ? 1 : 0) + (bt > APPLE_BOUNCE ? Math.exp(-(bt - APPLE_BOUNCE) * 14) * 0.12 : 0);
    }
    const r = 120;
    // sombra
    if (T > APPLE_FALL) {
      const near = clamp(1 - (groundY - y) / 800);
      ctx.fillStyle = 'rgba(28,27,26,0.18)';
      ctx.beginPath(); ctx.ellipse(960, groundY + r + 8, r * near, 16 * near, 0, 0, TAU); ctx.fill();
    }
    apple(ctx, 960, y, r, T < APPLE_LAND ? (T - APPLE_FALL) * 3 : 0.4, sq);
  }
  // título con las cinco notas finales de la caja de música
  titleLines(ctx, T, [66.75, 67.25, 67.75, 68.2, 68.55], 860, 135);
});

// ---------------------------------------------------------------------------
// Transiciones: la escena nueva se revela a través de una máscara
function maskPath(ctx, tr, p) {
  ctx.beginPath();
  switch (tr.type) {
    case 'circle': {
      const r = easeIn(p) * Math.hypot(W, H);
      ctx.arc(tr.cx, tr.cy, r, 0, TAU);
      break;
    }
    case 'wipeUp': {
      const y = lerp(H + 300, -300, easeInOut(p));
      ctx.moveTo(-10, y + 200); ctx.lineTo(W + 10, y - 200); ctx.lineTo(W + 10, H + 10); ctx.lineTo(-10, H + 10);
      break;
    }
    case 'wipeDown': {
      const y = lerp(-300, H + 300, easeInOut(p));
      ctx.moveTo(-10, -10); ctx.lineTo(W + 10, -10); ctx.lineTo(W + 10, y - 150); ctx.lineTo(-10, y + 150);
      break;
    }
    case 'wipeLeft': {
      const x = lerp(W + 300, -300, easeInOut(p));
      ctx.moveTo(x + 200, -10); ctx.lineTo(W + 10, -10); ctx.lineTo(W + 10, H + 10); ctx.lineTo(x - 200, H + 10);
      break;
    }
    case 'wipeRight': {
      const x = lerp(-300, W + 300, easeInOut(p));
      ctx.moveTo(-10, -10); ctx.lineTo(x + 200, -10); ctx.lineTo(x - 200, H + 10); ctx.lineTo(-10, H + 10);
      break;
    }
    case 'slicesH': {
      const n = 8, hh = H / n;
      for (let i = 0; i < n; i++) {
        const u = easeInOut(clamp(p * 1.6 - i * 0.08));
        if (i % 2) ctx.rect(W - W * u, i * hh, W * u + 1, hh + 1); else ctx.rect(0, i * hh, W * u, hh + 1);
      }
      break;
    }
    case 'slicesV': {
      const n = 12, ww = W / n;
      for (let i = 0; i < n; i++) {
        const u = easeInOut(clamp(p * 1.7 - i * 0.06));
        if (i % 2) ctx.rect(i * ww, H - H * u, ww + 1, H * u + 1); else ctx.rect(i * ww, 0, ww + 1, H * u);
      }
      break;
    }
    case 'dots': {
      // trama de semitono que crece en diagonal, como en el cartel
      const cell = 90;
      for (let y = -cell; y < H + cell; y += cell) for (let x = -cell; x < W + cell; x += cell) {
        const d = (x / W) * 0.6 + (y / H) * 0.4;
        const u = clamp(p * 2 - d);
        const r = u * cell * 0.75;
        if (r <= 0) continue;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      break;
    }
    default:
      ctx.rect(-10, -10, W + 20, H + 20);
  }
}

function sceneAt(T) {
  let k = 0;
  for (let i = 0; i < SCENES.length; i++) if (SCENES[i].t0 <= T) k = i;
  return k;
}

// Marco de cartel: contador de frases apilado y título vertical
function phraseIndex(T) {
  let k = 0;
  for (let i = 0; i < phrases.length; i++) if (T >= phrases[i].s - 0.1) k = i;
  return k;
}
function drawFrame(ctx, T, ink) {
  const a = ramp(T, 3.6, 4.0) * (1 - ramp(T, 65.0, 65.5));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const k = phraseIndex(T) + 1;
  const tk = phrases[k - 1].s - 0.1;
  const u = easeOut(invLerp(tk, tk + 0.25, T));
  ctx.beginPath(); ctx.rect(1740, 26, 160, 54); ctx.clip();
  text(ctx, String(k).padStart(2, '0'), 1790, 72 + (1 - u) * 54, { size: 50, weight: 900, color: ink, align: 'right' });
  if (u < 1) text(ctx, String(k - 1).padStart(2, '0'), 1790, 72 - u * 54, { size: 50, weight: 900, color: ink, align: 'right' });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = a;
  text(ctx, '25', 1790, 122, { size: 50, weight: 900, color: ink, align: 'right' });
  rect(ctx, 1740, 82, 50, 4, ink);
  // barra de progreso
  rect(ctx, 0, H - 8, W * (T / 69), 8, ink);
  ctx.restore();
}

// ---------------------------------------------------------------------------
export function init() {}

export function draw(ctx, T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  const k = sceneAt(T);
  const sc = SCENES[k];
  const sh = shake(T);
  const apply = () => {
    ctx.translate(W / 2 + sh.x, H / 2 + sh.y);
    ctx.rotate(sh.r);
    ctx.translate(-W / 2, -H / 2);
  };
  const tr = sc.tr;
  const p = tr && tr.dur ? (T - sc.t0) / tr.dur : 1;
  ctx.save();
  apply();
  if (p < 1 && k > 0) {
    const prev = SCENES[k - 1];
    if (tr.type === 'pushUp') {
      const e = easeInOut(p);
      ctx.save(); ctx.translate(0, -e * H); prev.draw(ctx, T); ctx.restore();
      ctx.save(); ctx.translate(0, (1 - e) * H); sc.draw(ctx, T); ctx.restore();
    } else if (tr.type === 'flash') {
      sc.draw(ctx, T);
      ctx.fillStyle = C.red;
      ctx.globalAlpha = 1 - p;
      ctx.fillRect(-100, -100, W + 200, H + 200);
      ctx.globalAlpha = 1;
    } else {
      prev.draw(ctx, T);
      ctx.save();
      maskPath(ctx, tr, clamp(p));
      ctx.clip();
      sc.draw(ctx, T);
      ctx.restore();
    }
  } else {
    sc.draw(ctx, T);
  }
  ctx.restore();
  drawFrame(ctx, T, p < 0.5 && k > 0 ? SCENES[k - 1].ink : sc.ink);
}
