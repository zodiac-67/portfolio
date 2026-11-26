// Renders video/ad.html into the finished ad: 45 s, 1920x1080, 30 fps, with the original score.
// Frames are captured at 2x (3840x2160) and downscaled for crisp text, piped straight into ffmpeg.
//
//   node video/music.mjs video/out/score.wav
//   node video/render.mjs
//
// Needs ffmpeg on PATH and the Playwright Chromium (npx playwright-core install chromium).

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'out');
const FPS = 30, DUR = 45, FRAMES = FPS * DUR;
const master = join(OUT, 'ad-master-1080p.mp4');
mkdirSync(OUT, { recursive: true });

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', join(OUT, 'score.wav'),
  '-filter_complex', '[0:v]scale=1920:1080:flags=lanczos,format=yuv420p[v];[1:a]loudnorm=I=-19:TP=-2:LRA=11[a]',
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-profile:v', 'high', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-t', String(DUR), '-movflags', '+faststart', master,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

// Playwright's Chromium, or an installed Chromium-family browser (BROWSER=/path, else Brave or Chrome if present)
const exe = [process.env.BROWSER, '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
await page.goto('file://' + join(here, 'ad.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => window.ready);
const t0 = Date.now();
for (let f = 0; f < FRAMES; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
  if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) console.log(`frame ${f}/${FRAMES} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await browser.close();
await done;
console.log(`wrote ${master} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
