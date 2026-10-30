// Punto de entrada: prepara el canvas, expone la API de render (window.APP)
// y ofrece una previsualización en tiempo real con voz + música.
import { renderMusic } from './music.js';
import { DURATION, FPS, W, H, VOICE_OFFSET } from './timeline.js';

const canvas = document.getElementById('c');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');

const VOICE_URL = '../Locu%20Una%20manzana%2018_09_11%2017_13.m4a';

// ?scene=tipo → versión de tipografía cinética; por defecto, la versión ilustrada
const params = new URLSearchParams(location.search);
let draw = () => {};

async function setup() {
  const mod = await import(params.get('scene') === 'tipo' ? './kinetic.js' : './scene.js');
  draw = mod.draw;
  await Promise.all([
    document.fonts.load('800 200px "Inter Tight"'),
    document.fonts.load('900 200px "Inter Tight"'),
    document.fonts.load('600 40px "Inter Tight"'),
  ]);
  mod.init();
  draw(ctx, 0);
}

function bufferToWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, ch, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  str(36, 'data'); out.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return out.buffer;
}
function toBase64(ab) {
  const bytes = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

window.APP = {
  ready: setup(),
  W, H, FPS, DURATION,
  /** Dibuja los fotogramas indicados y los devuelve como JPEG en base64. */
  frames(list, quality = 0.94) {
    return list.map((t) => {
      draw(ctx, t);
      return canvas.toDataURL('image/jpeg', quality).slice('data:image/jpeg;base64,'.length);
    });
  },
  async musicWavBase64(sampleRate = 48000) {
    const buf = await renderMusic(sampleRate);
    return toBase64(bufferToWav(buf));
  },
};

// ---------------------------------------------------------------------------
// Previsualización interactiva (no se usa durante el render)
if (!params.has('render')) {
  const ui = document.getElementById('ui');
  ui.hidden = false;
  const btn = document.getElementById('play');
  const seek = document.getElementById('seek');
  const label = document.getElementById('time');
  let actx = null, music = null, voice = null, sources = [], t0 = 0, offset = 0, playing = false;

  const show = (t) => { draw(ctx, t); seek.value = t; label.textContent = t.toFixed(2) + ' s'; };
  window.APP.ready.then(() => show(0));

  async function prepare() {
    if (actx) return;
    btn.textContent = 'Generando música…';
    actx = new AudioContext();
    music = await renderMusic(actx.sampleRate);
    try {
      const ab = await (await fetch(VOICE_URL)).arrayBuffer();
      voice = await actx.decodeAudioData(ab);
    } catch (e) { console.warn('No se pudo cargar la locución', e); }
  }
  function stop() {
    sources.forEach((s) => { try { s.stop(); } catch (e) {} });
    sources = [];
    playing = false;
    btn.textContent = '▶ Reproducir';
  }
  async function play(from) {
    await prepare();
    stop();
    offset = from;
    t0 = actx.currentTime + 0.05;
    const m = actx.createBufferSource(); m.buffer = music;
    const mg = actx.createGain(); mg.gain.value = 0.5;
    m.connect(mg).connect(actx.destination); m.start(t0, from);
    sources.push(m);
    if (voice) {
      const v = actx.createBufferSource(); v.buffer = voice;
      const vg = actx.createGain(); vg.gain.value = 1.6;
      v.connect(vg).connect(actx.destination);
      const vs = from - VOICE_OFFSET;
      if (vs < 0) v.start(t0 - vs, 0); else v.start(t0, vs);
      sources.push(v);
    }
    playing = true;
    btn.textContent = '❚❚ Pausa';
    const tick = () => {
      if (!playing) return;
      const t = offset + actx.currentTime - t0;
      if (t >= DURATION) { stop(); show(DURATION); return; }
      show(Math.max(0, t));
      requestAnimationFrame(tick);
    };
    tick();
  }
  btn.onclick = () => (playing ? stop() : play(Number(seek.value) >= DURATION - 0.1 ? 0 : Number(seek.value)));
  seek.oninput = () => { if (playing) play(Number(seek.value)); else show(Number(seek.value)); };
}
