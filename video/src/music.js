// Banda sonora generada por código con Web Audio (OfflineAudioContext para el render).
// Re menor fúnebre → silencio → marcha "disciplinada" → vals irónico de la fiesta → la manzana.

import { DURATION, cue, cueEnd, PROC, footfalls, IMPACTS, THROWS, APPLE_FALL, APPLE_LAND, APPLE_BOUNCE } from './timeline.js';
import { mulberry32 } from './util.js';

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
export function freq(n) {
  const m = n.match(/^([A-G][b#]?)(-?\d)$/);
  const midi = 12 * (Number(m[2]) + 1) + NOTE[m[1]];
  return 440 * Math.pow(2, (midi - 69) / 12);
}
const F = (s) => s.split(' ').map(freq);

const CHORDS = {
  Dm: F('D3 F3 A3'), Bb: F('Bb2 D3 F3'), Gm: F('G2 Bb2 D3'), A: F('A2 C#3 E3'), F: F('F2 A2 C3'),
  C: F('C3 E3 G3'), A7: F('A2 C#3 G3'), D: F('D3 F#3 A3'),
};
const BASS = { Dm: 'D2', Bb: 'Bb1', Gm: 'G1', A: 'A1', F: 'F1', C: 'C2', A7: 'A1', D: 'D2' };

export async function renderMusic(sampleRate = 48000) {
  const ctx = new OfflineAudioContext(2, Math.ceil(DURATION * sampleRate), sampleRate);
  buildScore(ctx, ctx.destination);
  return ctx.startRendering();
}

export function buildScore(ctx, out) {
  const sr = ctx.sampleRate;
  const rnd = mulberry32(1234);

  // --- Bus maestro con compresión suave y reverb de iglesia/valle
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(out);

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.6, 2.4);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.55;
  verb.connect(verbOut).connect(master);
  const send = (node, dry = 1, wet = 0.4) => {
    const d = ctx.createGain(); d.gain.value = dry; node.connect(d).connect(master);
    const w = ctx.createGain(); w.gain.value = wet; node.connect(w).connect(verb);
  };

  // ---------------- Instrumentos -----------------
  /** Colchón de cuerdas: sierras desafinadas filtradas. */
  function pad(t, dur, freqs, vol = 0.05, cutoff = 900, wet = 0.5) {
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 0.4;
    lp.frequency.setValueAtTime(cutoff * 0.6, t);
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.7, t + dur);
    lp.connect(g);
    send(g, 1, wet);
    g.gain.setValueAtTime(0, t);
    vol *= 1.5;
    g.gain.linearRampToValueAtTime(vol, t + Math.min(1.4, dur * 0.4));
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.6);
    for (const f of freqs) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det + (rnd() - 0.5) * 3;
        const og = ctx.createGain(); og.gain.value = 0.5 / freqs.length;
        o.connect(og).connect(lp);
        o.start(t); o.stop(t + dur + 1.8);
      }
    }
  }
  /** Bordón grave de seno. */
  function drone(t, dur, f, vol = 0.08) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2; o2.detune.value = 4;
    const g = ctx.createGain(); const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g);
    send(g, 1, 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 1.5);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
    o.start(t); o.stop(t + dur + 1.6); o2.start(t); o2.stop(t + dur + 1.6);
  }
  /** Campana de iglesia (parciales inarmónicos). */
  function bell(t, f, vol = 0.2, len = 6) {
    const parts = [[0.5, 0.9, 1.0], [1, 1, 0.75], [1.19, 0.55, 0.6], [1.5, 0.45, 0.5], [2, 0.5, 0.42], [2.52, 0.3, 0.3], [2.66, 0.25, 0.28], [3.01, 0.2, 0.22], [4.17, 0.14, 0.15], [5.43, 0.08, 0.1]];
    const g = ctx.createGain(); g.gain.value = vol;
    send(g, 1, 0.7);
    for (const [r, a, d] of parts) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(a, t + 0.004);
      og.gain.setTargetAtTime(0, t + 0.004, len * d / 3);
      o.connect(og).connect(g);
      o.start(t); o.stop(t + len * d * 2 + 0.1);
    }
  }
  /** Caja de música / celesta. */
  function celesta(t, f, vol = 0.1, len = 1.6) {
    const g = ctx.createGain(); g.gain.value = vol;
    send(g, 1, 0.6);
    for (const [r, a, d] of [[1, 1, 1], [2, 0.18, 0.5], [4, 0.22, 0.25], [6.8, 0.05, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(a, t + 0.003);
      og.gain.setTargetAtTime(0, t + 0.003, len * d / 3.5);
      o.connect(og).connect(g);
      o.start(t); o.stop(t + len * d * 1.6 + 0.05);
    }
  }
  /** Glockenspiel. */
  function glock(t, f, vol = 0.06) {
    const g = ctx.createGain(); g.gain.value = vol;
    send(g, 1, 0.5);
    for (const [r, a, d] of [[1, 1, 0.9], [2.76, 0.35, 0.3], [5.4, 0.15, 0.12]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t);
      og.gain.linearRampToValueAtTime(a, t + 0.002);
      og.gain.setTargetAtTime(0, t + 0.002, d / 3);
      o.connect(og).connect(g);
      o.start(t); o.stop(t + d * 2 + 0.05);
    }
  }
  /** Cuerda pulsada (Karplus-Strong): piano lejano / pizzicato / bajo. */
  function pluck(t, f, vol = 0.2, len = 2.5, bright = 0.5, wet = 0.4) {
    const n = Math.ceil(len * sr);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const p = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(p);
    let lp = 0;
    for (let i = 0; i < p; i++) { lp += ((rnd() * 2 - 1) - lp) * bright; line[i] = lp; }
    let idx = 0;
    const damp = 0.996;
    for (let i = 0; i < n; i++) {
      const nxt = (idx + 1) % p;
      const v = line[idx];
      line[idx] = damp * 0.5 * (v + line[nxt]);
      d[i] = v;
      idx = nxt;
    }
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t + len * 0.6, len * 0.12);
    s.connect(g);
    send(g, 1, wet);
    s.start(t);
  }
  /** Timbal suave. */
  function timpani(t, f, vol = 0.3) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.25, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.setTargetAtTime(0, t + 0.01, 0.35);
    o.connect(g);
    send(g, 1, 0.45);
    o.start(t); o.stop(t + 2.5);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 1.5;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.01); g2.gain.setTargetAtTime(0, t + 0.01, 0.15);
    o2.connect(g2); send(g2, 1, 0.45);
    o2.start(t); o2.stop(t + 1.5);
  }
  /** Acordeón (lengüetas desafinadas con vibrato). */
  function accordion(t, f, dur, vol = 0.05) {
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
    bp.connect(g); send(g, 1, 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur - 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5;
    const lg = ctx.createGain(); lg.gain.value = 6;
    lfo.connect(lg);
    for (const [type, det, a] of [['sawtooth', -9, 0.4], ['square', 8, 0.25], ['sawtooth', 1200, 0.08]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      lg.connect(o.detune);
      const og = ctx.createGain(); og.gain.value = a;
      o.connect(og).connect(bp);
      o.start(t); o.stop(t + dur + 0.05);
    }
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }
  /** Glissando grave (el ataúd que se hunde). */
  function sink(t, dur, f0, f1, vol) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.setValueAtTime(f0 * 2, t);
    o2.frequency.exponentialRampToValueAtTime(f1 * 2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.3);
    const g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2).connect(g);
    send(g, 1, 0.4);
    o.start(t); o.stop(t + dur + 0.4); o2.start(t); o2.stop(t + dur + 0.4);
  }

  // ---------------- Partitura -----------------
  // Intro: el tema de la manzana en caja de música
  const motif = [['D5', 0.45, 0.5], ['A4', 0.9, 0.5], ['F5', 1.35, 0.5], ['E5', 1.8, 0.9], ['D5', 2.55, 0.5], ['Bb4', 3.0, 0.5], ['A4', 3.45, 1.6]];
  for (const [n, t] of motif) celesta(t, freq(n), 0.12, 2.2);
  pad(0.2, 3.6, F('D3 A3'), 0.03, 700);
  drone(0.3, 4.6, freq('D2'), 0.05);

  // "amén": campana; luego "silencio": casi todo se apaga
  const tAmen = cue('amén');
  bell(tAmen, freq('D3'), 0.22, 7);
  pad(3.7, tAmen + 0.6 - 3.7, CHORDS.Dm, 0.035, 800);
  drone(cue('silencio'), 2.6, freq('D1') * 2, 0.04);

  // Cuatro hombres: un golpe de timbal por cada uno
  for (let i = 0; i < 4; i++) timpani(cue('cuatro') + i * 0.24, freq(i % 2 ? 'A1' : 'D2'), 0.22 + i * 0.03);
  const funeral = [
    [cue('cuatro') - 0.05, 'Dm', 2.7], [cue('cuatro') + 2.65, 'Bb', 2.6], [cue('otros') - 0.1, 'Gm', 2.9],
    [cue('y', 1) - 0.1, 'A', 2.0], [cue('fosa'), 'Dm', 3.6], [cue('arrojar') - 0.4, 'Gm', 3.0], [cue('madrastra') - 0.2, 'A', 1.6],
    [cue('después') - 0.1, 'F', 2.4],
  ];
  for (const [t, ch, d] of funeral) {
    pad(t, d, CHORDS[ch], 0.045, 950);
    pluck(t, freq(BASS[ch]), 0.16, 3.2, 0.25, 0.3);
  }
  // el pasado se hunde en la fosa
  sink(cue('y', 1), cue('fosa') - cue('y', 1), 82, 55, 0.12);
  timpani(cue('fosa'), freq('D2'), 0.32);
  bell(cue('fosa') + 0.02, freq('D2'), 0.08, 5);

  // Eva se desvanece: arpegio ascendente que se evapora
  const arp = ['D5', 'F5', 'A5', 'D6', 'F6', 'A6', 'D7'];
  arp.forEach((n, i) => celesta(cue('eva') + 0.1 + i * 0.19, freq(n), 0.07 - i * 0.006, 1.8));

  // El chico solo: notas sueltas, como un piano lejano
  [['A4', cue('chico')], ['F4', cue('solo')], ['E4', cue('borde')], ['D4', cue('tumba')]].forEach(([n, t], i) =>
    pluck(t, freq(n), 0.22, 3.2, 0.35, 0.7));
  drone(cue('chico') - 0.5, 3.6, freq('D2'), 0.035);

  // Los pies que se acercan / el triste tributo
  pad(cue('mirando'), 3.0, F('D3 A3'), 0.03, 700);
  pad(PROC.arrive - 0.2, 1.9, CHORDS.Gm, 0.04, 900);
  pad(PROC.arrive + 1.7, 1.8, CHORDS.A, 0.04, 900);
  pluck(PROC.arrive - 0.2, freq('G1'), 0.14, 3, 0.25);
  pluck(PROC.arrive + 1.7, freq('A1'), 0.14, 3, 0.25);

  // Marcha "disciplinada": golpe en cada paso, pizzicato en cada pausa
  const marchChords = ['Dm', 'Dm', 'Gm', 'Gm', 'Dm', 'Dm', 'Bb', 'A', 'Gm', 'Gm', 'Bb', 'A'];
  for (let k = 0; k < PROC.marchSteps; k++) {
    const t = PROC.marchStart + k * PROC.marchCycle;
    const ch = marchChords[k];
    timpani(t, freq(BASS[ch]) * 2, 0.2);
    pluck(t, freq(BASS[ch]), 0.2, 1.4, 0.3, 0.25);
    const tp = t + PROC.marchStep;
    pluck(tp, CHORDS[ch][1] * 2, 0.08, 1.0, 0.5, 0.3);
    if (k % 2 === 0) pad(t, PROC.marchCycle * 2 - 0.2, CHORDS[ch], 0.035, 850);
    // apretones de manos: un "tic" brillante
    if (tp > cue('iban') - 0.4 && tp < cueEnd('guardia') + 0.9) pluck(tp + 0.05, CHORDS[ch][2] * 4, 0.07, 0.8, 0.8, 0.5);
  }
  // giran la cabeza: barrido
  drone(cue('volvían'), 2.4, freq('G2'), 0.03);
  // la boina roja: el tema de la manzana asoma
  [['D6', 0], ['A5', 0.16], ['F6', 0.32]].forEach(([n, dt]) => celesta(cue('boina') + dt, freq(n), 0.07, 1.6));
  // santiguarse: campanilla
  bell(cue('santiguaban') + 0.1, freq('D6'), 0.05, 2.5);
  bell(cue('santiguaban') + 0.55, freq('A5'), 0.04, 2.5);
  // dejan el bancal
  pad(cue('y', 3), 2.9, CHORDS.Dm, 0.04, 800);
  pluck(cue('y', 3), freq('D2'), 0.16, 3, 0.25);

  // "algún día… ensalzados a la categoría de difuntos": el tiempo pasa, cae la noche
  pad(cue('en', 1), 1.8, F('Bb2 D3 F3 A3'), 0.04, 1300, 0.7);
  pad(cue('ensalzados') - 0.4, 1.4, F('G2 Bb2 D3 F3'), 0.045, 1500, 0.7);
  pad(cue('categoría') - 0.2, 1.6, F('A2 C#3 E3 G3'), 0.05, 1700, 0.7);
  const scale = ['D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C#6', 'D6'];
  for (let i = 0; i < PROC.n; i++) glock(cue('ensalzados') - 0.1 + i * 0.13 + 0.25, freq(scale[i]), 0.05);

  // La fiesta: vals irónico en Re mayor
  const tw = cue('serían');
  const beat = 0.35;
  const bars = [['D', 'F#5 A5 D6'], ['A7', 'E6 C#6 A5'], ['D', 'F#5 A5 D6'], ['A7', 'G5 E5 C#6']];
  bars.forEach(([ch, mel], b) => {
    const t = tw + b * beat * 3;
    if (t > 65.3) return;
    pluck(t, freq(BASS[ch]) * 2, 0.36, 1.0, 0.45, 0.2);
    for (const bt of [1, 2]) for (const f of CHORDS[ch]) accordion(t + bt * beat, f * 2, 0.16, 0.04);
    F(mel).forEach((f, i) => accordion(t + i * beat, f, beat * 0.92, 0.065));
  });
  // ¡fiesta!: brillo de glockenspiel y pandereta
  const tf = cue('fiesta');
  ['D6', 'F#6', 'A6', 'D7', 'A6', 'F#6', 'D7'].forEach((n, i) => glock(tf + i * 0.09, freq(n), 0.07));

  // Final: cae la manzana… silencio… y vuelve el tema
  const outro = [['D5', 66.75, 0.6], ['A4', 67.25, 0.6], ['F5', 67.75, 0.6], ['E5', 68.2, 0.5], ['D5', 68.55, 1.2]];
  for (const [n, t] of outro) celesta(t, freq(n), 0.1, 2.2);
  pad(66.6, 2.0, F('D3 F3 A3 D4'), 0.03, 700, 0.8);

  // ---------------- Efectos sintetizados muestra a muestra -----------------
  const sfx = ctx.createBuffer(2, Math.ceil(DURATION * sr), sr);
  synthSfx(sfx, sr);
  const src = ctx.createBufferSource();
  src.buffer = sfx;
  const sg = ctx.createGain(); sg.gain.value = 1;
  src.connect(sg);
  send(sg, 1, 0.18);
  src.start(0);
}

/** Respuesta impulsional de reverb (ruido estéreo con caída exponencial). */
function impulse(ctx, seconds, decay) {
  const sr = ctx.sampleRate, n = Math.floor(seconds * sr);
  const b = ctx.createBuffer(2, n, sr);
  const r = mulberry32(99);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp += ((r() * 2 - 1) - lp) * (0.9 - 0.6 * t); // se oscurece con el tiempo
      d[i] = lp * Math.pow(1 - t, decay) * (i < sr * 0.01 ? i / (sr * 0.01) : 1);
    }
  }
  return b;
}

/** Pasos, tierra, golpes y la manzana, sincronizados con la coreografía. */
function synthSfx(buf, sr) {
  const L = buf.getChannelData(0), Rch = buf.getChannelData(1);
  const r = mulberry32(555);
  const add = (i, v, pan = 0) => {
    if (i < 0 || i >= L.length) return;
    L[i] += v * (1 - Math.max(0, pan));
    Rch[i] += v * (1 + Math.min(0, pan));
  };
  // ruido filtrado (filtro de estado variable)
  function noiseHit(t, dur, fc, q, amp, pan = 0, attack = 0.002) {
    const i0 = Math.floor(t * sr), n = Math.floor(dur * sr);
    let low = 0, band = 0;
    const f = 2 * Math.sin(Math.PI * Math.min(fc, sr / 6) / sr);
    for (let k = 0; k < n; k++) {
      const x = r() * 2 - 1;
      const high = x - low - q * band;
      band += f * high; low += f * band;
      const e = Math.min(1, k / (attack * sr)) * Math.exp(-k / (dur * sr) * 5);
      add(i0 + k, band * amp * e, pan);
    }
  }
  function thump(t, f0, f1, dur, amp, pan = 0) {
    const i0 = Math.floor(t * sr), n = Math.floor(dur * sr);
    let ph = 0;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const f = f0 * Math.pow(f1 / f0, u);
      ph += 2 * Math.PI * f / sr;
      add(i0 + k, Math.sin(ph) * amp * Math.exp(-u * 5) * Math.min(1, k / 40), pan);
    }
  }

  // Pasos de los dolientes (todos pisan a la vez: disciplina)
  for (const t of footfalls()) {
    if (t < PROC.enter) continue;
    const amp = t < PROC.arrive ? 0.5 : 0.38;
    thump(t, 95, 55, 0.12, amp * 0.5, -0.1);
    noiseHit(t, 0.07, 900, 1.2, amp * 0.35, -0.1);
  }
  // Tierra: cada grano suena al caer sobre la tapa
  IMPACTS.forEach((imp, k) => {
    const th = THROWS[k];
    noiseHit(th.t - 0.05, 0.3, 700, 1.6, 0.09, 0.1, 0.06); // el puñado sale de la mano
    for (const t of imp.times) noiseHit(t, 0.02 + r() * 0.04, 1800 + r() * 2200, 0.9, 0.16 + r() * 0.2, (r() - 0.5) * 0.4);
    thump(imp.first, 120, 80, 0.12, 0.12);
  });
  // Travesaños: golpes de madera al retirarlos
  for (const [t, f] of [[cue('retiraron'), 820], [cue('retiraron') + 0.32, 690], [cueEnd('travesaños') + 0.1, 600]]) {
    thump(t, f, f * 0.9, 0.06, 0.28);
    noiseHit(t, 0.04, f * 2, 0.6, 0.2);
  }
  // El ataúd toca fondo
  thump(cue('fosa') + 0.05, 70, 38, 1.1, 0.38);
  noiseHit(cue('fosa') + 0.05, 0.35, 300, 1.0, 0.25);
  // Eva: un soplo que se la lleva
  {
    const t0 = cue('eva'), dur = cueEnd('desvaneció') + 0.6 - t0;
    const i0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
    let low = 0, band = 0;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const fc = 1500 + 5000 * u;
      const f = 2 * Math.sin(Math.PI * fc / sr);
      const x = r() * 2 - 1;
      const high = x - low - 1.2 * band;
      band += f * high; low += f * band;
      add(i0 + k, band * 0.07 * Math.sin(Math.PI * u) ** 2, 0.4 * u);
    }
  }
  // Cabezas que giran: barrido de aire
  {
    const t0 = cue('volvían'), n = Math.floor(0.9 * sr), i0 = Math.floor(t0 * sr);
    let low = 0, band = 0;
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const f = 2 * Math.sin(Math.PI * (400 + 3000 * u) / sr);
      const x = r() * 2 - 1;
      const high = x - low - 1.0 * band;
      band += f * high; low += f * band;
      add(i0 + k, band * 0.08 * Math.sin(Math.PI * u), -0.6 + 1.2 * u);
    }
  }
  // Pandereta en la fiesta
  const tw = cue('serían');
  for (let b = 0; b < 9; b++) {
    const t = tw + b * 0.35;
    if (t > 65.25) break;
    noiseHit(t, 0.09, 7000, 0.5, b % 3 === 0 ? 0.12 : 0.07, 0.3);
  }
  for (let i = 0; i < 14; i++) noiseHit(cue('fiesta') + i * 0.05, 0.06, 8000, 0.4, 0.08 * (1 - i / 14), 0.3);
  // La manzana: crujido de la rama, caída y golpe seco sobre la tierra
  noiseHit(APPLE_FALL - 0.05, 0.12, 2500, 0.3, 0.12);
  thump(APPLE_LAND, 160, 70, 0.22, 0.6);
  noiseHit(APPLE_LAND, 0.12, 600, 0.8, 0.3);
  thump(APPLE_LAND + APPLE_BOUNCE, 150, 80, 0.12, 0.2);
  noiseHit(APPLE_LAND + APPLE_BOUNCE, 0.06, 700, 0.8, 0.1);
}
