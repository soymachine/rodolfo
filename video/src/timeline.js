// Línea de tiempo global del vídeo. Todo se expresa en segundos de vídeo (T).
import { WORDS } from './words.js';
import { mulberry32, clamp, lerp, hash } from './util.js';

export const DURATION = 69;
export const FPS = 30;
export const W = 1920;
export const H = 1080;
/** La locución empieza a sonar 3 s después del inicio del vídeo. */
export const VOICE_OFFSET = 3.0;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zñ]/g, '');

/** Palabras con tiempos ya desplazados al tiempo de vídeo. */
export const words = WORDS.map(([w, s, e], i) => ({ w, i, s: s + VOICE_OFFSET, e: e + VOICE_OFFSET }));

/** Instante (tiempo de vídeo) en que empieza la n-ésima aparición de una palabra. */
export function cue(word, n = 0) {
  const k = norm(word);
  let c = 0;
  for (const w of words) {
    if (norm(w.w) === k) { if (c === n) return w.s; c++; }
  }
  throw new Error(`cue no encontrado: ${word} #${n}`);
}
export function cueEnd(word, n = 0) {
  const k = norm(word);
  let c = 0;
  for (const w of words) {
    if (norm(w.w) === k) { if (c === n) return w.e; c++; }
  }
  throw new Error(`cue no encontrado: ${word} #${n}`);
}

/** Frases de subtítulo (se emparejan con las palabras en orden). */
const PHRASES = [
  'El cura dijo amén',
  'y el silencio se extendió por todo el valle.',
  'Cuatro hombres levantaron el ataúd',
  'tirando de cuatro cabos de soga,',
  'otros dos retiraron los travesaños,',
  'y el pasado se hundió en la fosa.',
  'Genoveva tuvo el honor de arrojar',
  'el primer puñado de tierra sobre su madrastra.',
  'Después Eva se desvaneció',
  'y el chico se quedó solo,',
  'al borde de la tumba,',
  'mirando los pies de los que se acercaban',
  'a tirar el triste tributo',
  'de un puñado de tierra sobre el féretro.',
  'Luego, uno tras otro,',
  'disciplinadamente apesadumbrados,',
  'iban a estrechar la mano de cada familiar',
  'que formaba la guardia,',
  'volvían la cabeza hacia el extremo del cementerio,',
  'saludaban a la sobrina con la boina,',
  'se santiguaban',
  'y dejaban el luctuoso bancal',
  'en el que algún día,',
  'ensalzados a la categoría de difuntos,',
  'serían los protagonistas de la fiesta.',
];

export const phrases = (() => {
  const out = [];
  let wi = 0;
  for (const text of PHRASES) {
    const toks = text.split(/\s+/);
    const ws = [];
    for (const tok of toks) {
      const w = words[wi++];
      if (!w || norm(w.w) !== norm(tok)) throw new Error(`Desajuste de subtítulos: "${tok}" vs "${w && w.w}"`);
      ws.push({ ...w, text: tok });
    }
    out.push({ words: ws, s: ws[0].s, e: ws[ws.length - 1].e });
  }
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].hide = next ? Math.min(out[i].e + 1.1, next.s - 0.05) : out[i].e + 1.6;
  }
  return out;
})();

// ---------------------------------------------------------------------------
// Coreografía compartida entre imagen y música (para que el sonido caiga
// exactamente cuando ocurre la acción).

/** Procesión de dolientes: posición x del primero en función del tiempo. */
export const PROC = {
  n: 8,
  spacing: 110,
  z: 35,
  enter: cue('mirando') - 0.25,          // empiezan a entrar en cuadro
  arrive: 35.3,                           // el primero llega a la fosa
  throwCycle: 0.8,                        // pausa+paso durante los puñados
  throwPause: 0.45,
  throws: 5,
  marchStart: 39.6,                       // arranque "disciplinado"
  marchCycle: 1.2,
  marchStep: 0.5,
  marchSteps: 12,
  leaveStart: cue('y', 3),                // "y dejaban el luctuoso bancal"
  leaveDist: 460,
};
PROC.walkInFrom = -540;
/** Altura de cada doliente (la comparten el dibujo y los puñados de tierra). */
PROC.heights = Array.from({ length: PROC.n }, (_, i) => 288 + hash(i * 9.1) * 26);
PROC.marchFrom = 110 * (PROC.throws - 1);
PROC.marchTo = PROC.marchFrom + 110 * PROC.marchSteps;
PROC.leaveEnd = PROC.leaveStart + 2.9;

export function procX(T) {
  const P = PROC;
  if (T < P.enter) return P.walkInFrom;
  if (T < P.arrive) return lerp(P.walkInFrom, 0, (T - P.enter) / (P.arrive - P.enter));
  // Fase de puñados: pausa (tirar) y paso (avanzar 110)
  const tt = T - P.arrive;
  const lastThrowStart = (P.throws - 1) * P.throwCycle;
  if (tt < lastThrowStart) {
    const k = Math.floor(tt / P.throwCycle);
    const f = tt - k * P.throwCycle;
    const step = f < P.throwPause ? 0 : stepEase((f - P.throwPause) / (P.throwCycle - P.throwPause));
    return 110 * (k + step);
  }
  if (T < P.marchStart) return P.marchFrom;
  // Marcha disciplinada: paso de 0.5 s, pausa de 0.7 s
  const mt = T - P.marchStart;
  const k = Math.floor(mt / P.marchCycle);
  if (k >= P.marchSteps) {
    if (T < P.leaveStart) return P.marchTo;
    return P.marchTo + P.leaveDist * stepEase((T - P.leaveStart) / (P.leaveEnd - P.leaveStart));
  }
  const f = mt - k * P.marchCycle;
  const step = f < P.marchStep ? stepEase(f / P.marchStep) : 1;
  return P.marchFrom + 110 * (k + step);
}
const stepEase = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

/** ¿Está la procesión en una pausa de la marcha? (para los apretones de manos). */
export function marchPause(T) {
  const P = PROC;
  const mt = T - P.marchStart;
  if (mt < 0) return null;
  const k = Math.floor(mt / P.marchCycle);
  if (k >= P.marchSteps) return null;
  const f = mt - k * P.marchCycle;
  if (f < P.marchStep) return null;
  return { k, u: (f - P.marchStep) / (P.marchCycle - P.marchStep), start: P.marchStart + k * P.marchCycle + P.marchStep };
}

/** Momentos en que cada pie toca el suelo (todos los dolientes pisan a la vez). */
export function footfalls() {
  const out = [];
  let prev = Math.floor(procX(0) / 110);
  for (let T = 0; T < DURATION; T += 1 / 240) {
    const s = Math.floor((procX(T) + 55) / 110);
    if (s !== prev) { out.push(T); prev = s; }
  }
  return out;
}

// --- Puñados de tierra -------------------------------------------------------
/** Lanzamientos: hora de soltar, origen (x,z,h) y número de granos. */
export const THROWS = (() => {
  const list = [];
  // Genoveva (la mano, según su pose al soltar, queda en x≈-162, h≈-221)
  list.push({ t: cue('arrojar') + 0.55, x: -162, z: 100, h: -221, n: 70, seed: 11, lx0: -90, lx1: 40 });
  // Los dolientes, uno tras otro, desde el borde de la fosa (mano a 105,-213 en diseño de 300)
  for (let k = 0; k < PROC.throws; k++) {
    const t = PROC.arrive + k * PROC.throwCycle + 0.24;
    const s = PROC.heights[k] / 300;
    list.push({ t, x: 105 * s, z: PROC.z, h: -213 * s, n: 34, seed: 100 + k, lx0: -40, lx1: 90 });
  }
  return list;
})();

export const GRAVITY = 1500;
export const COFFIN = { x0: -100, x1: 100, z0: 85, z1: 135, height: 40 };
/** Altura (h, positiva = bajo tierra) de la tapa del ataúd ya en el fondo. */
export const LID_REST_H = 30;

/** Granos de tierra: trayectoria balística hasta la tapa del ataúd. */
export const GRAINS = (() => {
  const g = [];
  for (const th of THROWS) {
    const r = mulberry32(th.seed);
    for (let i = 0; i < th.n; i++) {
      const tx = lerp(th.lx0, th.lx1, r());
      const tz = lerp(COFFIN.z0 + 6, COFFIN.z1 - 6, r());
      const dt = 0.42 + r() * 0.22;                // tiempo de vuelo
      const t0 = th.t + r() * 0.12;                // el puñado se abre
      const h0 = th.h + (r() - 0.5) * 14;
      const h1 = LID_REST_H - 2 - r() * 4;
      // h(t) = h0 + vh*t + g t²/2  →  vh para aterrizar en h1 a dt
      const vh = (h1 - h0 - 0.5 * GRAVITY * dt * dt) / dt;
      g.push({ t0, dt, x0: th.x + (r() - 0.5) * 10, z0: th.z, h0, x1: tx, z1: tz, h1, vh,
        size: 1.6 + r() * 2.6, shade: r() });
    }
  }
  return g;
})();

/** Instantes de impacto de cada puñado (para el sonido). */
export const IMPACTS = THROWS.map((th) => {
  const gs = GRAINS.filter((g) => g.t0 >= th.t && g.t0 < th.t + 0.2);
  const ts = gs.map((g) => g.t0 + g.dt).sort((a, b) => a - b);
  return { first: ts[0], last: ts[ts.length - 1], times: ts, n: th.n };
});

// --- La manzana cae al final ---------------------------------------------------
export const APPLE_FALL = 65.35;
export const APPLE_LAND = APPLE_FALL + 0.78;
export const APPLE_BOUNCE = 0.5; // segundo contacto tras el rebote
