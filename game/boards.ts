import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Island } from './island';
import type { Terrain } from './terrain';
import { LOCATION, NAME, ROLE, STACK } from '../lib/site';
import { games, hitmen, nova, himalaya, security, letters, maskMode, liven } from './poster_art';

// Things to read around the village: woodblock-print posters on house walls, hanging scrolls in the pagoda, the notice
// board in the square, the music board beside Yuki, nobori banners and paper lanterns. Every picture is drawn in code
// into one canvas atlas at load (nothing to download) and everything is five merged meshes. Facts come from the site.

export type Art = (c: CanvasRenderingContext2D, w: number, h: number) => void;
/** line: the one short caption printed under a poster's headline (the rest waits on the reading sheet); body: the sheet's full text */
export type Doc = { title: string; kicker: string; line?: string; points?: string[]; body: string[]; link?: string; cta?: string; art?: Art };
export type Read = { id: string; label: string; at: THREE.Vector3; face: THREE.Vector3; radius: number; doc: Doc };

const INK = '#1b1714', PAPER = '#efe2c4', PRUSSIAN = '#2a4d74', INDIGO = '#1e2c5e', VERMILION = '#c4472f', SNOW = '#f7f3ea';
const SERIF = 'Georgia, "Times New Roman", serif';
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
type C = CanvasRenderingContext2D;

// ---------------------------------------------------------------- drawing helpers (a 460 x 494 picture space)
const ink = (c: C, w: number) => { c.strokeStyle = INK; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round'; };
const poly = (c: C, p: number[], fill: string, stroke = true) => {
  c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath();
  c.fillStyle = fill; c.fill(); if (stroke) c.stroke();
};
const disc = (c: C, x: number, y: number, r: number, fill: string, stroke = true) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) c.stroke(); };
const sky = (c: C, top: string, bottom: string) => { const g = c.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(0, 0, 460, 494); };
/** a picture: clipped, scaled from the 460 x 494 design space to whatever box it is drawn into, ink outlines */
const A = (draw: (c: C) => void): Art => (c, w, h) => { c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 460, h / 494); ink(c, 4); draw(c); c.restore(); };

const paper = (c: C, w: number, h: number) => {
  c.fillStyle = PAPER; c.fillRect(0, 0, w, h); c.globalAlpha = 0.07; c.strokeStyle = '#7a6040'; c.lineWidth = 1;
  for (let i = 0; i < (w * h) / 900; i++) { const x = rnd() * w, y = rnd() * h, a = rnd() * 6.28; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); c.stroke(); }
  c.globalAlpha = 1; const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(90, 60, 30, 0)'); g.addColorStop(1, 'rgba(90, 60, 30, .2)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
};
const wrap = (c: C, text: string, x: number, y: number, maxW: number, lh: number, maxLines = 99) => {
  const words = text.split(' '); let line = '', n = 0;
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return n; } else line = t;
  }
  if (line) c.fillText(line, x, y + n++ * lh); return n;
};
const fit = (c: C, text: string, weight: string, size: number, maxW: number) => { do c.font = `${weight} ${size--}px ${SERIF}`; while (c.measureText(text).width > maxW && size > 10); };

// ---------------------------------------------------------------- the scroll and music-board pictures (the posters' prints are in poster_art.ts)
const lanterns = A((c) => {
  sky(c, '#2a2148', '#c4472f'); ink(c, 3); c.fillStyle = '#3b2a20'; c.fillRect(0, 40, 460, 18); c.strokeRect(-4, 40, 468, 18);
  [['Agents', 90], ['Products', 230], ['Automation', 370]].forEach(([t, x]) => {
    const X = x as number, g = c.createRadialGradient(X, 200, 10, X, 200, 110); g.addColorStop(0, 'rgba(255, 190, 110, .55)'); g.addColorStop(1, 'rgba(255, 190, 110, 0)');
    c.fillStyle = g; c.fillRect(X - 110, 90, 220, 220); c.beginPath(); c.moveTo(X, 58); c.lineTo(X, 112); c.stroke();
    c.beginPath(); c.ellipse(X, 196, 50, 76, 0, 0, Math.PI * 2); c.fillStyle = VERMILION; c.fill(); c.stroke();
    ink(c, 2); for (const dy of [-44, -14, 16, 46]) { c.beginPath(); c.ellipse(X, 196 + dy, 50 * Math.cos(dy / 80), 6, 0, 0, Math.PI); c.stroke(); } ink(c, 3);
    c.fillStyle = INK; c.fillRect(X - 26, 112, 52, 10); c.fillRect(X - 26, 270, 52, 10);
    c.fillStyle = SNOW; c.font = `bold 24px ${SERIF}`; c.textAlign = 'center'; c.fillText(t as string, X, 330);
  });
  c.textAlign = 'left';
});
const biwa = A((c) => {
  sky(c, '#f3e6c9', PAPER); c.strokeStyle = PRUSSIAN; c.lineWidth = 3; c.globalAlpha = 0.6;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(250, 120 + i * 50); c.bezierCurveTo(320, 90 + i * 50, 380, 150 + i * 50, 460, 110 + i * 50); c.stroke(); }
  c.globalAlpha = 1; c.save(); c.translate(170, 270); c.rotate(-0.45); ink(c, 4);
  c.beginPath(); c.ellipse(0, 60, 82, 108, 0, 0, Math.PI * 2); c.fillStyle = '#9a5a2e'; c.fill(); c.stroke();
  c.fillStyle = '#6b3a1e'; c.fillRect(-14, -170, 28, 140); c.strokeRect(-14, -170, 28, 140); poly(c, [-14, -170, 14, -170, 24, -214, -4, -214], '#6b3a1e');
  for (const y of [-196, -180]) { c.fillStyle = INK; c.fillRect(-30, y, 16, 6); c.fillRect(18, y, 16, 6); }
  c.fillStyle = INK; c.fillRect(-46, 104, 92, 14);
  c.strokeStyle = SNOW; c.lineWidth = 1.5; for (const x of [-9, -3, 3, 9]) { c.beginPath(); c.moveTo(x, -170); c.lineTo(x * 1.6, 110); c.stroke(); }
  c.restore();
});

// ---------------------------------------------------------------- what the boards say (facts from the site only)
const NOVA: Doc = {
  title: 'Nova OS', kicker: 'A private AI workspace', line: 'Your own keys. Asks before it acts.', art: nova,
  body: ['A personal AI workspace that runs on your own model keys, does real work through tasks and routines, asks before it acts, and only remembers what you choose to share.', 'Built solo in three weeks: 176 commits.'],
  link: '/work/nova-os', cta: 'Read the Nova OS case study',
};
const HITMEN: Doc = {
  title: 'Hitmen', kicker: 'Gmail auto-draft agent', line: 'Drafts your replies. Never sends.', art: hitmen,
  body: ['Tag an email and Hitmen drafts the reply in the right tone, formal for the invoice and casual for the friend, then waits for you to hit send. It never sends on its own.',
    'Built twice, on purpose: first in Python on the Gmail API, then as a Google Apps Script that runs inside Gmail with no server to maintain.'],
  link: '/work/hitmen', cta: 'Read the Hitmen case study',
};
const POSTERS: Doc[] = [
  { title: 'Worlds He Loves', kicker: 'Games', line: 'Elden Ring · Arkham Knight · Red Dead Redemption', art: games,
    body: ['Elden Ring, Arkham Knight and Red Dead Redemption.', 'Good worlds make you want to walk a little further. That is what this island is for.'] },
  HITMEN, NOVA,
  { title: 'The Himalaya', kicker: 'Where he would rather be', line: 'High passes, wildlife, the high peaks.', art: himalaya,
    body: ['The mountains: high passes, wildlife, and the Himalaya above all.', 'Up there, a long climb is only many small steps.'] },
  { title: 'Security First', kicker: 'Built in from the first stone', line: 'Ethical hacking, Coventry University', art: security,
    body: ['Trained in ethical hacking at Coventry University.', 'Security is laid with the first stone, never patched on afterwards. In Nova OS that means session revocation, two-factor sign-in, and protection against requests to internal addresses.'] },
  { title: 'Letters Welcome', kicker: 'Write to Aasish', line: 'Tell Aasish what eats your week.', art: letters,
    body: ['If something eats your week, tell Aasish. He will write back with what an agent could take off your hands.', 'The contact form is right beside this village.'],
    link: 'contact', cta: 'Write to Aasish' },
];
const POSTER_HOUSES = [0, 4, 1, 2, 3, 5];                                         // which house wall each poster is pasted on
const SCROLLS: Doc[] = [
  { ...NOVA, kicker: 'Solo build · 3 weeks · 176 commits', points: ['Your keys, any model', 'Chat that survives', 'Real work, queued', 'Asks before acting', 'Memory you choose', 'Locked down'],
    body: ['Your keys, any model. Bring keys for OpenAI or any OpenAI-compatible provider. Keys are encrypted at rest and never reach the browser.',
      'Real work, queued. A durable task engine runs 1 to 10 jobs in parallel, with attempt history and downloadable receipts.',
      'Asks before acting. Tools that change anything wait for your approval, with a clear card showing exactly what will happen.',
      'Memory you choose. Opt-in notes from your own Obsidian vault. Only ticked notes are sent.',
      'Stack: TypeScript, React, Vite, Fastify, PostgreSQL (PGlite), Prisma, WebSockets, Zod, Three.js.'] },
  { title: 'What He Builds', kicker: `${ROLE} · ${LOCATION}`, art: lanterns, points: ['AI agents', 'LLM-powered products', 'Workflow automation'],
    body: ['AI agents. Agents that read, decide and act inside the tools you already use, and stop to ask you before anything risky.',
      'LLM-powered products. Chat, search and document features on the model you choose, with your keys and your data staying yours.',
      'Workflow automation. The repetitive parts of your week handled on a schedule: inboxes, reports, follow-ups, hand-offs.'],
    link: 'contact', cta: 'Write to Aasish' },
  { ...HITMEN, kicker: 'Solo build · July 2026', points: ['Label-triggered', 'The right tone', 'Threaded drafts', 'Never sends', 'Tidy by design', 'No server needed'],
    body: ['Label-triggered. Only emails you tag “Auto D” are touched. Everything else in your inbox is left alone.',
      'The right tone. Tone comes from per-sender profiles, or is detected from keywords, the sender’s domain and the message itself.',
      'Threaded drafts. Drafts land inside the original thread, ready to edit.', 'Never sends. Hitmen only writes drafts. A person always reads and sends.',
      'Stack: Python, Gmail API (OAuth 2.0), Google Apps Script, Google GenAI SDK, OpenRouter.'] },
];
const NOTICE: Doc = {
  title: 'Village Notices', kicker: `${NAME} · ${ROLE} · ${LOCATION}`,
  body: ['He builds AI agents, LLM-powered products and workflow automation.', `Tools of the trade: ${STACK.join(' · ')}.`,
    'Two of his builds hang as scrolls in the pagoda up the hill.', 'Letters: leave a note at the tea house, or use the contact form.'],
  link: 'contact', cta: 'Write to Aasish',
};
const MUSIC: Doc = {
  title: 'Songs on Repeat', kicker: 'Beside Yuki, under the sakura', art: biwa,
  body: ['“Still Got the Blues” by Gary Moore.', '“Dogs” by Pink Floyd.', 'His five most-played songs of the week are pinned here.'],
};
/** his top five of the last 7 days (app/api/lastfm), set before the atlas is drawn; empty shows the two favourites */
export type Track = { name: string; artist: string; plays: number };
let week: Track[] = [];
/** the week's chart for the board, or [] if it isn't there within a moment (no keys on this host, Last.fm slow or down) */
export const loadWeek = (): Promise<Track[]> => Promise.race([
  fetch('/api/lastfm').then((r) => (r.ok ? r.json() : null)).then((j) => (Array.isArray(j?.tracks) ? (j.tracks as Track[]).slice(0, 5) : [])).catch(() => []),
  new Promise<Track[]>((ok) => setTimeout(() => ok([]), 2500)),
]);
const FLAGS = ['WELCOME', 'WELCOME', 'TEA', 'FORGE', 'POST', 'SCROLLS', 'TALES'];

// ---------------------------------------------------------------- the atlas: where each board lives in the 2048 canvas
const W = 2048;
const R = {
  poster: [[0, 0], [512, 0], [1024, 0], [1536, 0], [0, 768], [512, 768]], scroll: [[1024, 768], [1344, 768], [1664, 768]],
  notice: [0, 1536], music: [1024, 1536],
};

function drawAtlas(c: C) {
  POSTERS.forEach((d, i) => {                                                      // the print above, a big headline and one short line below
    const [x, y] = R.poster[i]; c.save(); c.translate(x, y); paper(c, 512, 768);
    c.save(); c.translate(24, 24); d.art!(c, 464, 498); c.restore(); ink(c, 3); c.strokeRect(24, 24, 464, 498); ink(c, 1.5); c.strokeRect(17, 17, 478, 512);
    c.textAlign = 'center'; c.fillStyle = INK; fit(c, d.title.toUpperCase(), 'bold', 68, 456); c.fillText(d.title.toUpperCase(), 256, 622);
    c.fillStyle = VERMILION; c.fillRect(222, 646, 68, 5);
    c.fillStyle = '#3a3128'; fit(c, d.line!, 'italic', 30, 456); c.fillText(d.line!, 256, 700);
    ink(c, 3); c.strokeRect(7, 7, 498, 754); c.restore();
  });
  SCROLLS.forEach((d, i) => {
    const [x, y] = R.scroll[i]; c.save(); c.translate(x, y); c.fillStyle = INDIGO; c.fillRect(0, 0, 320, 768);
    c.fillStyle = 'rgba(217, 164, 65, .45)'; for (let yy = 8; yy < 768; yy += 18) for (let xx = (yy / 18) % 2 ? 8 : 17; xx < 320; xx += 18) c.fillRect(xx, yy, 3, 3);
    c.translate(22, 70); paper(c, 276, 600);
    c.save(); c.translate(16, 16); d.art!(c, 244, 262); c.restore(); ink(c, 3); c.strokeRect(16, 16, 244, 262);
    c.textAlign = 'center'; c.fillStyle = INK; fit(c, d.title, 'bold', 32, 250); c.fillText(d.title, 138, 322);
    c.fillStyle = VERMILION; fit(c, d.kicker, 'italic', 16, 250); c.fillText(d.kicker, 138, 348);
    c.fillStyle = '#3a3128'; c.font = `19px ${SERIF}`; d.points!.forEach((p, k) => c.fillText(p, 138, 392 + k * 32));
    c.restore();
  });
  { // the notice board: a paper sheet and sixteen wooden tool tags on planks
    const [x, y] = R.notice; c.save(); c.translate(x, y); c.fillStyle = '#5a3d2b'; c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = 'rgba(20, 10, 5, .35)'; c.lineWidth = 2; for (let yy = 0; yy < 512; yy += 64) { c.beginPath(); c.moveTo(0, yy); c.lineTo(1024, yy); c.stroke(); }
    c.save(); c.translate(28, 26); c.rotate(-0.01); paper(c, 470, 460); ink(c, 3); c.strokeRect(0, 0, 470, 460);
    c.textAlign = 'center'; c.fillStyle = INK; c.font = `bold 40px ${SERIF}`; c.fillText('VILLAGE NOTICES', 235, 62);
    c.fillRect(60, 80, 350, 3); c.font = `bold 32px ${SERIF}`; c.fillText(NAME, 235, 136);
    c.fillStyle = VERMILION; c.font = `italic 22px ${SERIF}`; c.fillText(`${ROLE} · ${LOCATION}`, 235, 170);
    c.fillStyle = '#3a3128'; c.font = `22px ${SERIF}`; wrap(c, NOTICE.body[0], 235, 222, 400, 30);
    wrap(c, NOTICE.body[2], 235, 310, 400, 30); c.font = `italic 20px ${SERIF}`; wrap(c, NOTICE.body[3], 235, 398, 400, 28);
    c.restore();
    c.save(); c.translate(530, 26); paper(c, 466, 56); ink(c, 3); c.strokeRect(0, 0, 466, 56);
    c.textAlign = 'center'; c.fillStyle = INK; c.font = `bold 28px ${SERIF}`; c.fillText('TOOLS OF THE TRADE', 233, 39); c.restore();
    STACK.forEach((t, i) => {
      const tx = 530 + (i % 4) * 118, ty = 108 + Math.floor(i / 4) * 98; disc(c, tx + 55, ty - 6, 4, '#c9c2b4', false);
      c.fillStyle = '#d9b98c'; c.beginPath(); c.roundRect(tx, ty, 110, 70, 8); c.fill(); ink(c, 3); c.stroke();
      c.fillStyle = INK; fit(c, t, 'bold', 19, 98); c.fillText(t, tx + 55, ty + 43);
    });
    c.restore();
  }
  { // the music board beside Yuki
    const [x, y] = R.music; c.save(); c.translate(x, y); paper(c, 768, 512); ink(c, 8); c.strokeRect(8, 8, 752, 496);
    c.textAlign = 'center'; c.fillStyle = INK; c.font = `bold 44px ${SERIF}`; c.fillText('SONGS ON REPEAT', 384, 72);
    c.save(); c.translate(36, 104); biwa(c, 250, 268); c.restore(); ink(c, 3); c.strokeRect(36, 104, 250, 268);
    c.textAlign = 'left';
    if (week.length) {                                                               // this week's five, numbered, under a small heading
      c.fillStyle = VERMILION; c.font = `bold 22px ${SERIF}`; c.fillText('THIS WEEK', 316, 120);
      week.forEach((tr, i) => {
        const yy = 160 + i * 52; c.fillStyle = VERMILION; c.font = `bold 26px ${SERIF}`; c.fillText(`${i + 1}`, 316, yy);
        c.fillStyle = INK; fit(c, tr.name, 'bold', 26, 380); c.fillText(tr.name, 348, yy);
        c.fillStyle = '#5a4d3e'; fit(c, tr.artist, 'italic', 19, 380); c.fillText(tr.artist, 348, yy + 22);
      });
    } else [['Still Got the Blues', 'Gary Moore', 150], ['Dogs', 'Pink Floyd', 268]].forEach(([s, a, yy]) => {
      c.fillStyle = INK; fit(c, s as string, 'bold', 34, 420); c.fillText(s as string, 316, yy as number);
      c.fillStyle = VERMILION; c.font = `italic 26px ${SERIF}`; c.fillText(a as string, 316, (yy as number) + 38);
    });
    c.setLineDash([10, 8]); c.beginPath(); c.moveTo(36, 410); c.lineTo(732, 410); c.stroke(); c.setLineDash([]);
    c.textAlign = 'center'; c.fillStyle = '#6a5d4e'; c.font = `italic 24px ${SERIF}`;
    c.fillText(week.length ? 'Favourites: “Still Got the Blues” · “Dogs”' : 'His top five of each week will be pinned here.', 384, 458);
    c.restore();
  }
  c.textAlign = 'left';
}

/** where the prints come alive (a quarter-size twin of the atlas): red water, green sky, blue falling petals */
function drawMask(c: C) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, W); maskMode(true);
  POSTERS.forEach((d, i) => { const [x, y] = R.poster[i]; c.save(); c.translate(x + 24, y + 24); d.art!(c, 464, 498); c.restore(); });
  maskMode(false);
}
export { drawAtlas, drawMask };   // for the atlas preview harness

function drawFlags(c: C) {
  FLAGS.forEach((word, i) => {
    const x = i * 128, bg = [INDIGO, INDIGO, SNOW, VERMILION, INDIGO, SNOW, VERMILION][i], fg = bg === SNOW ? INDIGO : SNOW;
    c.fillStyle = bg; c.fillRect(x, 0, 128, 512); c.fillStyle = fg; c.fillRect(x, 0, 128, 22); c.fillRect(x, 0, 24, 512);            // the loops along the pole
    c.font = `bold 54px ${SERIF}`; c.textAlign = 'center'; const step = Math.min(64, 440 / word.length);
    [...word].forEach((ch, k) => c.fillText(ch, x + 76, 62 + (512 - 62 - step * word.length) / 2 + k * step + step * 0.75));
  });
  c.textAlign = 'left';
}

// ---------------------------------------------------------------- the 3D side
export function buildBoards(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, low: boolean, aniso: number, yuki?: { x: number; z: number; yaw: number }, chart: Track[] = []) {
  week = chart;
  if (week.length) MUSIC.body = [...week.map((tr, i) => `${i + 1}. “${tr.name}” by ${tr.artist}.`), 'Favourites, always: “Still Got the Blues” by Gary Moore and “Dogs” by Pink Floyd.'];
  const k = low ? 0.5 : 1, canvas = (w: number, h: number, draw: (c: C) => void) => {
    const cv = document.createElement('canvas'); cv.width = w * k; cv.height = h * k; const c = cv.getContext('2d')!; c.scale(k, k); draw(c);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = aniso; return tex;
  };
  const atlas = canvas(W, W, drawAtlas), flagTex = canvas(1024, 512, drawFlags), maskTex = canvas(512, 512, (c) => { c.scale(0.25, 0.25); drawMask(c); });
  maskTex.colorSpace = THREE.NoColorSpace; maskTex.anisotropy = 1;

  const wood: THREE.BufferGeometry[] = [], faces: THREE.BufferGeometry[] = [], hall: THREE.BufferGeometry[] = [], glow: THREE.BufferGeometry[] = [], flags: THREE.BufferGeometry[] = [];
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  type Root = { x: number; y: number; z: number; yaw: number };
  /** a point in a root's own frame (x right, y up, z forward) */
  const at = (r: Root, lx: number, ly: number, lz: number) => new THREE.Vector3(r.x + Math.cos(r.yaw) * lx + Math.sin(r.yaw) * lz, r.y + ly, r.z - Math.sin(r.yaw) * lx + Math.cos(r.yaw) * lz);
  const put = (list: THREE.BufferGeometry[], g: THREE.BufferGeometry, r: Root, lx: number, ly: number, lz: number, turn = 0) => { list.push(g.applyMatrix4(m4.compose(at(r, lx, ly, lz), q.setFromAxisAngle(Y, r.yaw + turn), one))); };
  const box = (r: Root, w: number, h: number, d: number, lx: number, ly: number, lz: number, tilt = 0) => put(wood, new THREE.BoxGeometry(w, h, d).rotateX(tilt), r, lx, ly, lz);
  const solid = (r: Root, hx: number, hy: number, hz: number, ly: number) => { const p = at(r, 0, ly, 0); world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, p.y, p.z).setRotation(q.setFromAxisAngle(Y, r.yaw)), body); };
  /** a plane showing one atlas region, facing the root's forward */
  const face = (rx: number, ry: number, rw: number, rh: number, w: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (rx + uv.getX(i) * rw) / W, 1 - (ry + (1 - uv.getY(i)) * rh) / W);
    return g;
  };
  const reads: Read[] = [];
  const ground = (x: number, z: number, yaw: number): Root => ({ x, y: t.heightAt(x, z), z, yaw });

  // posters pasted on the south side wall of six houses, near the front corner (seen as you walk up from the pier)
  POSTERS.forEach((d, i) => {
    const [hx, hz, hyaw] = I.houses[POSTER_HOUSES[i]], [wide, deep] = POSTER_HOUSES[i] % 2 ? [8, 7] : [7, 8];
    const side = Math.sin(hyaw) >= 0 ? 1 : -1;                                     // the side wall that faces south (-z)
    const n = new THREE.Vector2(side * Math.cos(hyaw), -side * Math.sin(hyaw)), wallYaw = Math.atan2(n.x, n.y);
    const f = new THREE.Vector2(Math.sin(hyaw), Math.cos(hyaw)), half = (wide - 0.4) / 2 + 0.03, along = deep / 2 - 1.5;
    const r: Root = { x: hx + n.x * half + f.x * along, y: t.heightAt(hx, hz) - 0.05 + 1.75, z: hz + n.y * half + f.y * along, yaw: wallYaw };
    const [rx, ry] = R.poster[i]; put(faces, face(rx, ry, 512, 768, 1.1, 1.65), r, 0, 0, 0);
    reads.push({ id: `poster${i}`, label: `Read the poster: ${d.title}`, at: at(r, 0, 0.2, 0.9), face: at(r, 0, 0, 0), radius: 2.4, doc: d });
  });

  // hanging scrolls on the three inner walls of the pagoda's ground floor
  const P = I.spots.pagoda, floor = P.y + 0.83;
  SCROLLS.forEach((d, i) => {
    const turn = [Math.PI / 2, 0, -Math.PI / 2][i], lx = [-2.86, 0, 2.86][i], lz = [-0.3, -2.86, -0.3][i];
    const c0 = at({ x: P.x, y: floor, z: P.z, yaw: P.yaw }, lx, 1.3, lz), r: Root = { x: c0.x, y: c0.y, z: c0.z, yaw: P.yaw + turn };
    const [rx, ry] = R.scroll[i]; put(hall, face(rx, ry, 320, 768, 0.8, 1.92), r, 0, 0, 0.01);
    box(r, 0.92, 0.05, 0.05, 0, 0.98, 0.03); box(r, 0.98, 0.07, 0.07, 0, -0.98, 0.04);
    reads.push({ id: `scroll${i}`, label: `Read the scroll: ${d.title}`, at: at(r, 0, 0, 1.0), face: c0, radius: 1.9, doc: d });
  });

  // a roofed board on two posts: the notice board in the square and the smaller music board beside Yuki. The notices
  // are pasted on both faces (it's seen from the path behind as well), and either side offers them to read
  const kosatsu = (r: Root, w: number, h: number, region: number[], rw: number, rh: number) => {
    const top = 1.05 + h;
    for (const sx of [-1, 1]) box(r, 0.14, top + 0.25, 0.14, sx * (w / 2 + 0.12), (top + 0.25) / 2, -0.05);
    box(r, w + 0.16, h + 0.16, 0.06, 0, 1.05 + h / 2, -0.05);
    put(faces, face(region[0], region[1], rw, rh, w, h), r, 0, 1.05 + h / 2, 0);
    put(faces, face(region[0], region[1], rw, rh, w, h), r, 0, 1.05 + h / 2, -0.1, Math.PI);
    box(r, w + 0.7, 0.05, 0.42, 0, top + 0.36, 0.17, 0.45); box(r, w + 0.7, 0.05, 0.42, 0, top + 0.36, -0.27, -0.45);
    solid(r, w / 2 + 0.22, (top + 0.3) / 2, 0.14, (top + 0.3) / 2);
  };
  const S = I.spots.square, fb = I.props.footbridge[0], nb = ground(S.x + 6.5, S.z - 1, 0);   // west side, where the footbridge path comes in
  nb.yaw =Math.atan2((S.x + fb[0]) / 2 - nb.x, (S.z + fb[1]) / 2 - nb.z);                   // faces both the square and people coming over the footbridge
  kosatsu(nb, 2.4, 1.2, R.notice, 1024, 512);
  reads.push({ id: 'notice', label: 'Read the notice board', at: at(nb, 0, 1.6, 1.0), face: at(nb, 0, 1.65, 0), radius: 3, doc: NOTICE },
    { id: 'notice_back', label: 'Read the notice board', at: at(nb, 0, 1.6, -1.1), face: at(nb, 0, 1.65, -0.1), radius: 3, doc: NOTICE });
  if (yuki) {
    const sak = I.spots.sakura, rx = Math.cos(yuki.yaw), rz = -Math.sin(yuki.yaw);
    const s = (yuki.x + rx - sak.x) ** 2 + (yuki.z + rz - sak.z) ** 2 > (yuki.x - rx - sak.x) ** 2 + (yuki.z - rz - sak.z) ** 2 ? 1 : -1;   // the side away from the tree
    const mb = ground(yuki.x + s * rx * 1.9, yuki.z + s * rz * 1.9, yuki.yaw);
    kosatsu(mb, 1.5, 1.0, R.music, 768, 512);
    reads.push({ id: 'music', label: 'Read the music board', at: at(mb, 0, 1.5, 0.9), face: at(mb, 0, 1.55, 0), radius: 2.2, doc: MUSIC },
      { id: 'music_back', label: 'Read the music board', at: at(mb, 0, 1.5, -1.0), face: at(mb, 0, 1.55, -0.1), radius: 2.2, doc: MUSIC });
  }

  // nobori banners: a pole, a crossbar and a cloth that sways (its free edge more than the pole edge)
  const rel = (s: { x: number; z: number; yaw: number }, fw: number, sd: number): [number, number] => [s.x + Math.sin(s.yaw) * fw + Math.cos(s.yaw) * sd, s.z + Math.cos(s.yaw) * fw - Math.sin(s.yaw) * sd];
  const sp = I.spots, fire = I.props.firepit[0];
  const spotsF: [number, number, number][] = [
    [3.6, -48.5, Math.PI], [-3.6, -48.5, Math.PI],
    [...rel(sp.teahouse, 5.5, -3.2), sp.teahouse.yaw], [...rel(sp.smithy, 3.2, -2.8), sp.smithy.yaw], [...rel(sp.post, 3.5, 2.4), sp.post.yaw],
    [...rel(sp.pagoda, 5.6, 3.2), sp.pagoda.yaw], [fire[0] + 4.7, fire[1] - 3.9, Math.atan2(-4.7, 3.9)],
  ];
  spotsF.forEach(([x, z, yaw], i) => {
    const r = ground(x, z, yaw); put(wood, new THREE.CylinderGeometry(0.045, 0.055, 4.8, 6).translate(0, 2.4, 0), r, 0, 0, 0);
    put(wood, new THREE.CylinderGeometry(0.025, 0.025, 0.72, 5).rotateZ(Math.PI / 2), r, 0.36, 4.5, 0); solid(r, 0.07, 2.4, 0.07, 2.4);
    const g = new THREE.PlaneGeometry(0.62, 2.6, 3, 8), uv = g.attributes.uv, pos = g.attributes.position, sw = new Float32Array(pos.count * 2), ph = rnd() * 6;
    for (let v = 0; v < pos.count; v++) {
      uv.setXY(v, (i * 128 + uv.getX(v) * 128) / 1024, uv.getY(v));
      sw[v * 2] = ((pos.getX(v) + 0.31) / 0.62) * (0.35 + 0.65 * (1 - (pos.getY(v) + 1.3) / 2.6)); sw[v * 2 + 1] = ph;
    }
    g.setAttribute('aSw', new THREE.BufferAttribute(sw, 2)); put(flags, g, r, 0.36, 3.18, 0);
  });

  // red paper lanterns under the front eaves of every house
  const lathe = new THREE.LatheGeometry([[0, -0.22], [0.12, -0.21], [0.18, -0.12], [0.2, 0], [0.18, 0.12], [0.12, 0.21], [0, 0.22]].map(([a, b]) => new THREE.Vector2(a, b)), 10);
  I.houses.forEach(([hx, hz, hyaw], i) => {
    const [wide, deep] = i % 2 ? [8, 7] : [7, 8], r: Root = { x: hx, y: t.heightAt(hx, hz) - 0.05, z: hz, yaw: hyaw };
    for (const sx of [-1, 1]) {
      const lx = sx * (wide / 2 - 0.7), lz = deep / 2 + 0.4;
      put(glow, lathe.clone(), r, lx, 2.42, lz); box(r, 0.25, 0.05, 0.25, lx, 2.66, lz); box(r, 0.25, 0.05, 0.25, lx, 2.18, lz); box(r, 0.02, 0.3, 0.02, lx, 2.84, lz);
    }
  });

  // five meshes in all; the posters' water, sky and petals move in the faces material (liven), no extra meshes
  const time = { value: 0 };
  const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 1 });
  flagMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\nattribute vec2 aSw;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normal * aSw.x * (sin(uTime * 2.1 + aSw.y + position.y * 1.4) * 0.09 + sin(uTime * 3.7 + aSw.y * 2.0) * 0.03);');
  };
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material, cast: boolean) => {
    if (!list.length) return; const m = new THREE.Mesh(mergeGeometries(list)!, mat); m.castShadow = cast && !low; m.receiveShadow = true; scene.add(m);
  };
  add(wood, new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.9 }), true);
  const faceMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.92 }); liven(faceMat, maskTex, time); add(faces, faceMat, false);
  add(hall, new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.92, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.32 }), false);   // lamp-lit, inside the dark hall
  add(glow, new THREE.MeshStandardMaterial({ color: 0xc8402c, emissive: 0xff7a3a, emissiveIntensity: 0.55, roughness: 0.8 }), false);
  add(flags, flagMat, false);

  return { reads, update: (elapsed: number) => { time.value = elapsed; } };
}
