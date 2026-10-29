// Utilidades matemáticas y aleatoriedad determinista (cada fotograma debe ser reproducible).

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => { t = clamp(t); return 1 - Math.pow(1 - t, 3); };
export const easeIn = (t) => { t = clamp(t); return t * t * t; };
export const easeOutBack = (t) => { t = clamp(t); const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

/** Rampa suave entre a y b (0 antes de a, 1 después de b). */
export const ramp = (t, a, b) => smooth(invLerp(a, b, t));
/** Ventana: sube entre a..b, se mantiene, baja entre c..d. */
export const win = (t, a, b, c, d) => ramp(t, a, b) * (1 - ramp(t, c, d));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash 1D → [0,1). */
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

/** Ruido de valor 1D suave. */
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u) * 2 - 1;
}

export function lerpColor(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}

const hexCache = new Map();
export function hex(c) {
  if (hexCache.has(c)) return hexCache.get(c);
  let r;
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    r = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  } else {
    r = c.match(/[\d.]+/g).slice(0, 3).map(Number);
  }
  hexCache.set(c, r);
  return r;
}

export const rgba = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };

/** Interpola una secuencia de claves [{t, ...valores}] con easeInOut entre claves. */
export function keyframes(keys, t, fields) {
  if (t <= keys[0].t) return pick(keys[0], fields);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) {
      const u = (b.ease || easeInOut)((t - a.t) / (b.t - a.t));
      const o = {};
      for (const f of fields) o[f] = lerp(a[f], b[f], u);
      return o;
    }
  }
  return pick(keys[keys.length - 1], fields);
}
const pick = (k, fields) => { const o = {}; for (const f of fields) o[f] = k[f]; return o; };
