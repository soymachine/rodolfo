#!/usr/bin/env node
// Renderiza el vídeo: Playwright dibuja cada fotograma del canvas y FFmpeg los codifica.
// La música se genera en el navegador (OfflineAudioContext) y se mezcla con la locución.
//
//   node render.mjs                     → vídeo completo (../una-manzana-para-la-sed.mp4)
//   node render.mjs --stills 5,12.5,40  → sólo fotogramas sueltos en build/stills/
//   node render.mjs --from 30 --to 40   → un tramo (build/preview.mp4, sin audio final)

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUILD = path.join(HERE, 'build');
const VOICE = path.join(ROOT, 'Locu Una manzana 18_09_11 17_13.m4a');
const OUT = path.join(ROOT, 'una-manzana-para-la-sed.mp4');

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.json': 'application/json' };
function serve() {
  return new Promise((resolve) => {
    const srv = createServer(async (req, res) => {
      try {
        const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (!p.startsWith(ROOT)) throw new Error('fuera de raíz');
        const data = await readFile(p);
        res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404); res.end();
      }
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

function run(cmd, argv, { input } = {}) {
  const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`${cmd} salió con ${c}`)))));
  return { proc: p, done };
}

async function main() {
  await mkdir(BUILD, { recursive: true });
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/video/index.html?render`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[página]', m.text()); });
  page.on('pageerror', (e) => console.error('[página]', e));
  await page.goto(url);
  await page.evaluate(() => window.APP.ready);
  const { FPS, DURATION } = await page.evaluate(() => ({ FPS: APP.FPS, DURATION: APP.DURATION }));

  // --- Fotogramas sueltos
  const stills = opt('stills');
  if (stills) {
    const dir = path.join(BUILD, 'stills');
    await mkdir(dir, { recursive: true });
    const ts = stills.split(',').map(Number);
    const imgs = await page.evaluate((ts) => APP.frames(ts, 0.9), ts);
    await Promise.all(imgs.map((b64, i) => writeFile(path.join(dir, `t${ts[i].toFixed(2).padStart(6, '0')}.jpg`), Buffer.from(b64, 'base64'))));
    console.log(`${ts.length} fotogramas en ${dir}`);
    await browser.close(); srv.close();
    return;
  }

  const from = Number(opt('from', 0)), to = Number(opt('to', DURATION));
  const full = from === 0 && to === DURATION;
  const fps = Number(opt('fps', FPS));

  // --- Música
  const musicPath = path.join(BUILD, 'music.wav');
  const haveMusic = await access(musicPath).then(() => true, () => false);
  if (full || !haveMusic || args.includes('--music')) {
    console.log('Generando música…');
    const b64 = await page.evaluate(() => APP.musicWavBase64(48000));
    await writeFile(musicPath, Buffer.from(b64, 'base64'));
  }

  // --- Vídeo: JPEG por la tubería → H.264
  const silent = path.join(BUILD, full ? 'video-silent.mp4' : 'preview-silent.mp4');
  const enc = run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-tune', 'animation', silent], { input: true });
  const total = Math.round((to - from) * fps);
  const BATCH = 12;
  const t0 = Date.now();
  for (let f = 0; f < total; f += BATCH) {
    const ts = [];
    for (let k = f; k < Math.min(total, f + BATCH); k++) ts.push(from + k / fps);
    const imgs = await page.evaluate((ts) => APP.frames(ts), ts);
    for (const b64 of imgs) {
      if (!enc.proc.stdin.write(Buffer.from(b64, 'base64'))) await new Promise((r) => enc.proc.stdin.once('drain', r));
    }
    const done = Math.min(total, f + BATCH);
    const el = (Date.now() - t0) / 1000;
    process.stdout.write(`\r  fotograma ${done}/${total}  (${(done / el).toFixed(1)} fps, quedan ~${Math.round(el / done * (total - done))} s)   `);
  }
  enc.proc.stdin.end();
  await enc.done;
  console.log();
  await browser.close();
  srv.close();

  // --- Mezcla: locución (comprimida, desplazada 3 s) + música con ducking
  const out = full ? OUT : path.join(BUILD, 'preview.mp4');
  const delayMs = Math.round((3.0 - from) * 1000);
  const voiceChain = delayMs >= 0
    ? `adelay=${delayMs}|${delayMs}`
    : `atrim=start=${-delayMs / 1000},asetpts=PTS-STARTPTS`;
  const filter = [
    `[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0,highpass=f=80,lowpass=f=12000,`
      + `acompressor=threshold=0.08:ratio=3:attack=8:release=180:makeup=2.2,${voiceChain},apad,asplit=2[v][vkey]`,
    `[2:a]aresample=48000,atrim=start=${from},asetpts=PTS-STARTPTS,volume=0.62[m]`,
    `[m][vkey]sidechaincompress=threshold=0.035:ratio=3:attack=60:release=650:makeup=1[md]`,
    `[v][md]amix=inputs=2:normalize=0:duration=longest,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]`,
  ].join(';');
  console.log('Mezclando audio y vídeo…');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', silent, '-i', VOICE, '-i', musicPath,
    '-filter_complex', filter, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(to - from), '-movflags', '+faststart', out]).done;
  console.log('Listo →', out);
}

main().catch((e) => { console.error(e); process.exit(1); });
