import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Island } from './island';
import type { Terrain } from './terrain';

// Shop dressing and the market corner. The stalls' frames, counters and goods are prefabs in village.glb (merged with the
// village); everything made of cloth, paper or painted board is here: carved signboards lettered with each shop's name,
// noren at the doors, striped awnings, paper lanterns with each shop's mark, hanging wind bells, kites, temari, strings of
// persimmons, candy bags, and (decor.ts) the washing on the lines between houses. All of it is ONE mesh on one canvas
// atlas: a vertex attribute says how far each corner swings (cloth hangs from its top edge, a lantern from its cord) and
// the vertex shader sways it. The lantern paper glows. Pinwheels on the toy stall spin: one instanced draw.

export type Stall = { id: string; name: string; x: number; z: number; yaw: number; vendor: { x: number; z: number; yaw: number } };
const MARKET = [['fruit', 'Fruit & Greens', 0.5], ['toys', 'Kites & Toys', 3.6], ['sweets', 'Sweets', 6.7]] as const;

/** the market corner: three stalls in a row on the flat east side of the square (between the north path and the stream),
 * counters facing the path, 1.2 m between them to walk through. The vendor stands behind the counter. */
export function marketStalls(I: Island, t: Terrain): Stall[] {
  const S = I.spots.square, yaw = -Math.PI / 2, f = [Math.sin(yaw), Math.cos(yaw)];
  void t;                                                                          // (the square is flat: no need to look)
  return MARKET.map(([id, name, dz]) => {
    const x = S.x + 3, z = S.z + dz;
    return { id, name, x, z, yaw, vendor: { x: x - f[0] * 0.95, z: z - f[1] * 0.95, yaw } };
  });
}

// ---------------------------------------------------------------- the atlas (1024 x 1152, drawn once)
type Rect = [number, number, number, number];                                     // u0 v0 u1 v1
const W = 1024, H = 1152;
const cell = (x: number, y: number, w: number, h: number, pad = 2): Rect => [(x + pad) / W, 1 - (y + h - pad) / H, (x + w - pad) / W, 1 - (y + pad) / H];
type ShopId = 'smithy' | 'post' | 'workshop' | 'teahouse' | 'fruit' | 'toys' | 'sweets';
const SHOPS: [ShopId, string, string, string][] = [                                // id, sign, colour, mark
  ['smithy', "Genzo's Forge", '#7a2e1c', 'anvil'], ['post', "Hana's Post Station", '#1e2c5e', 'letter'], ['workshop', "Sora's Clockwork", '#235650', 'gear'],
  ['teahouse', "Ochiyo's Tea House", '#4a6a28', 'bowl'], ['fruit', 'Fruit & Greens', '#c0661c', 'kaki'], ['toys', 'Kites & Toys', '#b3241e', 'kite'], ['sweets', 'Sweets', '#c25a7c', 'dango'],
];
const SOLIDS = { dark: '#2e2119', wood: '#86643f', rope: '#9a7c50', bamboo: '#b39a60', iron: '#26262a', paper: '#f1e7d0', brass: '#c2963e', glass: '#a9d4d6',
  red: '#b3241e', yellow: '#e8b62a', blue: '#3d6fb0', pink: '#e79ab0', persimmon: '#d06a1e', white: '#f4f1e8', green: '#5f8a34', straw: '#c4a466' };
type Solid = keyof typeof SOLIDS;
const idx = (id: ShopId) => SHOPS.findIndex((s) => s[0] === id);
const R = {
  sign: (id: ShopId) => { const i = idx(id); return cell((i % 2) * 512, Math.floor(i / 2) * 128, 512, 128, 4); },
  kite: (k: number) => cell(512 + k * 128, 384, 128, 128),
  temari: (k: number) => (k ? cell(768, 1024, 128, 128, 4) : cell(896, 384, 128, 128, 4)),
  noren: (id: ShopId) => cell(idx(id) * 256, 512, 256, 256),
  lantern: (id: ShopId) => cell(idx(id) * 128, 768, 128, 128),
  awning: (id: ShopId) => cell(idx(id) * 128, 896, 128, 128),
  laundry: (k: number) => (k ? cell((k - 1) * 128, 1024, 128, 128) : cell(896, 896, 128, 128)),
  solid: (s: Solid) => { const i = Object.keys(SOLIDS).indexOf(s); return cell(896 + (i % 4) * 32, 1024 + Math.floor(i / 4) * 32, 32, 32, 10); },
};

let sd = 5; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);

/** a shop's mark, white (or `ink`) on its colour, in a box of half-size s round (cx, cy) */
function mark(c: CanvasRenderingContext2D, kind: string, cx: number, cy: number, s: number, ink: string, bg: string, sy = 1) {
  c.save(); c.translate(cx, cy); c.scale(s, s * sy); c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 0.14; c.lineCap = 'round';
  const poly = (p: number[]) => { c.beginPath(); for (let i = 0; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath(); c.fill(); };
  const disc = (x: number, y: number, r: number, col = ink) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.283); c.fill(); };
  if (kind === 'anvil') poly([-1, -0.42, 0.85, -0.42, 0.85, -0.12, 0.32, 0, 0.26, 0.3, 0.6, 0.55, -0.6, 0.55, -0.3, 0.3, -0.36, 0, -0.62, -0.08]);
  else if (kind === 'letter') { c.lineWidth = 0.16; c.strokeRect(-0.85, -0.55, 1.7, 1.1); c.beginPath(); c.moveTo(-0.85, -0.55); c.lineTo(0, 0.12); c.lineTo(0.85, -0.55); c.stroke(); }
  else if (kind === 'gear') { for (let k = 0; k < 8; k++) { c.save(); c.rotate((k * Math.PI) / 4); c.fillRect(-0.16, -0.95, 0.32, 0.4); c.restore(); } disc(0, 0, 0.66); disc(0, 0, 0.26, bg); }
  else if (kind === 'bowl') {
    c.beginPath(); c.moveTo(-0.85, -0.05); c.lineTo(0.85, -0.05); c.quadraticCurveTo(0.8, 0.6, 0, 0.62); c.quadraticCurveTo(-0.8, 0.6, -0.85, -0.05); c.fill(); c.fillRect(-0.3, 0.58, 0.6, 0.16);
    c.lineWidth = 0.12; for (const x of [-0.3, 0.15]) { c.beginPath(); c.moveTo(x, -0.25); c.bezierCurveTo(x - 0.25, -0.45, x + 0.25, -0.6, x, -0.9); c.stroke(); }
  } else if (kind === 'kaki') { disc(0, 0.12, 0.72); c.fillStyle = bg; for (let k = 0; k < 4; k++) { c.save(); c.translate(0, -0.48); c.rotate(k * 1.571 + 0.785); c.beginPath(); c.ellipse(0.22, 0, 0.26, 0.11, 0, 0, 6.283); c.fill(); c.restore(); } c.fillStyle = ink; c.fillRect(-0.05, -0.85, 0.1, 0.3); }
  else if (kind === 'kite') { poly([0, -0.95, 0.6, -0.25, 0, 0.45, -0.6, -0.25]); c.lineWidth = 0.1; c.beginPath(); c.moveTo(0, 0.45); c.bezierCurveTo(0.35, 0.6, -0.35, 0.75, 0.1, 0.98); c.stroke(); }
  else if (kind === 'dango') { c.lineWidth = 0.1; c.beginPath(); c.moveTo(0, -0.98); c.lineTo(0, 0.98); c.stroke(); for (const y of [-0.52, 0, 0.52]) disc(0, y, 0.27); }
  c.restore();
}

function drawAtlas() {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d')!;
  c.fillStyle = '#86643f'; c.fillRect(0, 0, W, H);
  const grain = (x: number, y: number, w: number, h: number, base: string, dark: string) => {   // planed wood: streaks along the board
    c.fillStyle = base; c.fillRect(x, y, w, h); c.strokeStyle = dark;
    for (let k = 0; k < h * 0.7; k++) { c.globalAlpha = 0.08 + rnd() * 0.14; c.lineWidth = 0.6 + rnd() * 1.6; const yy = y + rnd() * h; c.beginPath(); c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 6, x + w * 0.7, yy + (rnd() - 0.5) * 6, x + w, yy + (rnd() - 0.5) * 4); c.stroke(); }
    c.globalAlpha = 1;
  };
  const weave = (x: number, y: number, w: number, h: number, a = 0.07) => {      // a faint cloth weave over a cell
    c.fillStyle = '#000'; for (let k = 0; k < w; k += 3) { c.globalAlpha = a * rnd(); c.fillRect(x + k, y, 1, h); } for (let k = 0; k < h; k += 3) { c.globalAlpha = a * rnd(); c.fillRect(x, y + k, w, 1); } c.globalAlpha = 1;
  };
  SHOPS.forEach(([, name, col, mk], i) => {
    // the signboard: shops get dark boards with gilt lettering, the stalls pale boards painted in their colour; each
    // letter is cut in (a light lower edge under the dark stroke) and the board has a bevelled darker border
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 128, shop = i < 4;
    grain(x, y, 512, 128, shop ? '#4a3222' : '#c8a172', shop ? '#1a100a' : '#6a4a2a');
    c.strokeStyle = shop ? '#22160e' : '#7a5634'; c.lineWidth = 10; c.strokeRect(x + 5, y + 5, 502, 118);
    c.strokeStyle = 'rgba(255,230,190,0.25)'; c.lineWidth = 2; c.strokeRect(x + 11, y + 11, 490, 106);
    let px = 66; c.font = `bold ${px}px Georgia, 'Times New Roman', serif`;
    while (c.measureText(name).width > 400 && px > 30) { px -= 2; c.font = `bold ${px}px Georgia, 'Times New Roman', serif`; }
    c.textAlign = 'center'; c.textBaseline = 'middle'; const ty = y + 66;
    c.fillStyle = shop ? 'rgba(0,0,0,0.6)' : 'rgba(255,240,215,0.7)'; c.fillText(name, x + 256 + 2, ty + 3);
    c.fillStyle = shop ? '#e3b552' : col; c.fillText(name, x + 256, ty);
    if (!shop) mark(c, mk, x + 34, y + 64, 18, col, '#c8a172');
    // the noren: the shop's colour, a white crest in a ring across the slits, a darker hem
    const nx = i * 256; if (i < 4) {
      c.fillStyle = col; c.fillRect(nx, 512, 256, 256); weave(nx, 512, 256, 256);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(nx, 512, 256, 14); c.fillRect(nx, 752, 256, 16);
      c.strokeStyle = '#f2ece0'; c.lineWidth = 9; c.beginPath(); c.arc(nx + 128, 640, 70, 0, 6.283); c.stroke();
      mark(c, mk, nx + 128, 640, 44, '#f2ece0', col);
    }
    // the lantern paper (it wraps round once): ribs, the mark front and back in the shop's colour
    const lx = i * 128; c.fillStyle = '#f6ead2'; c.fillRect(lx, 768, 128, 128);
    c.fillStyle = 'rgba(120,80,40,0.25)'; for (let k = 4; k < 128; k += 10) c.fillRect(lx, 768 + k, 128, 1.5);
    for (const u of [32, 96]) mark(c, mk, lx + u, 832, 14, col, '#f6ead2', 2.2);
    // the awning: broad stripes, the shop's colour and unbleached cloth
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#efe4cc' : col; c.fillRect(lx + k * 32, 896, 32, 128); } weave(lx, 896, 128, 128, 0.1);
  });
  // kites: a red sun on white, an indigo-and-white quartered one, a yellow one with a black diamond (paper over a bamboo cross)
  const kites: ((x: number) => void)[] = [
    (x) => { c.fillStyle = '#f4eee0'; c.fillRect(x, 384, 128, 128); c.fillStyle = '#c42a20'; c.beginPath(); c.arc(x + 64, 448, 34, 0, 6.283); c.fill(); },
    (x) => { for (let k = 0; k < 4; k++) { c.fillStyle = k % 3 ? '#f4eee0' : '#24387a'; c.fillRect(x + (k % 2) * 64, 384 + Math.floor(k / 2) * 64, 64, 64); } },
    (x) => { c.fillStyle = '#e8b62a'; c.fillRect(x, 384, 128, 128); c.fillStyle = '#1a1310'; c.beginPath(); c.moveTo(x + 64, 410); c.lineTo(x + 102, 448); c.lineTo(x + 64, 486); c.lineTo(x + 26, 448); c.fill(); },
  ];
  kites.forEach((k, i) => { const x = 512 + i * 128; k(x); c.strokeStyle = '#3a2a1a'; c.lineWidth = 4; c.strokeRect(x + 2, 386, 124, 124); });
  // temari: a coloured ground wound with bands of thread (the cell wraps the ball: u round, v pole to pole)
  for (const [x, y, bg, th] of [[896, 384, '#b3241e', ['#f4eee0', '#e8b62a', '#2d5aa0']], [768, 1024, '#24387a', ['#e79ab0', '#f4eee0', '#e8b62a']]] as const) {
    c.fillStyle = bg; c.fillRect(x, y, 128, 128);
    th.forEach((col, k) => { c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); for (let u = 0; u <= 128; u += 4) c.lineTo(x + u, y + 64 + Math.sin((u / 128) * 6.283 * 4 + k * 2.1) * (18 + k * 9)); c.stroke(); });
    c.fillStyle = th[0]; c.fillRect(x, y + 60, 128, 8);
  }
  // washing: indigo shibori dots, a striped tenugui, a persimmon check, a brown-striped kimono, white with a red border, a green plaid
  const wash: ((x: number, y: number) => void)[] = [
    (x, y) => { c.fillStyle = '#26366e'; c.fillRect(x, y, 128, 128); c.fillStyle = '#e8e6ee'; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) { c.beginPath(); c.arc(x + 12 + a * 21 + (b % 2) * 10, y + 10 + b * 21, 4, 0, 6.283); c.fill(); } },
    (x, y) => { c.fillStyle = '#f2efe6'; c.fillRect(x, y, 128, 128); c.fillStyle = '#2a4a8a'; for (const yy of [10, 22, 98, 110]) c.fillRect(x, y + yy, 128, 6); },
    (x, y) => { c.fillStyle = '#c86a2a'; c.fillRect(x, y, 128, 128); c.fillStyle = 'rgba(80,30,10,0.35)'; for (let k = 0; k < 128; k += 16) { c.fillRect(x + k, y, 5, 128); c.fillRect(x, y + k, 128, 5); } },
    (x, y) => { for (let k = 0; k < 128; k += 8) { c.fillStyle = (k / 8) % 3 ? '#8a7258' : '#4a3a2c'; c.fillRect(x + k, y, 8, 128); } },
    (x, y) => { c.fillStyle = '#f4f2ea'; c.fillRect(x, y, 128, 128); c.strokeStyle = '#b8322a'; c.lineWidth = 8; c.strokeRect(x + 8, y + 8, 112, 112); },
    (x, y) => { c.fillStyle = '#4e6e3a'; c.fillRect(x, y, 128, 128); c.fillStyle = 'rgba(240,230,190,0.35)'; for (let k = 0; k < 128; k += 32) { c.fillRect(x + k, y, 6, 128); c.fillRect(x, y + k, 128, 6); } },
  ];
  wash.forEach((f, k) => { const [x, y] = k ? [(k - 1) * 128, 1024] : [896, 896]; f(x, y); weave(x, y, 128, 128); });
  Object.values(SOLIDS).forEach((col, i) => { c.fillStyle = col; c.fillRect(896 + (i % 4) * 32, 1024 + Math.floor(i / 4) * 32, 32, 32); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---------------------------------------------------------------- the kit: pieces into one geometry
/** how a piece swings: corners below `top` (world y) move along `dir` (world, per metre below top), at `phase` */
export type Sway = { top: number; dir: THREE.Vector3; phase: number };
export type Kit = ReturnType<typeof makeKit>;
/** the street's sway and smoke clock: start.ts sets it to the game clock each frame, so it pauses with the game */
export const decorTime = { value: 0 };
const uT = decorTime;

function makeKit() {
  const geos: THREE.BufferGeometry[] = [], v = new THREE.Vector3();
  const put = (g: THREE.BufferGeometry, r: Rect | ((i: number) => Rect), m: THREE.Matrix4, sw?: Sway) => {
    g.applyMatrix4(m); const uv = g.attributes.uv, pos = g.attributes.position, n = pos.count, s = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const q = typeof r === 'function' ? r(i) : r;
      uv.setXY(i, q[0] + uv.getX(i) * (q[2] - q[0]), q[1] + uv.getY(i) * (q[3] - q[1]));
      if (sw) { v.fromBufferAttribute(pos, i); const a = Math.max(0, sw.top - v.y); s.set([sw.dir.x * a, sw.dir.y * a, sw.dir.z * a, sw.phase], i * 4); }
    }
    g.setAttribute('aSw', new THREE.BufferAttribute(s, 4)); geos.push(g);
  };
  const Yup = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  /** a frame: world position and yaw; local(x, y, z) composes a piece's matrix in it (x right, y up, z out the front) */
  const frame = (x: number, y: number, z: number, yaw: number) => {
    const F = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Yup, yaw), one);
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    return { F, fwd, right, y, at: (lx: number, ly: number, lz: number, rx = 0, ry = 0, rz = 0) => F.clone().multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)).setPosition(lx, ly, lz)) };
  };
  /** a straight rod from a to b (world) */
  const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, s: Solid, seg = 5, sw?: Sway) => {
    const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1);
    put(g, R.solid(s), new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(Yup, d.normalize()), one), sw);
  };
  return { geos, put, frame, rod, R };
}
type Frame = ReturnType<Kit['frame']>;
const phase = () => rnd() * 6.283;

/** a carved signboard w x h standing at (lx, ly, lz) of the frame: a framed board with a little roof cap, the name on its
 * face (and its back), on two short legs */
function signboard(k: Kit, f: Frame, id: ShopId, lx: number, ly: number, lz: number, w: number, h: number, legs = 0.25) {
  const face = R.sign(id), wood = R.solid('dark');
  k.put(new THREE.BoxGeometry(w, h, 0.05), (i) => (i >= 16 ? face : wood), f.at(lx, ly, lz));                 // front and back faces lettered
  k.put(new THREE.BoxGeometry(w + 0.16, 0.05, 0.14), wood, f.at(lx, ly + h / 2 + 0.03, lz));                       // the cap
  for (const s of [-1, 1]) k.put(new THREE.BoxGeometry(0.05, h + legs, 0.06), wood, f.at(lx + s * (w / 2 + 0.03), ly - legs / 2, lz));
}

/** a noren across a doorway: n panels hung from a bamboo rod at height top (local), w wide, h long */
function noren(k: Kit, f: Frame, id: ShopId, lx: number, top: number, lz: number, w: number, h: number, n: number) {
  const r = R.noren(id), pw = w / n, wy = f.y + top;
  for (let i = 0; i < n; i++) {
    const g = new THREE.PlaneGeometry(pw - 0.035, h, 1, 4), u0 = i / n, u1 = (i + 1) / n;
    for (let j = 0; j < g.attributes.uv.count; j++) g.attributes.uv.setX(j, u0 + g.attributes.uv.getX(j) * (u1 - u0));
    k.put(g, r, f.at(lx - w / 2 + pw * (i + 0.5), top - h / 2, lz), { top: wy, dir: f.fwd.clone().multiplyScalar(0.11), phase: i * 0.7 + lx });
  }
  k.rod(new THREE.Vector3(lx - w / 2 - 0.08, top + 0.03, lz).applyMatrix4(f.F), new THREE.Vector3(lx + w / 2 + 0.08, top + 0.03, lz).applyMatrix4(f.F), 0.022, 'bamboo');
}

/** a round paper lantern on a cord from (lx, top, lz): dark caps, glowing ribbed paper with the shop's mark */
function lantern(k: Kit, f: Frame, id: ShopId, lx: number, top: number, lz: number, h = 0.46, rad = 0.17, cord = 0.12) {
  const sw = { top: f.y + top, dir: new THREE.Vector3(0.6, 0, 0.8).multiplyScalar(0.12), phase: phase() };
  const prof = Array.from({ length: 7 }, (_, j) => { const y = (j / 6 - 0.5) * h; return new THREE.Vector2(rad * (0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - (2 * y / h) ** 2))), y); });
  const yc = top - cord - h / 2;
  k.put(new THREE.LatheGeometry(prof, 12), R.lantern(id), f.at(lx, yc, lz), sw);
  for (const s of [-1, 1]) k.put(new THREE.CylinderGeometry(rad * 0.46, rad * 0.46, 0.04, 10), R.solid('dark'), f.at(lx, yc + s * h / 2, lz), sw);
  k.put(new THREE.BoxGeometry(0.012, cord, 0.012), R.solid('rope'), f.at(lx, top - cord / 2, lz), sw);
}

/** a wind bell under the eaves: a little bell (glass or iron) with a paper strip that catches the wind */
function furin(k: Kit, f: Frame, lx: number, top: number, lz: number, s: Solid) {
  const sw = { top: f.y + top, dir: new THREE.Vector3(0.6, 0, 0.8).multiplyScalar(0.18), phase: phase() };
  k.put(new THREE.BoxGeometry(0.006, 0.12, 0.006), R.solid('rope'), f.at(lx, top - 0.06, lz), sw);
  k.put(new THREE.SphereGeometry(0.045, 8, 4, 0, 6.283, 0, 1.75), R.solid(s), f.at(lx, top - 0.13, lz), sw);
  k.put(new THREE.PlaneGeometry(0.05, 0.16, 1, 2), R.solid('paper'), f.at(lx, top - 0.26, lz, 0, rnd() * 3, 0), { ...sw, dir: sw.dir.clone().multiplyScalar(1.8) });
}

/** a striped cloth awning: from (y0 back edge at depth z0) out to (y1 at z1), w wide, a short valance that flaps, bamboo poles */
function awning(k: Kit, f: Frame, id: ShopId, w: number, y0: number, z0: number, y1: number, z1: number, poles: boolean) {
  const r = R.awning(id), len = Math.hypot(z1 - z0, y1 - y0), pitch = Math.atan2(y0 - y1, z1 - z0);
  k.put(new THREE.PlaneGeometry(w, len, 1, 2), r, f.at(0, (y0 + y1) / 2, (z0 + z1) / 2, -Math.PI / 2 + pitch, 0, 0));
  k.put(new THREE.PlaneGeometry(w, 0.16, 1, 1), r, f.at(0, y1 - 0.08, z1), { top: f.y + y1, dir: f.fwd.clone().multiplyScalar(0.45), phase: phase() });
  k.rod(new THREE.Vector3(-w / 2, y1, z1).applyMatrix4(f.F), new THREE.Vector3(w / 2, y1, z1).applyMatrix4(f.F), 0.022, 'bamboo');
  if (poles) for (const s of [-1, 1]) k.rod(new THREE.Vector3(s * (w / 2 - 0.05), -0.1, z1).applyMatrix4(f.F), new THREE.Vector3(s * (w / 2 - 0.05), y1 + 0.02, z1).applyMatrix4(f.F), 0.026, 'bamboo');
}

/** pinwheels: four bright vanes each, spun about their own axis in the vertex shader (one instanced draw) */
function pinwheels(at: THREE.Matrix4[]) {
  const p: number[] = [], col: number[] = [], C = [[0.75, 0.1, 0.08], [0.95, 0.75, 0.15], [0.2, 0.45, 0.8], [0.95, 0.93, 0.88]];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, r = 0.075;
    p.push(0, 0, 0, Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a + 0.9) * r * 0.75, Math.sin(a + 0.9) * r * 0.75, 0.025); for (let j = 0; j < 3; j++) col.push(...C[k]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uT = uT;
    s.vertexShader = 'uniform float uT;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
float pa = uT * (4.0 + float(gl_InstanceID % 3) * 1.3) + float(gl_InstanceID); transformed.xy = mat2(cos(pa), sin(pa), -sin(pa), cos(pa)) * transformed.xy;`);
  };
  m.customProgramCacheKey = () => 'pinwheel';
  const im = new THREE.InstancedMesh(g, m, at.length); at.forEach((a, i) => im.setMatrixAt(i, a)); im.computeBoundingSphere(); return im;
}

// ---------------------------------------------------------------- the shops and the market corner
/** Every shop's sign, noren, awning, lanterns and wind bells, the market stalls' cloth and goods, plus `more` (decor.ts:
 * the washing lines). One mesh (+ the pinwheels). Coordinates below are each building's own (x right, y up, z out front),
 * matching village_build.py's (x, z, -y). */
export function buildDressing(scene: THREE.Scene, t: Terrain, I: Island, low: boolean, more?: (k: Kit) => void) {
  const k = makeKit(), S = I.spots;
  const at = (s: { x: number; z: number; yaw: number }) => k.frame(s.x, t.heightAt(s.x, s.z) - 0.05, s.z, s.yaw);   // as village.ts places them
  for (const id of ['post', 'workshop'] as const) {                                // the open-front huts
    const f = at(S[id]);
    signboard(k, f, id, 0, 3.0, 2.25, 2.1, 0.44);
    noren(k, f, id, 0, 2.32, 1.68, 4.2, 0.52, 4);                                 // low enough to show under the awning's valance
    awning(k, f, id, 3.7, 2.52, 2.45, 2.36, 3.4, true);
    for (const s of [-1, 1]) lantern(k, f, id, s * 1.75, 2.62, 2.2, 0.4, 0.15);
    for (const s of [-1, 1]) furin(k, f, s * 0.95, 2.62, 2.3, id === 'post' ? 'glass' : 'brass');
    if (id === 'workshop') for (const [x, d] of [[-0.35, 0.3], [0.4, 0.22]]) {   // two brass gears hung out on cords, turning in the wind
      const sw = { top: f.y + 2.62, dir: new THREE.Vector3(0.6, 0, 0.8).multiplyScalar(0.12), phase: phase() };
      k.put(new THREE.BoxGeometry(0.008, d, 0.008), R.solid('rope'), f.at(x, 2.62 - d / 2, 2.3), sw);
      k.put(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), R.solid('brass'), f.at(x, 2.62 - d - 0.07, 2.3, Math.PI / 2, 0, 0), sw);
    }
  }
  { const f = at(S.smithy);
    signboard(k, f, 'smithy', 0, 3.42, 2.6, 2.3, 0.5);
    noren(k, f, 'smithy', 0, 2.72, 2.28, 5.4, 0.5, 5);
    awning(k, f, 'smithy', 4.3, 2.95, 2.75, 2.75, 3.75, true);                 // (clear of the nobori banner at x -2.8)
    for (const s of [-1, 1]) { lantern(k, f, 'smithy', s * 2.2, 3.0, 2.55, 0.42, 0.16); furin(k, f, s * 1.15, 2.98, 2.6, 'iron'); } }
  { const f = at(S.teahouse);
    signboard(k, f, 'teahouse', 0, 3.85, 1.95, 2.4, 0.5);
    noren(k, f, 'teahouse', -0.6, 2.85, 1.3, 1.2, 0.65, 3);
    lantern(k, f, 'teahouse', 0.55, 3.15, 1.65, 0.5, 0.18, 0.15); lantern(k, f, 'teahouse', -2.45, 3.15, 2.05, 0.42, 0.15); }
  // the market corner
  const spin: THREE.Matrix4[] = [];
  for (const st of marketStalls(I, t)) {
    const f = at(st), id = st.id as ShopId, T = 0.865;
    signboard(k, f, id, 0, 2.2, 0.53, 1.5, 0.32, 0.18);
    awning(k, f, id, 2.06, 2.3, -0.5, 1.92, 0.78, false);
    lantern(k, f, id, 0.82, 1.98, 0.5, 0.3, 0.11, 0.06);
    const sw = (top: number, amt = 0.15) => ({ top: f.y + top, dir: new THREE.Vector3(0.6, 0, 0.8).multiplyScalar(amt), phase: phase() });
    if (id === 'fruit') for (const x of [-0.55, 0.5]) {                           // strings of drying persimmons from the front beam
      const s = sw(1.96); k.put(new THREE.BoxGeometry(0.008, 0.48, 0.008), R.solid('rope'), f.at(x, 1.72, 0.5), s);
      for (let j = 0; j < 6; j++) k.put(new THREE.SphereGeometry(0.032, 6, 4), R.solid('persimmon'), f.at(x, 1.86 - j * 0.075, 0.5), s);
    }
    if (id === 'sweets') [-0.62, -0.22, 0.2, 0.55].forEach((x, j) => {           // paper bags of candy on strings
      const s = sw(1.96, 0.2), c = (['pink', 'yellow', 'white', 'blue'] as const)[j];
      k.put(new THREE.BoxGeometry(0.006, 0.12, 0.006), R.solid('rope'), f.at(x, 1.9, 0.5), s);
      k.put(new THREE.CylinderGeometry(0.035, 0.055, 0.13, 6), R.solid(c), f.at(x, 1.78, 0.5), s);
    });
    if (id === 'toys') {
      [-0.62, 0, 0.62].forEach((x, j) => {                                       // kites hung from the back beam (the middle one high, clear of
        const y = j === 1 ? 2.04 : 1.74, s = sw(2.28, 0.1);                      // the vendor's face), tails flying
        k.put(new THREE.PlaneGeometry(0.3, 0.3), R.kite(j), f.at(x, y, -0.48, 0, 0, Math.PI / 4), s);
        k.put(new THREE.BoxGeometry(0.008, 2.28 - y - 0.2, 0.008), R.solid('rope'), f.at(x, (2.28 + y + 0.2) / 2, -0.48), s);
        if (j !== 1) for (const dx of [-0.05, 0.05]) k.put(new THREE.PlaneGeometry(0.035, 0.4, 1, 3), R.solid(j ? 'yellow' : 'red'), f.at(x + dx, y - 0.4, -0.47), sw(y - 0.2, 0.45));
      });
      for (let j = 0; j < 6; j++) k.put(new THREE.SphereGeometry(0.052, 10, 7), R.temari(j % 2), f.at(-0.42 + j * 0.15, T + 0.12 + 0.052, -0.12, 0, j, 0));   // temari on the step
      const hub = new THREE.Vector3(0.92, 1.5, 0.5), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), qq = new THREE.Quaternion();
      const sticks: [THREE.Vector3, THREE.Vector3][] = [];
      for (let j = 0; j < 7; j++) {                                               // stuck in the straw bundle on the front post, fanned out
        const a = -0.2 + (j / 6) * 2.2, e = (j % 2 ? 0.35 : 0.75) + (j % 3) * 0.1, d = new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
        sticks.push([hub.clone().addScaledVector(d, 0.08), hub.clone().addScaledVector(d, 0.36)]);
      }
      for (let j = 0; j < 3; j++) sticks.push([new THREE.Vector3(-0.72 + j * 0.04, 1.12, -0.14), new THREE.Vector3(-0.78 + j * 0.08, 1.42 + (j % 2) * 0.06, -0.08 + j * 0.03)]);   // and in a pot on the counter
      for (const [a, b] of sticks) {
        const wa = a.clone().applyMatrix4(f.F), wb = b.clone().applyMatrix4(f.F); k.rod(wa, wb, 0.006, 'bamboo', 3);
        const face = f.fwd.clone().multiplyScalar(0.9).add(wb.clone().sub(wa).normalize().multiplyScalar(0.4)).normalize();
        m.lookAt(face, new THREE.Vector3(), new THREE.Vector3(0, 1, 0)); qq.setFromRotationMatrix(m);
        spin.push(new THREE.Matrix4().compose(wb.clone().addScaledVector(face, 0.012), qq, one));
      }
    }
  }
  more?.(k);
  const mat = new THREE.MeshStandardMaterial({ map: drawAtlas(), side: THREE.DoubleSide, roughness: 0.85 });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uT = uT;
    s.vertexShader = 'uniform float uT;\nattribute vec4 aSw;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
transformed += aSw.xyz * (sin(uT * 1.7 + aSw.w + position.x * 0.7 + position.z * 0.5) * 0.65 + sin(uT * 3.3 + aSw.w * 1.7 + position.y * 5.0) * 0.35);`);
    // the lantern paper (its row of the atlas) glows warm
    s.fragmentShader = s.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
float gy = 1.0 - vMapUv.y; if (gy > ${(768 / H).toFixed(4)} && gy < ${(896 / H).toFixed(4)} && vMapUv.x < 0.875) totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.72, 0.45) * 0.75;`);
  };
  mat.customProgramCacheKey = () => 'market-cloth';
  const mesh = new THREE.Mesh(mergeGeometries(k.geos)!, mat); mesh.castShadow = !low; mesh.receiveShadow = true;
  scene.add(mesh);
  if (spin.length) { const pw = pinwheels(spin); scene.add(pw); }
  return mesh;
}
