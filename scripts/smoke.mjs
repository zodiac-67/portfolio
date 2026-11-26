// Release smoke test: the page loads clean, the game starts and walks at 60 fps, nothing errors.
//   node scripts/smoke.mjs [url]          (default http://localhost:3200; run `npm run build && npm start` first for real numbers)
// Uses playwright-core with an installed Chromium-family browser: BROWSER=/path/to/browser, or Brave / Chrome if present.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const U = process.argv[2] || 'http://localhost:3200';
const exe = [process.env.BROWSER, '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
if (!exe) { console.error('No browser found: set BROWSER=/path/to/chrome'); process.exit(2); }

const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [], game = new Map(), fail = [];
p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
p.on('response', async (r) => {
  const path = new URL(r.url()).pathname;
  if (r.status() >= 400) fail.push(`${r.status()} ${path}`);
  if (path.startsWith('/game/')) game.set(path, Number(r.headers()['content-length']) || (await r.body().catch(() => Buffer.alloc(0))).length);
});
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) process.exitCode = 1; };

const home = await p.goto(U + '/', { waitUntil: 'networkidle' });
check(home.ok(), `home page ${home.status()}`);
const music = await p.request.get(U + '/api/lastfm');
check(music.ok() && Array.isArray((await music.json()).tracks), `/api/lastfm ${music.status()}`);
check((await p.request.get(U + '/robots.txt')).ok() && (await p.request.get(U + '/sitemap.xml')).ok(), 'robots.txt and sitemap.xml');

await p.goto(U + '/?gamedebug#contact', { waitUntil: 'networkidle' });
await p.locator('.g-screen').scrollIntoViewIfNeeded();
const t0 = Date.now(); await p.click('.g-play'); await p.waitForSelector('.g-full', { timeout: 60000 });
check(true, `game loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(([...game.values()].reduce((a, n) => a + n, 0)) / 1e6).toFixed(1)} MB from /game/`);
await p.click('.g-full'); await p.waitForTimeout(2500);

const walk = async (label, x, z, yaw) => {
  await p.evaluate(([x, z, yaw]) => window.__game.place(x, z, yaw, 0.3), [x, z, yaw]); await p.waitForTimeout(2500);
  const ft = p.evaluate(async () => { const o = []; for (let i = 0; i < 420; i++) { const t = performance.now(); await new Promise((r) => requestAnimationFrame(r)); o.push(performance.now() - t); } return o; });
  await p.focus('.g-screen'); await p.keyboard.down('KeyW'); await p.waitForTimeout(6700); await p.keyboard.up('KeyW');
  const o = (await ft).sort((a, b) => a - b), slow = o.filter((v) => v > 25).length;
  check(o[210] < 17.5 && slow <= 2, `${label}: median ${o[210].toFixed(1)} ms, worst ${o[o.length - 1].toFixed(1)} ms, ${slow} frames over 25 ms`);
};
await walk('walk to the farm', -6, 20, -1.2);
await walk('walk to the square', 6, -20, -0.3);

check(!fail.length, `no failed requests${fail.length ? ': ' + fail.join(', ') : ''}`);
check(!errors.length, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
if (process.env.LIST) console.log([...game.keys()].sort().join('\n'));
await b.close();
