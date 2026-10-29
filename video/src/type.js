// Tipografía de cartel: grotesca bold enorme en rojo que se solapa con la ilustración,
// numerales negros apilados, rótulo vertical y bloque de texto alineado a la derecha.
import { clamp, lerp, ramp, win, easeOut, easeIn, invLerp } from './util.js';
import { W, H, cue, cueEnd, phrases } from './timeline.js';
import { CSS } from './halftone.js';

export const SANS = '"Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif';
const M = 110; // margen del cartel

// --- Palabras clave: aparecen con la palabra hablada ---------------------------
const K = (word, at, end, align, size = 230) => ({ word, t: at, end, align, size });
const KEYWORDS = [
  K('AMÉN', cue('amén'), cue('silencio') - 0.2, 'left', 250),
  K('SILENCIO', cue('silencio'), cueEnd('valle') + 0.4, 'right', 230),
  K('CUATRO', cue('cuatro'), cue('cuatro') + 2.8, 'left', 240),
  K('PASADO', cue('pasado'), cueEnd('fosa') + 0.9, 'right', 240),
  K('GENOVEVA', cue('genoveva'), cue('primer') - 0.3, 'left', 210),
  K('TIERRA', cue('tierra'), cueEnd('madrastra') + 0.4, 'right', 240),
  K('EVA', cue('eva'), cueEnd('desvaneció') + 0.6, 'left', 300),
  K('SOLO', cue('solo'), cueEnd('tumba') + 0.3, 'right', 280),
  K('PIES', cue('pies'), cue('tirar') - 0.2, 'left', 280),
  K('TRIBUTO', cue('tributo'), cueEnd('féretro') + 0.4, 'right', 230),
  K('UNO TRAS OTRO', cue('uno'), cueEnd('apesadumbrados') + 0.2, 'left', 190),
  K('MANO', cue('mano'), cueEnd('guardia') + 0.3, 'right', 280),
  K('CEMENTERIO', cue('cementerio'), cue('saludaban') - 0.1, 'left', 200),
  K('BOINA', cue('boina'), cue('y', 3) - 0.1, 'right', 260),
  K('DIFUNTOS', cue('difuntos'), cue('serían') - 0.05, 'left', 220),
  K('FIESTA', cue('fiesta'), 66.3, 'right', 260),
];

function drawKeyword(ctx, k, T) {
  if (T < k.t - 0.05 || T > k.end + 0.6) return;
  ctx.save();
  ctx.font = `800 ${k.size}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  const letters = [...k.word];
  const track = -0.03 * k.size;
  const widths = letters.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + track * (letters.length - 1);
  const base = H * 0.62; // a media altura, cruzando la ilustración (como «SALMON»)
  const cap = k.size * 0.74;
  let x = k.align === 'left' ? M : W - M - total;
  // máscara: las letras suben desde la línea base y salen por arriba
  ctx.beginPath();
  ctx.rect(0, base - cap - k.size * 0.3, W, cap + k.size * 0.32);
  ctx.clip();
  ctx.fillStyle = CSS.red;
  letters.forEach((ch, i) => {
    const tin = k.t + i * 0.035;
    const uin = easeOut(invLerp(tin, tin + 0.32, T));
    const tout = k.end + i * 0.025;
    const uout = easeIn(invLerp(tout, tout + 0.3, T));
    const dy = (1 - uin) * (cap + 30) - uout * (cap + 40);
    ctx.fillText(ch, x, base + dy);
    x += widths[i] + track;
  });
  ctx.restore();
}

// --- Columna izquierda: capítulo (numerales apilados) y rótulo vertical --------
const CH = (t, label) => ({ t, label });
const CHAPTERS = [
  CH(0, 'EL VALLE'),
  CH(cue('cuatro') - 0.3, 'LA FOSA'),
  CH(cue('genoveva') - 0.4, 'LA TIERRA'),
  CH(cue('después') - 0.3, 'EL CHICO'),
  CH(cue('mirando') - 0.2, 'EL TRIBUTO'),
  CH(cue('luego') - 0.3, 'EL CORTEJO'),
  CH(cue('y', 3) - 0.1, 'LOS DIFUNTOS'),
  CH(cue('serían') - 0.1, 'LA FIESTA'),
];

function textWithKnockout(ctx, text, x, y, fill, knock) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = knock;
  ctx.lineWidth = 7;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawColumn(ctx, T, night) {
  const a = ramp(T, 3.3, 3.9) * (1 - ramp(T, 66.0, 66.6));
  if (a <= 0) return;
  let idx = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (T >= CHAPTERS[i].t) idx = i;
  const fill = night > 0.5 ? CSS.paper : CSS.black;
  const knock = night > 0.5 ? 'rgba(20,40,90,0.9)' : CSS.paper;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.textBaseline = 'alphabetic';
  // numerales apilados: capítulo / total
  ctx.font = `800 76px ${SANS}`;
  const sw = (i) => {
    // transición: el número anterior sale hacia arriba y entra el nuevo
    const t0 = CHAPTERS[i].t;
    return easeOut(invLerp(t0, t0 + 0.35, T));
  };
  const u = idx > 0 ? sw(idx) : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(M - 10, 70, 260, 80);
  ctx.clip();
  const num = (n) => String(n).padStart(2, '0');
  if (u < 1) textWithKnockout(ctx, num(idx), M, 140 - u * 80, fill, knock);
  textWithKnockout(ctx, num(idx + 1), M, 140 + (1 - u) * 80, fill, knock);
  ctx.restore();
  textWithKnockout(ctx, num(CHAPTERS.length), M, 214, fill, knock);
  // rótulo vertical (de arriba abajo, como "TOKYO")
  ctx.font = `800 42px ${SANS}`;
  ctx.save();
  ctx.translate(M + 4, 730);
  ctx.rotate(Math.PI / 2);
  ctx.beginPath();
  ctx.rect(-10, -50, 400, 70);
  ctx.clip();
  const label = CHAPTERS[idx].label;
  const prev = idx > 0 ? CHAPTERS[idx - 1].label : null;
  const sp = (t) => [...t].join(' ');
  if (prev && u < 1) textWithKnockout(ctx, sp(prev), -u * 400, 0, fill, knock);
  textWithKnockout(ctx, sp(label), (1 - u) * 400, 0, fill, knock);
  ctx.restore();
  ctx.restore();
}

// --- Subtítulos: bloque alineado a la derecha, palabra a palabra --------------
const HIGHLIGHT = { boina: CSS.red };
function drawSubtitles(ctx, T, night) {
  const size = 40;
  ctx.save();
  ctx.font = `600 ${size}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  const fill = night > 0.5 ? CSS.paper : CSS.black;
  const knock = night > 0.5 ? 'rgba(20,40,90,0.85)' : CSS.paper;
  const right = W - M, baseY = H - 84;
  for (const ph of phrases) {
    const pa = 1 - ramp(T, ph.hide - 0.3, ph.hide);
    if (T < ph.s - 0.15 || pa <= 0) continue;
    const space = ctx.measureText(' ').width;
    const widths = ph.words.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (widths.length - 1);
    let x = right - total;
    ph.words.forEach((w, i) => {
      const wa = ramp(T, w.s - 0.1, w.s + 0.12) * pa;
      if (wa > 0) {
        const key = w.text.toLowerCase().replace(/[^a-záéíóúñ]/g, '');
        ctx.globalAlpha = wa;
        textWithKnockout(ctx, w.text, x, baseY + (1 - easeOut(ramp(T, w.s - 0.1, w.s + 0.2))) * 10, HIGHLIGHT[key] || fill, knock);
      }
      x += widths[i] + space;
    });
  }
  ctx.restore();
}

// --- Título ---------------------------------------------------------------------
export function drawTitle(ctx, T) {
  const intro = T < 30;
  const t0 = intro ? 0.3 : 66.6;
  const tOut = intro ? 3.15 : 99;
  if (T < t0) return;
  if (intro && T > 3.9) return;
  const lines = ['UNA MANZANA', 'PARA LA SED'];
  const size = 172;
  const ys = intro ? [H - 268, H - 112] : [300, 456];
  ctx.save();
  ctx.font = `800 ${size}px ${SANS}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = CSS.red;
  const cap = size * 0.74;
  lines.forEach((line, li) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ys[li] - cap - 30, W, cap + 40);
    ctx.clip();
    let x = M;
    [...line].forEach((ch, i) => {
      const tin = t0 + li * 0.22 + i * 0.03;
      const uin = easeOut(invLerp(tin, tin + 0.4, T));
      const tout = tOut + li * 0.1 + i * 0.02;
      const uout = easeIn(invLerp(tout, tout + 0.35, T));
      ctx.fillText(ch, x, ys[li] + (1 - uin) * (cap + 30) - uout * (cap + 40));
      x += ctx.measureText(ch).width - size * 0.03;
    });
    ctx.restore();
  });
  ctx.restore();
}

export function drawType(ctx, T, night) {
  for (const k of KEYWORDS) drawKeyword(ctx, k, T);
  drawColumn(ctx, T, night);
  drawSubtitles(ctx, T, night);
}
