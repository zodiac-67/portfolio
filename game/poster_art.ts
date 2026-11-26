import type * as THREE from 'three';

// The six woodblock-print pictures on the house walls, drawn in code (original compositions in the ukiyo-e manner:
// keyblock outlines, flat colour blocks a hair out of register, bokashi gradients, washi grain). Each picture can also be
// drawn as a MASK (same shapes, region colours instead of ink: red = water, green = sky, blue = falling petals) so the
// poster material can bring just those parts to life in its shader (liven() below). Pictures live in a 460 x 494 space.

type C = CanvasRenderingContext2D;
export type Art = (c: C, w: number, h: number) => void;
type Tag = 'solid' | 'water' | 'sky' | 'dusk';
type Fill = string | CanvasGradient;

const KEY = '#1b1714', SNOW = '#f8f3e8', PRUSSIAN = '#24476e', DEEP = '#162a4c', VERM = '#c4472f', OCHRE = '#d9a441', PINK = '#eaa8b8';
const PINE = '#2c4632', PINE2 = '#4d6b44', EARTH = '#5e4129', STONE = '#9a9286', ROOF = '#2d3542', SERIF = 'Georgia, "Times New Roman", serif';
const TAG: Record<Tag, string> = { solid: '#000', water: '#f00', sky: '#0f0', dusk: '#070' };   // dusk: a fainter mist on night skies

let mask = false;
/** draw the next pictures as region masks (true) or as prints (false) */
export const maskMode = (on: boolean) => { mask = on; };
// two seeded streams: rnd shapes geometry (identical in both passes), rnd2 only print-side decoration
let s1 = 1, s2 = 1;
const rnd = () => (s1 = (s1 * 16807) % 2147483647) / 2147483647, rnd2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;

// ---------------------------------------------------------------- printing
const P = (f: (p: Path2D) => void) => { const p = new Path2D(); f(p); return p; };
const poly = (a: number[]) => P((p) => { p.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) p.lineTo(a[i], a[i + 1]); p.closePath(); });
/** a closed shape through the midpoints of a point list (soft, hand-cut corners) */
const blob = (a: number[]) => P((p) => {
  const n = a.length / 2, X = (i: number) => a[(i % n) * 2], Y = (i: number) => a[(i % n) * 2 + 1];
  p.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
  for (let i = 1; i <= n; i++) p.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2);
  p.closePath();
});
const ell = (x: number, y: number, rx: number, ry: number, rot = 0) => P((p) => p.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2));
const rect = (x: number, y: number, w: number, h: number) => P((p) => p.rect(x, y, w, h));
/** a band of scalloped cloud (also a pine's foliage pad): flat bottom, round bumps on top */
const cloudP = (x: number, y: number, w: number, h: number) => P((p) => {
  p.moveTo(x + w, y + h); p.lineTo(x, y + h); let cx = x;
  while (cx < x + w - 2) { const r = Math.min(h * (0.8 + rnd() * 0.9), (x + w - cx) / 2 + 1); p.ellipse(cx + r, y + h, r, h * (0.5 + rnd() * 0.5), 0, Math.PI, 0); cx += 1.8 * r; }
  p.closePath();
});
/** each colour block is cut and printed separately, so it lands slightly off the keyblock line (misregistration) */
const off = (k: string) => { let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0; return [((h & 7) - 3.5) * 0.42, (((h >> 3) & 7) - 3.5) * 0.42]; };
/** a colour block plus its keyblock outline (key = line width, 0 for none); in mask mode its region colour instead */
const shape = (c: C, p: Path2D, fill: Fill | null, key = 2.6, tag: Tag = 'solid') => {
  if (mask) { c.fillStyle = TAG[tag]; c.fill(p); return; }
  if (fill) { const [dx, dy] = off(typeof fill === 'string' ? fill : 'grad'); c.save(); c.translate(dx, dy); c.fillStyle = fill; c.fill(p); c.restore(); }
  if (key) { c.lineWidth = key; c.strokeStyle = KEY; c.stroke(p); }
};
/** a carved line (print only) */
const line = (c: C, p: Path2D, w: number, col = KEY) => { if (mask) return; c.lineWidth = w; c.strokeStyle = col; c.stroke(p); };
const seg = (pts: number[]) => P((p) => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); });
const rgba = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;
/** bokashi: a colour wiped onto the block so it fades out between y0 (full) and y1 (none) */
const bokashi = (c: C, y0: number, y1: number, col: string, a = 1) => {
  if (mask) return; const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(0, Math.min(y0, y1), 460, Math.abs(y1 - y0));
};
const vgrad = (c: C, y0: number, y1: number, a: string, b: string) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
const glow = (c: C, x: number, y: number, r: number, col: string, a: number) => {
  if (mask) return; const g = c.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
};
/** cut-stone courses inside a shape (print only) */
const courses = (c: C, p: Path2D, x0: number, y0: number, x1: number, y1: number, rh: number, cw: number, w: number) => {
  if (mask) return; c.save(); c.clip(p); c.lineWidth = w; c.strokeStyle = 'rgba(27, 23, 20, .7)'; c.beginPath();
  for (let y = y0, r = 0; y < y1; y += rh, r++) { c.moveTo(x0, y); c.lineTo(x1, y); for (let x = x0 + (r % 2 ? cw / 2 : 0); x < x1; x += cw) { c.moveTo(x, y); c.lineTo(x, y + rh); } }
  c.stroke(); c.restore();
};
/** horizontal ripple strokes on still water (print only) */
const ripples = (c: C, y0: number, y1: number, n: number, col: string) => {
  if (mask) return; c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath();
  for (let i = 0; i < n; i++) { const y = y0 + rnd2() * (y1 - y0), x = rnd2() * 460, l = 14 + rnd2() * 40; c.moveTo(x, y); c.quadraticCurveTo(x + l / 2, y - 2, x + l, y); }
  c.stroke();
};
/** a reflection: a column of short broken strokes under a light */
const reflect = (c: C, x: number, y0: number, y1: number, w: number, col: string) => {
  if (mask) return; c.strokeStyle = col; c.lineWidth = 3; c.beginPath();
  for (let y = y0; y < y1; y += 7) { const hw = w * (0.4 + rnd2() * 0.6) * (1 - ((y - y0) / (y1 - y0)) * 0.5), dx = (rnd2() - 0.5) * 6; c.moveTo(x - hw + dx, y); c.lineTo(x + hw + dx, y); }
  c.stroke();
};

// ---------------------------------------------------------------- motifs
const crane = (c: C, x: number, y: number, s: number) => {   // a red-crowned crane flying left
  c.save(); c.translate(x, y); c.scale(s, s); const k = 1.5 / s;
  const wing = (dx: number, sc: number, col: string) => {                          // swept back from the shoulder to a black-tipped point
    const w = P((p) => { p.moveTo(dx - 6, -2); p.quadraticCurveTo(dx - 12 * sc, -24 * sc, dx + 6 * sc, -38 * sc); p.quadraticCurveTo(dx + 4 * sc, -18 * sc, dx + 12, -1); p.closePath(); });
    shape(c, w, col, k); if (mask) return; c.save(); c.clip(w); c.fillStyle = KEY; c.fillRect(dx - 20, -50, 40, 50 - 27 * sc); c.restore(); c.lineWidth = k; c.strokeStyle = KEY; c.stroke(w);
  };
  wing(10, 0.7, '#e3dccd');
  line(c, seg([12, 1, 32, 4]), 1.6 / s); shape(c, ell(0, 0, 15, 5, -0.05), SNOW, k);
  line(c, seg([-12, -1, -30, -5]), 2.6 / s); shape(c, ell(-32, -5, 3.4, 2.6), SNOW, k * 0.7); shape(c, ell(-32, -6.6, 1.7, 1.2), VERM, 0);
  line(c, seg([-35, -5, -42, -3]), 1.4 / s, OCHRE);
  wing(0, 1, SNOW);
  c.restore();
};
/** a small figure in a kasa hat (feet at x, y); dir 1 faces right */
const figure = (c: C, x: number, y: number, s: number, robe: string, dir = 1) => {
  c.save(); c.translate(x, y); c.scale(s * dir, s); const k = 1.8 / s;
  shape(c, poly([-9, 0, 9, 0, 6, -30, -6, -30]), robe, k); shape(c, ell(0, -34, 4.5, 5), '#e8c9a0', k * 0.8);
  shape(c, poly([-17, -36, 17, -36, 0, -47]), '#c9a466', k); line(c, seg([-4, -20, 15, -11]), 2.4 / s);
  c.restore();
};
/** a pine from (x, y) to its crown (tx, ty): bowed trunk, crooked branches, layered flat pads of needles */
const pine = (c: C, x: number, y: number, tx: number, ty: number, s: number) => {
  const mx = (x + tx) / 2 + (ty - y) * 0.12, my = (y + ty) / 2;
  const pt = (t: number) => [(1 - t) ** 2 * x + 2 * (1 - t) * t * mx + t * t * tx, (1 - t) ** 2 * y + 2 * (1 - t) * t * my + t * t * ty];
  const pads: number[][] = [];
  for (let k = 0; k < 5; k++) {
    const [px, py] = pt(0.42 + k * 0.13), side = k % 2 ? 1 : -1, len = (24 + rnd() * 30) * s * (1.1 - k * 0.12);
    pads.push([px, py, px + side * len, py - (6 + rnd() * 10) * s, (52 + rnd() * 36) * s * (1.1 - k * 0.12)]);
  }
  pads.push([tx, ty, tx, ty - 4 * s, 64 * s]);
  shape(c, P((p) => { p.moveTo(x - 7 * s, y); p.quadraticCurveTo(mx - 4 * s, my, tx - 2 * s, ty); p.lineTo(tx + 2 * s, ty); p.quadraticCurveTo(mx + 4 * s, my, x + 7 * s, y); p.closePath(); }), EARTH, 2.2);
  for (const [px, py, bx, by] of pads) { const b = P((p) => { p.moveTo(px, py); p.quadraticCurveTo((px + bx) / 2, py - 12 * s, bx, by); }); line(c, b, 5.5 * s); line(c, b, 3 * s, EARTH); }
  for (const [, , bx, by, w] of pads) { const h = 15 * s; shape(c, cloudP(bx - w / 2, by - h, w, h), PINE, 2); shape(c, cloudP(bx - w / 2 + 6 * s, by - h - 1, w - 12 * s, h * 0.55), PINE2, 0); }
};
/** a tiered castle keep, centred on x with its foot at y */
const castle = (c: C, x: number, y: number, s: number, base = true) => {
  c.save(); c.translate(x, y); c.scale(s, s); const k = 2.2 / s; let top = 0; const gables: number[] = [];
  if (base) { const b = poly([-62, 0, 62, 0, 52, -30, -52, -30]); shape(c, b, STONE, k); courses(c, b, -62, -30, 62, 0, 7.5, 16, 1 / s); top = -30; }
  ([[92, 28], [70, 24], [50, 22]] as const).forEach(([w, h], i) => {
    shape(c, rect(-w / 2, top - h, w, h), SNOW, k);
    for (let j = -w / 2 + 10; j < w / 2 - 8; j += 14) shape(c, rect(j, top - h + 8, 6, 8), KEY, 0);
    const ry = top - h, ew = w / 2 + 14;
    shape(c, P((p) => { p.moveTo(-ew, ry + 6); p.quadraticCurveTo(-ew + 8, ry + 1, -w / 2 + 4, ry - 9); p.lineTo(w / 2 - 4, ry - 9); p.quadraticCurveTo(ew - 8, ry + 1, ew, ry + 6); p.lineTo(w / 2 + 2, ry + 1); p.lineTo(-w / 2 - 2, ry + 1); p.closePath(); }), ROOF, k);
    if (i < 2) gables.push(ry, w);
    top = ry - 9;
  });
  shape(c, poly([-32, top + 1, 32, top + 1, 20, top - 15, -20, top - 15]), ROOF, k);
  for (const sx of [-1, 1]) shape(c, poly([sx * 20, top - 15, sx * 26, top - 24, sx * 15, top - 15]), OCHRE, k * 0.7);   // gilded finials
  for (let i = 0; i < gables.length; i += 2) {                                       // front gables sit on each roof, over the wall above
    const ry = gables[i], gw = gables[i + 1] * 0.22;
    shape(c, poly([-gw, ry - 6, gw, ry - 6, 0, ry - 6 - gw * 0.9]), SNOW, k); line(c, seg([-gw - 3, ry - 4, 0, ry - 8 - gw * 0.9, gw + 3, ry - 4]), 3 / s, ROOF);
  }
  c.restore();
};
/** rows of swell with a curl of foam on each crest, filled down to the bottom edge */
const swells = (c: C, y: number, amp: number, n: number, fill: string) => {
  const wl = 480 / n;
  shape(c, P((p) => {
    p.moveTo(-10, 520); p.lineTo(-10, y);
    for (let i = 0; i < n; i++) { const x0 = -10 + i * wl; p.quadraticCurveTo(x0 + wl * 0.35, y - amp * 2, x0 + wl * 0.6, y - amp * 0.3); p.quadraticCurveTo(x0 + wl * 0.8, y + amp * 0.5, x0 + wl, y); }
    p.lineTo(470, 520); p.closePath();
  }), fill, 2.4, 'water');
  for (let i = 0; i < n; i++) { const x0 = -10 + i * wl; line(c, P((p) => p.arc(x0 + wl * 0.46, y - amp * 0.6, wl * 0.14, Math.PI * 1.15, Math.PI * 1.85)), 2, SNOW); line(c, seg([x0 + wl * 0.1, y + amp * 0.8, x0 + wl * 0.5, y + amp * 0.5]), 1.4, 'rgba(248, 243, 232, .5)'); }
};
const cubic = (t: number, a: number, b: number, d: number, e: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * d + t ** 3 * e;
/** a great curling wave, its foot at (x, y); dir -1 curls left */
const curl = (c: C, x: number, y: number, s: number, dir = 1) => {
  c.save(); c.translate(x, y); c.scale(s * dir, s); const k = 3 / s;
  const S1 = [-120, 0, -90, -40, -60, -150, 20, -190], S2 = [20, -190, 70, -200, 112, -170, 112, -138], S3 = [112, -138, 100, -150, 72, -152, 56, -122];
  shape(c, P((p) => { p.moveTo(-120, 0); p.bezierCurveTo(-90, -40, -60, -150, 20, -190); p.bezierCurveTo(70, -200, 112, -170, 112, -138); p.bezierCurveTo(100, -150, 72, -152, 56, -122); p.bezierCurveTo(44, -92, 62, -40, 130, 10); p.lineTo(130, 40); p.lineTo(-120, 40); p.closePath(); }),
    vgrad(c, 0, -190, DEEP, '#5b88b5'), k, 'water');
  for (let j = 1; j <= 4; j++) line(c, P((p) => { p.moveTo(-104 + j * 22, 0); p.bezierCurveTo(-80 + j * 22, -36 + j * 6, -52 + j * 22, -132 + j * 26, 18 + j * 12, -172 + j * 30); }), 1.8 / s, 'rgba(160, 196, 226, .75)');
  const foam = (B: number[], t0: number, t1: number, r: number) => {
    for (let t = t0; t <= t1; t += 0.05) shape(c, ell(cubic(t, B[0], B[2], B[4], B[6]), cubic(t, B[1], B[3], B[5], B[7]) - 3, r + rnd() * 3, (r + rnd() * 3) * 0.75), SNOW, 1.4 / s, 'water');
  };
  line(c, P((p) => { p.moveTo(-70, -96); p.bezierCurveTo(-50, -150, -10, -186, 20, -186); p.bezierCurveTo(66, -194, 104, -168, 108, -142); }), 12 / s, '#8fb4d6');   // the pale lip under the foam
  foam(S1, 0.4, 1, 3.5); foam(S2, 0, 1, 4);
  for (let t = 0; t <= 0.9; t += 0.15) shape(c, ell(cubic(t, S3[0], S3[2], S3[4], S3[6]) + 2, cubic(t, S3[1], S3[3], S3[5], S3[7]) + 9, 2.6, 10, 0.55 - t * 0.5), SNOW, 1.2 / s, 'water');   // the claws
  for (let i = 0; i < 16; i++) { const t = rnd(); shape(c, ell(cubic(t, S2[0], S2[2], S2[4], S2[6]) + (rnd() - 0.3) * 30, cubic(t, S2[1], S2[3], S2[5], S2[7]) - 12 - rnd() * 26, 2, 2), SNOW, 1 / s, 'sky'); }   // spray
  c.restore();
};
const flower = (c: C, x: number, y: number, r: number, col: string) => {
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 + r; shape(c, ell(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * 0.72, r * 0.52, a), col, 1.3); }
  shape(c, ell(x, y, r * 0.28, r * 0.28), OCHRE, 0);
};
const sky = (c: C, col: string, tag: Tag = 'sky') => shape(c, rect(0, 0, 460, 494), col, 0, tag);

// ---------------------------------------------------------------- the washi and the frame of a print
let grainCv: HTMLCanvasElement | null = null;
const finish = (c: C) => {
  if (!grainCv) {                                                                    // 128 px of paper tooth and baren streaks, tiled
    grainCv = document.createElement('canvas'); grainCv.width = grainCv.height = 128; const g = grainCv.getContext('2d')!, d = g.createImageData(128, 128); let s = 99;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < d.data.length; i += 4) { const v = 255 - r() * r() * 60; d.data[i] = v; d.data[i + 1] = v * 0.985; d.data[i + 2] = v * 0.95; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0); g.fillStyle = 'rgba(90, 70, 48, .07)'; for (let y = 0; y < 128; y += 2) if (r() < 0.35) g.fillRect(0, y, 128, 1);
  }
  c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = c.createPattern(grainCv, 'repeat')!; c.fillRect(0, 0, 460, 494);
  c.fillStyle = 'rgba(214, 190, 150, .16)'; c.fillRect(0, 0, 460, 494); c.restore();     // the faint yellowing of old paper
  c.save(); c.lineWidth = 0.8;                                                        // kozo fibres showing through the ink
  for (let i = 0; i < 110; i++) {
    const x = rnd2() * 460, y = rnd2() * 494, a = rnd2() * 6.28, l = 6 + rnd2() * 24;
    c.strokeStyle = i % 3 ? 'rgba(255, 250, 236, .2)' : 'rgba(90, 64, 36, .13)';
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + Math.cos(a + 0.9) * l * 0.5, y + Math.sin(a + 0.9) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
  }
  c.restore();
};
/** the title cartouche, top right */
const cartouche = (c: C, text: string) => {
  let size = 15; do c.font = `bold ${size--}px ${SERIF}`; while (c.measureText(text).width > 230 && size > 9);
  const w = c.measureText(text).width + 26, x = 446 - w, y = 12;
  shape(c, rect(x, y, w, 30), '#f2e2a8', 2.4); line(c, rect(x + 4, y + 4, w - 8, 22), 1);
  if (!mask) { c.fillStyle = KEY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, x + w / 2, y + 16); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; }
};
/** a picture: its own seed, scaled from the 460 x 494 design space to the box it is drawn into, then cartouche and paper */
const A = (seed: number, title: string, draw: (c: C) => void, petals = false): Art => (c, w, h) => {
  s1 = s2 = seed; c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); c.scale(w / 460, h / 494); c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c); cartouche(c, title.toUpperCase());
  if (mask && petals) { c.globalCompositeOperation = 'lighter'; c.fillStyle = '#00f'; c.fillRect(0, 0, 460, 494); }
  if (!mask) finish(c);
  c.restore();
};

// ---------------------------------------------------------------- the six prints
export const games = A(11, 'Games', (c) => {                                         // a wanderer looks across the lake at a castle under the moon
  sky(c, '#efd6b0'); bokashi(c, 0, 250, '#1e2c5e'); bokashi(c, 330, 200, '#e39a84', 0.7);
  shape(c, ell(298, 148, 64, 64), '#f8eed6', 0, 'sky'); glow(c, 298, 148, 110, '#fff4d8', 0.35);
  crane(c, 250, 128, 0.8); crane(c, 300, 166, 0.6); crane(c, 352, 118, 0.7);
  shape(c, poly([0, 312, 50, 286, 96, 298, 150, 262, 196, 290, 262, 248, 318, 284, 372, 266, 460, 298, 460, 350, 0, 350]), vgrad(c, 250, 345, '#6f86a3', '#d8ccb4'), 0);
  shape(c, cloudP(-20, 300, 300, 22), '#f4e4cc', 2.2, 'sky'); shape(c, cloudP(250, 318, 240, 18), '#f3d6c9', 2.2, 'sky');
  shape(c, rect(0, 346, 460, 148), vgrad(c, 346, 494, '#3b6894', DEEP), 0, 'water'); ripples(c, 352, 494, 40, 'rgba(160, 196, 226, .6)'); reflect(c, 298, 352, 470, 26, 'rgba(250, 238, 206, .75)');
  const crag = poly([-4, 520, -4, 268, 22, 262, 178, 262, 200, 300, 214, 352, 204, 410, 240, 520]); shape(c, crag, '#4a5a4f', 3);
  shape(c, poly([150, 266, 178, 266, 196, 302, 206, 350, 186, 330, 170, 290]), '#738070', 0); line(c, seg([40, 300, 70, 340, 64, 390]), 2); line(c, seg([120, 320, 150, 380]), 2);
  castle(c, 104, 264, 0.95); pine(c, 18, 270, 6, 196, 0.5);
  shape(c, poly([200, 520, 252, 430, 322, 404, 402, 392, 470, 380, 470, 520]), '#2c3a2f', 3); shape(c, poly([256, 432, 322, 408, 402, 396, 470, 386, 470, 396, 402, 406, 330, 418]), '#556b4a', 0);
  figure(c, 318, 410, 1.15, PRUSSIAN, -1); pine(c, 462, 500, 418, 300, 0.95);
});

export const hitmen = A(23, 'Gmail auto-draft agent', (c) => {                       // drafts carried safe in a skiff under a great wave
  sky(c, '#efdfbe'); bokashi(c, 0, 160, PRUSSIAN, 0.95);
  shape(c, cloudP(270, 96, 150, 20), SNOW, 2.2, 'sky'); shape(c, cloudP(40, 58, 110, 16), SNOW, 2.2, 'sky');
  const mt = poly([150, 304, 214, 240, 234, 233, 252, 241, 320, 304]); shape(c, mt, '#5d7fa6', 2.4);
  c.save(); c.clip(mt); shape(c, poly([190, 262, 214, 240, 234, 233, 252, 241, 280, 266, 262, 258, 248, 270, 234, 256, 220, 270, 206, 258]), SNOW, 2); c.restore();
  swells(c, 300, 9, 7, '#3d6a96');
  curl(c, 140, 494, 1.55);
  c.save(); c.translate(318, 410); c.rotate(-0.1);                                     // the skiff: a writer, a lantern and a tied bundle of drafts
  shape(c, P((p) => { p.moveTo(-78, -6); p.quadraticCurveTo(-30, 16, 70, 4); p.lineTo(86, -14); p.lineTo(70, -6); p.quadraticCurveTo(-20, 0, -78, -6); p.closePath(); }), '#7a5a3a', 2.4);
  line(c, seg([40, -8, 40, -58]), 2.4); shape(c, ell(40, -50, 8, 11), VERM, 2); glow(c, 40, -50, 30, '#ffcf80', 0.5);
  for (let i = 0; i < 4; i++) shape(c, rect(4 + i * 3, -14 - i * 7, 26, 9), SNOW, 1.6); shape(c, rect(15, -40, 4, 30), VERM, 0);
  figure(c, -30, -6, 0.9, '#3a2a20'); line(c, seg([-20, -22, -6, -30]), 1.6);
  c.restore();
  swells(c, 452, 11, 5, PRUSSIAN); curl(c, 430, 500, 0.62, -1);
});

export const nova = A(37, 'A private AI workspace', (c) => {                         // a lit workshop by the pond under a new star
  sky(c, '#3b4a7a', 'dusk'); bokashi(c, 0, 260, '#0d1230');
  for (let i = 0; i < 46; i++) { const r = rnd() * 1.5 + 0.6; shape(c, ell(rnd() * 460, rnd() * 250, r, r), SNOW, 0, 'dusk'); }
  glow(c, 318, 112, 120, '#ffe2a0', 0.4);
  shape(c, P((p) => { for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, L = k % 2 ? 14 : k % 4 ? 50 : 86; p[k ? 'lineTo' : 'moveTo'](318 + Math.sin(a) * L, 112 - Math.cos(a) * L); } p.closePath(); }), '#f3d684', 1.6, 'dusk');
  shape(c, ell(318, 112, 12, 12), '#fff6d8', 0, 'dusk');
  shape(c, poly([-4, 300, 60, 270, 130, 284, 210, 256, 300, 282, 380, 262, 470, 286, 470, 360, -4, 360]), '#2c4a5a', 2.4);
  for (const [x, y] of [[50, 274], [74, 280], [228, 262], [404, 270]]) shape(c, P((p) => { p.moveTo(x, y + 6); p.lineTo(x - 7, y + 6); p.lineTo(x, y - 20); p.lineTo(x + 7, y + 6); p.closePath(); }), '#1b3036', 1.4);
  shape(c, cloudP(30, 286, 250, 16), '#6c7aa3', 2, 'dusk');
  shape(c, poly([190, 380, 250, 340, 330, 326, 470, 330, 470, 384, 190, 384]), '#3f5a4c', 2.6);
  glow(c, 368, 316, 90, '#ffc060', 0.45);
  c.save(); c.translate(368, 334);                                                     // the workshop
  shape(c, rect(-44, -34, 88, 34), '#5b3e2a', 2.4);
  for (const wx of [-36, 6]) { shape(c, rect(wx, -28, 30, 20), '#f4c766', 1.6); line(c, seg([wx + 10, -28, wx + 10, -8]), 1); line(c, seg([wx + 20, -28, wx + 20, -8]), 1); line(c, seg([wx, -18, wx + 30, -18]), 1); }
  shape(c, poly([-58, -30, 58, -30, 32, -68, -32, -68]), '#6e5a3c', 2.4); shape(c, rect(-35, -73, 70, 7), '#3a2a20', 2);
  c.restore();
  c.save(); c.translate(250, 350);                                                     // a stone lantern
  shape(c, rect(-9, -4, 18, 6), STONE, 1.6); shape(c, rect(-3, -22, 6, 18), STONE, 1.6); shape(c, rect(-8, -34, 16, 12), STONE, 1.6); shape(c, rect(-4, -31, 8, 6), '#f4c766', 0);
  shape(c, poly([-14, -33, 14, -33, 4, -44, -4, -44]), STONE, 1.6); shape(c, ell(0, -47, 3, 3), STONE, 1.4);
  c.restore();
  shape(c, rect(0, 380, 460, 114), vgrad(c, 380, 494, '#2c4170', '#121a36'), 0, 'water');
  ripples(c, 386, 494, 30, 'rgba(140, 160, 210, .55)'); reflect(c, 318, 386, 490, 20, 'rgba(243, 214, 132, .7)'); reflect(c, 368, 386, 440, 30, 'rgba(244, 199, 102, .55)');
  shape(c, poly([-4, 520, -4, 420, 40, 412, 110, 440, 150, 520]), '#22322b', 2.6);
  for (let i = 0; i < 9; i++) { const x = 8 + i * 13, h = 30 + rnd() * 34; line(c, P((p) => { p.moveTo(x, 470); p.quadraticCurveTo(x + 4, 470 - h / 2, x + 9, 470 - h); }), 2.2, '#4d6b44'); }
});

export const himalaya = A(41, 'Where he would rather be', (c) => {                   // dawn on the high peaks above a sea of cloud
  sky(c, '#f3dcc4'); bokashi(c, 0, 170, PRUSSIAN); bokashi(c, 280, 150, '#eab0aa', 0.75);
  shape(c, ell(104, 118, 30, 30), VERM, 0, 'sky');
  crane(c, 168, 70, 0.55); crane(c, 196, 92, 0.5); crane(c, 224, 112, 0.45); crane(c, 252, 128, 0.4);
  shape(c, poly([-4, 300, 30, 252, 70, 266, 116, 214, 150, 240, 178, 226, 200, 300]), '#c3d2e2', 2);
  const mass = poly([96, 330, 170, 244, 206, 254, 282, 118, 300, 132, 330, 106, 384, 192, 420, 200, 470, 252, 470, 330]); shape(c, mass, SNOW, 3);
  c.save(); c.clip(mass);
  shape(c, poly([282, 118, 300, 132, 300, 210, 250, 330, 330, 330, 316, 220]), '#a9bfd8', 0); shape(c, poly([330, 106, 384, 192, 420, 200, 470, 252, 470, 330, 360, 330, 340, 230]), '#a9bfd8', 0);
  shape(c, poly([170, 244, 206, 254, 196, 300, 150, 330]), '#a9bfd8', 0); bokashi(c, 330, 220, '#6f86a3', 0.6);
  for (const [x, y, l] of [[300, 150, 70], [340, 160, 60], [380, 210, 40], [210, 270, 40], [262, 200, 60]]) line(c, seg([x, y, x - 12, y + l * 0.5, x - 4, y + l]), 1.6, '#55708f');
  c.restore(); line(c, seg([300, 132, 300, 210, 284, 300]), 2); line(c, seg([330, 106, 340, 230, 330, 320]), 2);
  shape(c, cloudP(120, 306, 260, 20), '#f7e8e2', 1.4, 'sky'); shape(c, cloudP(-20, 318, 510, 34), SNOW, 1.8, 'sky');   // a calm sea of cloud: two long, soft bands
  shape(c, poly([-4, 520, -4, 384, 80, 364, 170, 378, 260, 406, 300, 520]), '#5d6b55', 3);
  shape(c, poly([220, 520, 296, 420, 380, 404, 470, 412, 470, 520]), '#47553f', 3);
  shape(c, poly([-4, 392, 80, 372, 170, 386, 160, 394, 80, 382, -4, 402]), '#7f8c6a', 0);
  line(c, seg([36, 384, 36, 300]), 3);                                                  // prayer flags from a pole down to the rocks
  const flags = ['#2f5f9e', SNOW, VERM, '#4f8a4a', OCHRE];
  line(c, P((p) => { p.moveTo(36, 302); p.quadraticCurveTo(140, 350, 230, 372); }), 1.4);
  for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12, fx = (1 - t) ** 2 * 36 + 2 * (1 - t) * t * 140 + t * t * 230, fy = (1 - t) ** 2 * 302 + 2 * (1 - t) * t * 350 + t * t * 372; shape(c, poly([fx - 5, fy, fx + 5, fy + 1, fx + 4, fy + 13, fx - 6, fy + 12]), flags[i % 5], 1.2); }
  figure(c, 336, 408, 0.75, VERM); line(c, seg([348, 408, 344, 372]), 1.6);
  pine(c, 448, 500, 418, 364, 0.8);
});

export const security = A(53, 'Built in from the first stone', (c) => {             // the castle on its stone wall, gate shut, moat still
  sky(c, '#f1e1c0'); bokashi(c, 0, 150, PRUSSIAN, 0.95);
  shape(c, cloudP(20, 92, 140, 18), SNOW, 2.2, 'sky'); shape(c, cloudP(300, 130, 150, 20), '#f6e5d9', 2.2, 'sky');
  shape(c, poly([-4, 290, 60, 262, 140, 276, 240, 250, 340, 270, 420, 256, 470, 268, 470, 320, -4, 320]), '#8fa58a', 2.2);
  castle(c, 230, 300, 1.55, false);
  const wall = poly([30, 410, 430, 410, 400, 298, 60, 298]); shape(c, wall, STONE, 3); courses(c, wall, 30, 298, 430, 410, 14, 34, 1.4);
  shape(c, rect(36, 382, 34, 14), '#c8b07a', 1.4);                                   // the first stone, laid first
  shape(c, poly([186, 342, 274, 342, 262, 326, 198, 326]), ROOF, 2.4);
  shape(c, rect(196, 342, 68, 68), '#3a2a20', 2.4); line(c, seg([230, 342, 230, 410]), 2);
  for (let gx = 204; gx < 260; gx += 12) for (let gy = 352; gy < 406; gy += 14) if (Math.abs(gx - 230) > 6) shape(c, ell(gx, gy, 2.6, 2.6), OCHRE, 0);
  shape(c, rect(222, 368, 16, 10), '#8a8a8a', 1.6);
  shape(c, rect(-4, 408, 468, 90), vgrad(c, 408, 494, '#4a7598', DEEP), 0, 'water');
  shape(c, poly([30, 410, 430, 410, 410, 440, 50, 440]), 'rgba(40, 52, 66, .45)', 0, 'water');
  ripples(c, 414, 494, 34, 'rgba(170, 200, 226, .6)');
  shape(c, poly([-4, 412, -4, 300, 40, 312, 60, 412]), '#5f7a50', 2.6); shape(c, poly([470, 412, 470, 300, 420, 312, 404, 412]), '#5f7a50', 2.6);
  pine(c, 22, 412, 44, 262, 0.75); pine(c, 440, 412, 410, 266, 0.7);
});

export const letters = A(67, 'Write to Aasish', (c) => {                             // spring by the river: a courier crosses the bridge
  sky(c, '#f4e6cc'); bokashi(c, 0, 170, '#e7a3b6', 0.8); bokashi(c, 0, 46, PRUSSIAN, 0.9);
  shape(c, poly([-4, 262, 70, 236, 150, 250, 250, 226, 350, 246, 470, 232, 470, 300, -4, 300]), '#a8b89a', 2.2);
  shape(c, rect(-4, 256, 468, 260), '#93ab73', 0);
  for (const [x, y] of [[30, 244], [48, 248], [372, 238], [392, 242], [412, 240]]) shape(c, poly([x, y + 8, x - 6, y + 8, x, y - 14, x + 6, y + 8]), PINE2, 1.4);
  for (const x of [100, 132]) { shape(c, rect(x, 252, 22, 10), SNOW, 1.4); shape(c, poly([x - 5, 253, x + 27, 253, x + 19, 244, x + 3, 244]), ROOF, 1.4); }   // a far farmhouse or two
  for (let i = 0; i < 16; i++) { const left = i < 6, x = left ? 10 + rnd() * 120 : 300 + rnd() * 150, y = left ? 280 + rnd() * 70 : 280 + rnd() * 110; line(c, seg([x - 5, y - 6, x, y + 2, x + 1, y - 10, x + 2, y + 2, x + 7, y - 7]), 1.8, '#5f7f4a'); }
  shape(c, blob([280, 254, 340, 252, 300, 300, 250, 350, 262, 420, 340, 520, -40, 520, -40, 440, 120, 380, 200, 320, 250, 276]), vgrad(c, 254, 494, '#6d9ac0', PRUSSIAN), 2.6, 'water');
  ripples(c, 280, 494, 24, 'rgba(220, 236, 246, .55)');
  const bx = 216, by = 338, bw = 190, bh = 26, q = (t: number, a: number, m: number, b: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * m + t * t * b;
  for (const t of [0.22, 0.78]) shape(c, rect(q(t, bx - bw / 2, bx, bx + bw / 2) - 4, q(t, by, by - 2 * bh, by) + 6, 8, 40), '#3a2a20', 2);
  shape(c, P((p) => { p.moveTo(bx - bw / 2, by); p.quadraticCurveTo(bx, by - 2 * bh, bx + bw / 2, by); p.lineTo(bx + bw / 2, by + 9); p.quadraticCurveTo(bx, by - 2 * bh + 9, bx - bw / 2, by + 9); p.closePath(); }), VERM, 2.4);
  figure(c, bx + 8, q(0.54, by, by - 2 * bh, by) + 1, 0.8, PRUSSIAN, -1); line(c, seg([bx - 10, by - 44, bx + 30, by - 50]), 1.8);   // the courier and his pole
  shape(c, rect(bx - 16, by - 44, 9, 8), OCHRE, 1.2); shape(c, rect(bx + 24, by - 50, 9, 8), OCHRE, 1.2);
  for (let k = 0; k <= 8; k++) { const t = k / 8, px = q(t, bx - bw / 2, bx, bx + bw / 2), py = q(t, by, by - 2 * bh, by); shape(c, rect(px - 2, py - 16, 4, 16), VERM, 1.2); }
  line(c, P((p) => { p.moveTo(bx - bw / 2, by - 16); p.quadraticCurveTo(bx, by - 2 * bh - 16, bx + bw / 2, by - 16); }), 5); line(c, P((p) => { p.moveTo(bx - bw / 2, by - 16); p.quadraticCurveTo(bx, by - 2 * bh - 16, bx + bw / 2, by - 16); }), 3, VERM);
  const branch = (pts: number[], w: number) => { const b = P((p) => { p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) p.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); }); line(c, b, w + 4); line(c, b, w, '#4a3324'); };
  branch([-10, 30, 90, 40, 160, 90, 220, 130, 320, 120], 9); branch([120, 64, 150, 30, 196, 18], 5); branch([200, 112, 236, 160, 280, 176], 4);
  for (const [x, y, p] of [[40, 44, 1], [86, 34, 0], [124, 76, 1], [150, 40, 1], [196, 18, 0], [178, 102, 0], [228, 120, 1], [262, 112, 0], [300, 124, 1], [236, 156, 1], [280, 176, 0], [64, 62, 0], [206, 140, 0]]) flower(c, x, y, 10, p ? PINK : '#fbeef0');
  c.save(); c.translate(356, 432); c.rotate(-0.22);                                     // a folded letter, tied with a red cord
  shape(c, rect(-74, -28, 148, 56), SNOW, 2.6); line(c, seg([-74, -28, -30, 0, -74, 28]), 1.4); line(c, seg([74, -28, 30, 0, 74, 28]), 1.4);
  shape(c, rect(-7, -30, 14, 60), VERM, 1.8); shape(c, ell(-10, -32, 9, 5, -0.5), VERM, 1.6); shape(c, ell(10, -32, 9, 5, 0.5), VERM, 1.6);
  c.restore();
}, true);

// ---------------------------------------------------------------- the living print (poster material, mask: r water, g sky, b petals)
/** water ripples and glints, slow mist drifting across the sky, petals falling, only where the mask says. No extra draw calls. */
export function liven(mat: THREE.MeshStandardMaterial, maskTex: THREE.Texture, time: { value: number }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time; sh.uniforms.uMask = { value: maskTex };
    sh.fragmentShader = `uniform float uTime;
uniform sampler2D uMask;
float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float pNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y); }
` + sh.fragmentShader.replace('#include <map_fragment>', `
  vec4 pMask = texture2D(uMask, vMapUv);
  vec2 pLoc = mod(vec2(vMapUv.x, 1.0 - vMapUv.y) * 2048.0, vec2(512.0, 768.0));      // the pixel inside its poster
  vec2 pUv = vMapUv + pMask.r * vec2(sin(pLoc.y * 0.45 - uTime * 1.6 + sin(pLoc.x * 0.04 + uTime * 0.5) * 2.0), 0.5 * sin(pLoc.x * 0.08 + uTime * 1.1)) * (1.4 / 2048.0);
  vec4 sampledDiffuseColor = texture2D(map, pUv);
  diffuseColor *= sampledDiffuseColor;
  diffuseColor.rgb += pMask.r * 0.09 * pow(max(0.0, sin(pLoc.x * 0.06 + sin(pLoc.y * 0.21 + uTime * 0.7) * 2.5 - uTime * 0.8) * sin(pLoc.y * 0.5 + uTime * 1.3)), 6.0);
  if (pMask.g > 0.02) {
    float n = pNoise(vec2(pLoc.x * 0.007 - uTime * 0.022, pLoc.y * 0.03)) * 0.7 + pNoise(vec2(pLoc.x * 0.02 - uTime * 0.035, pLoc.y * 0.08)) * 0.3;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.86, 0.70), smoothstep(0.6, 0.65, n) * pMask.g * 0.5);
  }
  if (pMask.b > 0.02) {
    vec2 q = (pLoc + vec2(sin(uTime * 0.7 + pLoc.y * 0.03) * 9.0, -uTime * 14.0)) / 44.0, cell = floor(q), f = fract(q) - 0.5;
    float h = pHash(cell), a = h * 50.0 + uTime * (h - 0.8) * 4.0;
    vec2 d = mat2(cos(a), -sin(a), sin(a), cos(a)) * (f - (vec2(pHash(cell + 3.1), pHash(cell + 7.7)) - 0.5) * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.45, 0.54), step(0.62, h) * smoothstep(0.16, 0.12, length(d * vec2(1.0, 1.9))) * pMask.b);
  }
`);
  };
}
