import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { Terrain } from './terrain';

// Gonbei's farm at the meadow's edge: a flooded rice paddy on its own level terrace inside low earthen bunds (seedlings in
// rows, a bamboo pipe trickling in, a notched spillway, a scarecrow), a fenced vegetable garden in furrows down the slope
// (a freshly hoed strip, daikon, cabbages, negi, eggplants on stakes, beans on a bamboo trellis), and a thatched tool shed
// with its rain barrel, pails, baskets, a drying rack, a two-wheeled cart and a stump to rest on. make_island.py levels the
// paddy and the shed and keeps the grass off the farm (its PADDY/GARDEN/YARD mirror these, x negated). Everything static is
// one vertex-coloured mesh whose plants sway in its shader, the paddy's water a second mesh (the sky in it is the scene's
// environment map): two draws. Colliders for the solid things; the bunds are low enough to step onto.

export const FARM = {
  paddy: { x: -18, z: 29.5, hx: 4, hz: 3 },
  bed: { x0: -24.4, x1: -17.4, z0: 35.1, z1: 39.9 }, rows: [35.5, 36.3, 37.1, 37.9, 38.7, 39.5],   // the first row is bare, freshly hoed
  fence: { x0: -25.2, x1: -16.8, z0: 34.7, z1: 40.3, gate: [35.6, 36.6] },                         // the gate is in the west side
  shed: { x: -28.5, z: 38 }, barrel: { x: -27.35, z: 36.45 }, stump: { x: -26.4, z: 40.4 },
  poleRest: { x: -26.75, z: 36.45 }, basketRest: { x: -26.6, z: 39.0 },
  walkX: -24.75, gateIn: [-24.75, 36.1] as [number, number], gateOut: [-25.95, 36.1] as [number, number],
};
export const inGarden = (x: number, z: number) => x > FARM.fence.x0 && x < FARM.fence.x1 && z > FARM.fence.z0 && z < FARM.fence.z1;

type Tpl = { p: Float32Array; n: Float32Array; h: Float32Array };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _nm = new THREE.Matrix3();
const Y = new THREE.Vector3(0, 1, 0);
/** a template: flat triangles, with each vertex's height in its own bounds (0 at the bottom, 1 at the top: colour ramps, sway) */
function tpl(g: THREE.BufferGeometry): Tpl {
  g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position.array as Float32Array, n = g.attributes.normal.array as Float32Array, h = new Float32Array(p.length / 3);
  let lo = Infinity, hi = -Infinity; for (let i = 1; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
  for (let i = 0; i < h.length; i++) h[i] = (p[i * 3 + 1] - lo) / Math.max(hi - lo, 1e-6);
  return { p: Float32Array.from(p), n: Float32Array.from(n), h };
}
/** a bent, tapering blade or leaf along +z rising: w wide, len long, tip lifted by rise, two segments */
function blade(w: number, len: number, rise: number, droop: number) {
  const pts = [[0, 0], [0.5, 1], [1, 0]].map(([u, ww]) => [u * len, rise * Math.sin(u * Math.PI * 0.62) - droop * u * u, ww]);
  const v: number[] = []; const P = (k: number, s: number) => [s * w * (k === 2 ? 0.02 : k === 1 ? 0.5 : 0.35), pts[k][1], pts[k][0]];
  for (let k = 0; k < 2; k++) { const a = P(k, -1), b = P(k, 1), c = P(k + 1, -1), d = P(k + 1, 1); v.push(...a, ...b, ...d, ...a, ...d, ...c); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}

export function buildFarm(scene: THREE.Scene, world: RAPIER.World, t: Terrain, low: boolean) {
  let body: RAPIER.RigidBody | null = null; const fixed = () => (body ??= world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
  const gy = (x: number, z: number) => t.heightAt(x, z);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), rr = (a: number, b: number) => a + rnd() * (b - a);
  const pos: number[] = [], nor: number[] = [], col: number[] = [], sw: number[] = [];
  const C = (hex: number) => new THREE.Color(hex), M = new THREE.Matrix4();
  /** append a template at (x, y, z), turned (ry heading, rx/rz tilts), scaled; colour c0 at its foot to c1 at its top */
  function add(T: Tpl, x: number, y: number, z: number, c0: THREE.Color, c1 = c0, sway = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    M.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); addM(T, M, c0, c1, sway);
  }
  function addM(T: Tpl, m: THREE.Matrix4, c0: THREE.Color, c1 = c0, sway = 0) {
    _nm.getNormalMatrix(m); const j = 0.93 + rnd() * 0.14;
    for (let i = 0; i < T.h.length; i++) {
      _v.fromArray(T.p, i * 3).applyMatrix4(m); pos.push(_v.x, _v.y, _v.z); _w.fromArray(T.n, i * 3).applyMatrix3(_nm).normalize(); nor.push(_w.x, _w.y, _w.z);
      const k = T.h[i]; col.push((c0.r + (c1.r - c0.r) * k) * j, (c0.g + (c1.g - c0.g) * k) * j, (c0.b + (c1.b - c0.b) * k) * j); sw.push(sway * k * k);
    }
  }
  /** a round rod (bamboo, a post, a handle) from a to b */
  const ROD = [4, 5, 6, 8, 10].reduce((o, n) => ((o[n] = tpl(new THREE.CylinderGeometry(1, 1, 1, n, 1, true).translate(0, 0.5, 0))), o), {} as Record<number, Tpl>);
  function rod(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, c: THREE.Color, seg = 6, c1 = c) {
    _w.set(bx - ax, by - ay, bz - az); const l = _w.length(); M.compose(_v.set(ax, ay, az), _q.setFromUnitVectors(Y, _w.normalize()), _s.set(r, l, r)); addM(ROD[seg], M, c, c1);
  }
  const BOX = tpl(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), ICO = tpl(new THREE.IcosahedronGeometry(1, 0)), ICO1 = tpl(new THREE.IcosahedronGeometry(1, 1));
  const CYL = tpl(new THREE.CylinderGeometry(1, 1, 1, 12, 1).translate(0, 0.5, 0)), CONE = tpl(new THREE.ConeGeometry(1, 1, 14, 1, true).translate(0, 0.5, 0));
  const DISC = tpl(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2)), HOOP = tpl(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, 0.5, 0));
  const PAIL = tpl(new THREE.LatheGeometry([0, 0.13, 0.155, 0.145, 0.123, 0].map((r, i) => new THREE.Vector2(r, [0, 0, 0.27, 0.27, 0.016, 0.016][i])), 10));
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: THREE.Color, ry = 0, rx = 0, rz = 0, c1 = c) => add(BOX, x, y, z, c, c1, 0, ry, rx, rz, w, h, d);
  const pail = (x: number, z: number, water: boolean) => {
    const y = gy(x, z); add(PAIL, x, y, z, C(0x9a7a50)); for (const h of [0.04, 0.2]) add(HOOP, x, y + h, z, C(0x2a2622), C(0x2a2622), 0, 0, 0, 0, 0.148 + 0.022 * h / 0.27, 0.03, 0.148 + 0.022 * h / 0.27);
    if (water) add(DISC, x, y + 0.22, z, C(0x4c5f5e), C(0x4c5f5e), 0, 0, 0, 0, 0.142, 1, 0.142);
  };

  // ------------------------------------------------------------ the paddy: bunds, water, seedlings, the inlet and spillway
  const P = FARM.paddy, Y0 = gy(P.x, P.z), WY = Y0 + 0.1, mud = C(0x5d4632), mudTop = C(0x6b6038), grassy = C(0x55603a);
  const ring: [number, number, number, number][] = [];                               // a rounded rectangle round the water: point, outward normal
  { const ex = P.hx + 0.25, ez = P.hz + 0.25, r = 0.4, ax = ex - r, az = ez - r;
    const corner = (cx: number, cz: number, a0: number) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * Math.PI / 2; ring.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
    const side = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.45); for (let k = 1; k < n; k++) ring.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, nx, nz]); };
    corner(ax, az, 0); side(ax, ez, -ax, ez, 0, 1); corner(-ax, az, Math.PI / 2); side(-ex, az, -ex, -az, -1, 0);
    corner(-ax, -az, Math.PI); side(-ax, -ez, ax, -ez, 0, -1); corner(ax, -az, 1.5 * Math.PI); side(ex, -az, ex, az, 1, 0); }
  const SPILL = { x: P.x - P.hx - 0.25, z: P.z + 1.2 };                                    // the notch in the west bund, the low corner
  const prof = [[-0.45, -0.12], [-0.2, 0.22], [0.2, 0.24], [0.5, -0.3]], bund: number[][][] = [];
  for (const [lx, lz, nx, nz] of ring) {
    const x = P.x + lx, z = P.z + lz, notch = Math.max(0, 1 - Math.hypot(x - SPILL.x, z - SPILL.z) / 0.45), bump = 0.025 * Math.sin(x * 2.3 + z * 1.7);
    bund.push(prof.map(([o, h], i) => [x + nx * o, Y0 + (i === 1 || i === 2 ? h + bump - 0.13 * notch : h), z + nz * o]));
  }
  const quad = (a: number[], b: number[], c: number[], d: number[], ca: THREE.Color, cb: THREE.Color) => {
    const n = _w.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).cross(_v.set(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    for (const [p, k] of [[a, ca], [b, ca], [c, cb], [a, ca], [c, cb], [d, cb]] as [number[], THREE.Color][]) { pos.push(p[0], p[1], p[2]); nor.push(n.x, n.y, n.z); col.push(k.r, k.g, k.b); sw.push(0); }
  };
  for (let i = 0; i < bund.length; i++) {
    const A = bund[i], B = bund[(i + 1) % bund.length];
    for (let k = 0; k < 3; k++) quad(A[k], B[k], B[k + 1], A[k + 1], k === 0 ? mud : k === 1 ? grassy : mudTop, k === 2 ? mud : k === 1 ? grassy : mudTop);
  }
  box(SPILL.x, Y0 - 0.02, SPILL.z, 0.04, 0.2, 0.55, C(0x6e5a40));                        // the spillway's board
  // rice seedlings: tufts of five blades in rows, swaying
  const BL = [tpl(blade(0.014, 0.3, 0.05, 0.02)), tpl(blade(0.012, 0.34, 0.08, 0.05))].map((b) => b);
  const sx = low ? 0.42 : 0.3, sz = low ? 0.38 : 0.27, rice0 = C(0x4f7a2c), rice1 = C(0x9cc456);
  for (let x = P.x - P.hx + 0.3; x <= P.x + P.hx - 0.3; x += sx) for (let z = P.z - P.hz + 0.3; z <= P.z + P.hz - 0.3; z += sz) {
    if (Math.hypot(x - (P.x - 2.6), z - (P.z + 2)) < 0.4) continue;                      // round the scarecrow's pole
    const yaw0 = rnd() * 6.28, hgt = rr(0.85, 1.15);
    for (let k = 0; k < 5; k++) add(BL[k & 1], x + rr(-0.02, 0.02), Y0 - 0.02, z + rr(-0.02, 0.02), rice0, rice1, 1.6, yaw0 + k * 1.257, -1.25 + rr(-0.2, 0.15), 0, 1, hgt, hgt);
  }
  // the scarecrow (kakashi): a pole and crossbar, a straw body in an old indigo kimono, a sack head, a sedge hat; facing south
  { const x = P.x - 2.6, z = P.z + 2, straw = C(0xc9a868), indigo = C(0x2e3a5c), y = Y0 - 0.1;
    rod(x, y, z, x, y + 1.72, z, 0.03, C(0x6b5236)); rod(x - 0.62, y + 1.33, z, x + 0.62, y + 1.33, z, 0.022, C(0x6b5236));
    add(CONE, x, y + 0.62, z, straw, C(0xb08f50), 0.3, 0, Math.PI, 0, 0.16, 0.5, 0.16);    // straw skirt, flaring down
    box(x, y + 0.98, z, 0.38, 0.45, 0.2, indigo, 0, 0, 0, C(0x3a4870)); box(x - 0.05, y + 1.1, z - 0.105, 0.12, 0.12, 0.01, C(0x8a6a48));   // kimono, a patch
    for (const s of [-1, 1]) { box(x + s * 0.4, y + 1.12, z, 0.42, 0.28, 0.16, indigo, 0, 0, s * 0.12); add(CONE, x + s * 0.63, y + 1.33, z, straw, straw, 0.4, 0, 0, s * Math.PI / 2, 0.06, 0.16, 0.06); }
    add(ICO1, x, y + 1.5, z, C(0xd8c69a), C(0xd8c69a), 0, 0, 0, 0, 0.14, 0.15, 0.13);
    for (const s of [-1, 1]) box(x + s * 0.05, y + 1.53, z - 0.13, 0.035, 0.012, 0.01, C(0x222222)); box(x, y + 1.46, z - 0.13, 0.08, 0.012, 0.01, C(0x222222));   // an ink face
    add(CONE, x, y + 1.6, z, C(0xb59a62), C(0x9c814c), 0, 0, 0, 0, 0.3, 0.14, 0.3);
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.8, 0.12).setTranslation(x, Y0 + 0.8, z), fixed()); }
  // the inlet: a bamboo pipe on crossed sticks from the slope above, over the east bund
  const IN = { x0: -11.2, x1: P.x + P.hx + 0.3, z: P.z - 1.1 }, inY0 = gy(IN.x0, IN.z) + 0.38, inY1 = Y0 + 0.42, bamboo = C(0x8f8a4a);
  rod(IN.x0, inY0, IN.z, IN.x1, inY1, IN.z, 0.045, bamboo, 8);
  for (const x of [-12.4, -11.6]) { const y = gy(x, IN.z), h = inY0 + (inY1 - inY0) * (x - IN.x0) / (IN.x1 - IN.x0) - y; for (const s of [-1, 1]) rod(x, y - 0.1, IN.z + s * 0.22, x, y + h + 0.06, IN.z - s * 0.08, 0.014, C(0x6b5236), 4); }
  for (let k = 0; k < 6; k++) add(ICO, IN.x0 + rr(-0.2, 0.35), gy(IN.x0, IN.z) + 0.08, IN.z + rr(-0.35, 0.35), C(0x7c7a72), C(0x8e8b82), 0, rnd() * 6, 0, 0, rr(0.14, 0.24), rr(0.1, 0.18), rr(0.14, 0.22));

  // ------------------------------------------------------------ the vegetable garden
  const B = FARM.bed, R = FARM.rows, soilD = C(0x3f2c1e), soilL = C(0x5c4230), soilN = C(0x6e4e34);
  const ridge = (z: number) => (z < (R[0] + R[1]) / 2 ? 0.015 * Math.sin(z * 37) : 0.1 * (0.5 + 0.5 * Math.cos((2 * Math.PI * (z - R[1])) / 0.8)));
  { const nx = 19, nz = 39, g: number[][][] = [];
    for (let i = 0; i <= nz; i++) { const row: number[][] = []; for (let j = 0; j <= nx; j++) {
      const x = B.x0 - 0.15 + (B.x1 - B.x0 + 0.3) * j / nx, z = B.z0 - 0.15 + (B.z1 - B.z0 + 0.3) * i / nz;
      const edge = Math.min(1, (x - B.x0 + 0.15) / 0.3, (B.x1 + 0.15 - x) / 0.3, (z - B.z0 + 0.15) / 0.3, (B.z1 + 0.15 - z) / 0.3);
      row.push([x, gy(x, z) + 0.01 + ridge(z) * edge, z, ridge(z)]); } g.push(row); }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nx; j++) {
      const a = g[i][j], b = g[i][j + 1], c = g[i + 1][j + 1], d = g[i + 1][j], zc = (a[2] + d[2]) / 2;
      const fresh = zc < (R[0] + R[1]) / 2, ca = fresh ? soilN : soilD.clone().lerp(soilL, a[3] * 10), cd = fresh ? soilN : soilD.clone().lerp(soilL, d[3] * 10);
      quad(a, d, c, b, ca, cd);
    } }
  const rowTop = (x: number, z: number) => gy(x, z) + 0.1;
  const step = low ? 2 : 1;
  // daikon: rosettes of long leaves round a white shoulder
  const DL = tpl(blade(0.07, 0.34, 0.16, 0.12)), leafD = C(0x3d6526), leafL = C(0x5f8f34);
  for (let x = B.x0 + 0.3, i = 0; x < B.x1 - 0.2; x += 0.38, i++) { if (i % step) continue; const z = R[1], y = rowTop(x, z);
    add(CYL, x, y - 0.02, z, C(0xe8eadc), C(0xcfe0b0), 0, 0, 0, 0, 0.045, 0.07, 0.045); const a0 = rnd() * 6;
    for (let k = 0; k < 6; k++) add(DL, x, y + 0.04, z, leafD, leafL, 0.8, a0 + k * 1.05, -0.2, 0, 1, rr(0.9, 1.2), rr(0.85, 1.1)); }
  // cabbages: a pale head in a cup of dark outer leaves
  const CL = tpl(blade(0.2, 0.2, 0.08, 0.02));
  for (let x = B.x0 + 0.35, i = 0; x < B.x1 - 0.2; x += 0.56, i++) { if (i % step) continue; const z = R[2], y = rowTop(x, z);
    add(ICO1, x, y + 0.1, z, C(0xb6d08a), C(0xd3e2a8), 0, rnd() * 6, 0, 0, 0.15, 0.12, 0.15); const a0 = rnd() * 6;
    for (let k = 0; k < 5; k++) add(CL, x, y + 0.02, z, C(0x4a7a3a), C(0x6f9a52), 0.3, a0 + k * 1.26, -0.45, 0); }
  // negi: clumps of tall stalks, white below and blue-green above
  const NG = tpl(new THREE.CylinderGeometry(0.007, 0.011, 1, 3, 1, true).translate(0, 0.5, 0));
  for (let x = B.x0 + 0.25, i = 0; x < B.x1 - 0.15; x += 0.3, i++) { if (i % step) continue; const z = R[3], y = gy(x, z) + 0.06;
    for (let k = 0; k < 4; k++) add(NG, x + rr(-0.04, 0.04), y, z + rr(-0.04, 0.04), C(0xe6e8d6), C(0x4f8a52), 0.6, 0, rr(-0.12, 0.12), rr(-0.12, 0.12), 1, rr(0.38, 0.55), 1); }
  // eggplants: a leafy bush tied to a bamboo stake, three glossy purple fruit hanging
  for (let x = B.x0 + 0.35, i = 0; x < B.x1 - 0.2; x += 0.62, i++) { if (i % step) continue; const z = R[4], y = rowTop(x, z);
    rod(x + 0.06, y - 0.05, z, x + 0.06, y + 0.82, z, 0.011, bamboo, 5);
    for (const [h, s] of [[0.22, 0.17], [0.42, 0.15], [0.6, 0.11]]) add(ICO, x + rr(-0.04, 0.04), y + h, z + rr(-0.04, 0.04), C(0x335a28), C(0x4e7a3a), 0.25, rnd() * 6, 0, 0, s, s * 0.7, s);
    for (let k = 0; k < 3; k++) { const a = rnd() * 6; add(ICO, x + Math.cos(a) * 0.12, y + rr(0.16, 0.36), z + Math.sin(a) * 0.12, C(0x2a1530), C(0x3b1f44), 0.2, a, 0, 0.25, 0.035, 0.08, 0.035); } }
  // climbing beans on an A-frame bamboo trellis along the last row
  { const z = R[5], legs = low ? 4 : 7, leaf = tpl(blade(0.08, 0.09, 0.02, 0.0)), bean = C(0x4e7f34);
    const tops: number[][] = [];
    for (let k = 0; k < legs; k++) { const x = B.x0 + 0.2 + (B.x1 - B.x0 - 0.4) * k / (legs - 1), y = gy(x, z), top = y + 1.45;
      for (const s of [-1, 1]) { rod(x, y - 0.1, z + s * 0.32, x, top + 0.1, z - s * 0.05, 0.013, bamboo, 5);
        if (!low) for (let i = 0; i < 16; i++) { const u = i / 16 + rr(0, 0.04); add(leaf, x + rr(-0.05, 0.05), y + (top - y) * u, z + s * 0.32 * (1 - u) - s * 0.05 * u + rr(-0.03, 0.03), bean, C(0x76a446), 0.5, rnd() * 6, rr(-0.8, 0.3), rr(-0.4, 0.4)); } }
      if (!low) for (let i = 0; i < 4; i++) rod(x + rr(-0.15, 0.15), top - rr(0.2, 0.7), z + rr(-0.18, 0.18), x + rr(-0.15, 0.15), top - rr(0.85, 1.0), z + rr(-0.18, 0.18), 0.008, C(0x6c9a3c), 4);   // pods
      tops.push([x, top, z]); }
    rod(tops[0][0] - 0.2, tops[0][1], z, tops[legs - 1][0] + 0.2, tops[legs - 1][1], z, 0.016, bamboo, 6); }
  // a low bamboo fence with a gate gap (its little gate swung open), posts and two rails
  const F = FARM.fence, postC = C(0x8a7a48), rail = (a: number[], b: number[]) => { for (const h of [0.3, 0.62]) rod(a[0], gy(a[0], a[1]) + h, a[1], b[0], gy(b[0], b[1]) + h, b[1], 0.014, postC, 5); };
  { const runs = [[[F.x0, F.gate[1]], [F.x0, F.z1]], [[F.x0, F.z1], [F.x1, F.z1]], [[F.x1, F.z1], [F.x1, F.z0]], [[F.x1, F.z0], [F.x0, F.z0]], [[F.x0, F.z0], [F.x0, F.gate[0]]]];
    for (const [a, b] of runs) { const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.05));
      for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; rod(x, gy(x, z) - 0.1, z, x, gy(x, z) + 0.75, z, 0.024, postC, 6); }
      rail(a, b); }
    const hx = F.x0, hz = F.gate[1], ga = -1.25, gx = hx + Math.sin(ga) * 0.95, gz = hz + Math.cos(ga) * 0.95;   // hinged at the north post, swung out
    rail([hx, hz], [gx, gz]); rod(gx, gy(gx, gz) + 0.05, gz, gx, gy(gx, gz) + 0.7, gz, 0.018, postC, 5); }

  // ------------------------------------------------------------ the shed, the yard and its things
  const S = FARM.shed, SY = gy(S.x, S.z), wood = C(0x6e5438), woodD = C(0x4c3a28), thatch = C(0xa88a52), thatchD = C(0x7c6438);
  for (const [px, pz] of [[0.85, 1.25], [0.85, -1.25], [-0.85, 1.25], [-0.85, -1.25]]) box(S.x + px, SY - 0.1, S.z + pz, 0.11, 2.0, 0.11, woodD);
  box(S.x - 0.88, SY, S.z, 0.05, 1.82, 2.5, wood); for (const s of [-1, 1]) box(S.x, SY, S.z + s * 1.27, 1.7, 1.82, 0.05, wood);   // back and side walls
  for (let k = 0; k < 9; k++) box(S.x - 0.92, SY, S.z - 1.2 + k * 0.3, 0.02, 1.82, 0.035, woodD);                                // battens
  for (const s of [-1, 1]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.9, 1.82, 0, 0.9, 1.82, 0, 0, 2.5, 0], 3)); g.computeVertexNormals(); add(tpl(g), S.x, SY, S.z + s * 1.27, wood); }   // gables
  for (const s of [-1, 1]) box(S.x + s * 0.63, SY + 2.05, S.z, 1.55, 0.2, 3.1, thatch, 0, 0, -s * 0.57, thatchD);                 // thatch, thick, overhanging
  rod(S.x, SY + 2.53, S.z - 1.6, S.x, SY + 2.53, S.z + 1.6, 0.11, thatchD, 8);
  box(S.x - 0.05, SY + 0.28, S.z, 1.6, 0.07, 2.4, C(0x7a6040));                                                                   // the raised floor
  for (const dz of [-0.6, 0.0]) add(CYL, S.x - 0.5, SY + 0.53, S.z + dz, thatch, thatchD, 0, 0, 0, Math.PI / 2, 0.17, 0.5, 0.17);   // straw bales (tawara)
  // tools leaning on the south wall outside: two hoes and a rake
  for (const [i, kind] of [[0, 'hoe'], [1, 'hoe'], [2, 'rake']] as [number, string][]) {
    const x = S.x + 0.55 - i * 0.42, z = S.z - 1.62, y = gy(x, z), hx = x - 0.08, hz = S.z - 1.33, hy = y + 1.45;
    rod(x, y, z, hx, hy, hz, 0.016, C(0x8e7048), 6);
    if (kind === 'hoe') box(x, y, z - 0.08, 0.16, 0.22, 0.012, C(0x45464a), 0, 0.25);
    else { box(x, y + 0.02, z - 0.02, 0.4, 0.03, 0.04, C(0x6e5438)); for (let k = 0; k < 7; k++) box(x - 0.18 + k * 0.06, y - 0.04, z - 0.04, 0.012, 0.07, 0.012, C(0x6e5438)); }
  }
  // the rain barrel under the eave, fed by a bamboo downspout, hooped; pails beside it, a watering pail and ladle by the gate
  { const b = FARM.barrel, y = gy(b.x, b.z); add(CYL, b.x, y, b.z, C(0x7a5c3c), C(0x8a6a46), 0, 0, 0, 0, 0.3, 0.78, 0.3);
    for (const h of [0.12, 0.62]) add(HOOP, b.x, y + h, b.z, C(0x2a2622), C(0x2a2622), 0, 0, 0, 0, 0.307, 0.05, 0.307);
    add(DISC, b.x, y + 0.72, b.z, C(0x3c4c50), C(0x3c4c50), 0, 0, 0, 0, 0.28, 1, 0.28);
    rod(S.x + 1.15, SY + 1.72, S.z - 1.4, b.x, y + 0.86, b.z, 0.03, bamboo, 6); }
  pail(-27.85, 35.95, false); pail(-27.55, 35.7, true); pail(-25.75, 36.85, true);
  { const x = -25.75, z = 36.85, y = gy(x, z); rod(x - 0.05, y + 0.18, z, x + 0.2, y + 0.62, z + 0.12, 0.009, C(0xb89a6a), 5); }
  // baskets of picked vegetables at the shed's front
  const basket = (x: number, z: number, veg: number[]) => { const y = gy(x, z); add(CONE, x, y + 0.2, z, C(0xa88a52), C(0x8e7240), 0, 0, Math.PI, 0, 0.17, 0.2, 0.17); add(DISC, x, y + 0.02, z, C(0x8e7240), C(0x8e7240), 0, 0, 0, 0, 0.11, 1, 0.11);
    for (let k = 0; k < veg.length; k++) { const a = k * 2.1 + rnd(); add(ICO, x + Math.cos(a) * 0.07, y + 0.18, z + Math.sin(a) * 0.07, C(veg[k]), C(veg[k]), 0, a, 0.3, 1.2, 0.05, veg[k] === 0xe6e8dc ? 0.15 : 0.07, 0.05); } };
  basket(-27.15, 39.75, [0xe6e8dc, 0xe6e8dc, 0x3d6526, 0xe6e8dc]); basket(-27.35, 40.2, [0x2a1530, 0x2a1530, 0xb6d08a, 0x2a1530]);
  // the stump to rest on (its top at the sit clip's seat height)
  { const s = FARM.stump, y = gy(s.x, s.z); add(CYL, s.x, y - 0.05, s.z, C(0x5a4430), C(0x6e5438), 0, 0, 0, 0, 0.22, 0.45, 0.22); add(DISC, s.x, y + 0.401, s.z, C(0xb89a6a), C(0xb89a6a), 0, 0, 0, 0, 0.2, 1, 0.2);
    add(CONE, s.x, y - 0.02, s.z, C(0x5a4430), C(0x5a4430), 0, 0, Math.PI, 0, 0.3, 0.16, 0.3);
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.2, 0.22).setTranslation(s.x, y + 0.2, s.z), fixed()); }
  // the hazakake: a bamboo drying rack, rice sheaves astride the top pole, pairs of daikon hung below
  const HZ = { x0: -27.6, x1: -24.4, z: 32.7 };
  { const ys = [gy(HZ.x0, HZ.z), gy(HZ.x1, HZ.z)];
    for (const [x, y] of [[HZ.x0, ys[0]], [(HZ.x0 + HZ.x1) / 2, (ys[0] + ys[1]) / 2], [HZ.x1, ys[1]]]) for (const s of [-1, 1]) rod(x, y - 0.1, HZ.z + s * 0.35, x, y + 1.45, HZ.z - s * 0.05, 0.02, C(0x7c6a40), 6);
    rod(HZ.x0 - 0.2, ys[0] + 1.32, HZ.z, HZ.x1 + 0.2, ys[1] + 1.32, HZ.z, 0.022, C(0x8a7a48), 6); rod(HZ.x0, ys[0] + 0.85, HZ.z, HZ.x1, ys[1] + 0.85, HZ.z, 0.018, C(0x8a7a48), 6);
    for (let x = HZ.x0 + 0.18; x < HZ.x1 - 0.1; x += 0.27) { const y = ys[0] + (ys[1] - ys[0]) * (x - HZ.x0) / (HZ.x1 - HZ.x0) + 1.32;
      for (const s of [-1, 1]) box(x, y - 0.46, HZ.z + s * 0.07, 0.09, 0.48, 0.06, C(0xb0904a), 0, -s * 0.2, 0, C(0xd2b56e)); }
    if (!low) for (let x = HZ.x0 + 0.3; x < HZ.x1 - 0.2; x += 0.36) { const y = ys[0] + (ys[1] - ys[0]) * (x - HZ.x0) / (HZ.x1 - HZ.x0) + 0.85;
      for (const s of [-1, 1]) { add(ICO, x + s * 0.05, y - 0.22, HZ.z, C(0xe6e8dc), C(0xd8dccc), 0.15, 0, 0, s * 0.1, 0.035, 0.17, 0.035); add(ICO, x + s * 0.05, y - 0.02, HZ.z, C(0x5f7a38), C(0x5f7a38), 0.15, 0, 0, 0, 0.05, 0.07, 0.05); } }
    world.createCollider(RAPIER.ColliderDesc.cuboid((HZ.x1 - HZ.x0) / 2 + 0.1, 0.75, 0.3).setTranslation((HZ.x0 + HZ.x1) / 2, (ys[0] + ys[1]) / 2 + 0.7, HZ.z), fixed()); }
  // a two-wheeled cart (daihachi-guruma) resting on its handles behind the shed, a bale on it
  { const x = -29.0, z = 40.95, y = gy(x, z), r = 0.42, tilt = 0.18, cw = C(0x7a6040);
    box(x, y + r - 0.02, z, 1.5, 0.05, 0.8, cw, 0, 0, -tilt); for (const s of [-1, 1]) box(x, y + r + 0.02, z + s * 0.4, 1.5, 0.1, 0.04, C(0x5e4a32), 0, 0, -tilt);
    for (const s of [-1, 1]) { add(CYL, x - 0.15, y + r, z + s * 0.5, C(0x4e3c2a), C(0x4e3c2a), 0, 0, Math.PI / 2, 0, r, 0.05, r);
      for (let k = 0; k < 4; k++) rod(x - 0.15 - Math.cos(k * 0.785) * r * 0.95, y + r - Math.sin(k * 0.785) * r * 0.95, z + s * 0.53, x - 0.15 + Math.cos(k * 0.785) * r * 0.95, y + r + Math.sin(k * 0.785) * r * 0.95, z + s * 0.53, 0.012, C(0x8a7050), 4); }
    rod(x - 0.15, y + r, z - 0.6, x - 0.15, y + r, z + 0.6, 0.025, C(0x3a3a3a), 6);
    for (const s of [-1, 1]) rod(x + 0.6, y + r - 0.12, z + s * 0.35, x + 1.6, gy(x + 1.6, z) + 0.04, z + s * 0.3, 0.02, cw, 6);
    rod(x + 1.5, gy(x + 1.5, z) + 0.06, z - 0.32, x + 1.5, gy(x + 1.5, z) + 0.06, z + 0.32, 0.02, cw, 6);
    add(CYL, x - 0.25, y + r + 0.22, z, thatch, thatchD, 0, 0, 0, Math.PI / 2 + tilt, 0.2, 0.62, 0.2);
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.1, 0.5, 0.6).setTranslation(x + 0.35, y + 0.5, z), fixed()); }

  // ------------------------------------------------------------ the mesh: one draw, the plants swaying
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1)); geo.computeBoundingSphere();
  const time = { value: 0 }, mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSway; uniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
float ph = uTime * 1.7 + position.x * 0.7 + position.z * 0.45;                      // (the mesh sits at the origin: position is the world's)
transformed.xz += aSway * vec2(sin(ph) + 0.5 * sin(ph * 2.3 + 1.7), 0.6 * cos(ph * 1.3)) * 0.035;`);
  };
  mat.customProgramCacheKey = () => 'farm-sway';
  const mesh = new THREE.Mesh(geo, mat); mesh.receiveShadow = !low; scene.add(mesh);

  // the paddy's water: still, with a breath of wind on it, muddy-green underneath, the sky on it at a slant; the trickle from the pipe
  const wv: number[] = [], wf: number[] = [], e = 0.05;
  for (const [x, z] of [[-P.hx - e, -P.hz - e], [P.hx + e, -P.hz - e], [P.hx + e, P.hz + e], [-P.hx - e, -P.hz - e], [P.hx + e, P.hz + e], [-P.hx - e, P.hz + e]]) { wv.push(P.x + x, WY, P.z + z); wf.push(0); }
  for (const s of [-1, 1]) for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]]) {
    const x = IN.x1 - 0.02 - 0.05 * v * v, y = inY1 - 0.02 + (WY - inY1 + 0.02) * v; wv.push(x + (s > 0 ? 0 : u * 0.022), y, IN.z + (s > 0 ? u * 0.022 : 0)); wf.push(1);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3)); wg.setAttribute('aFall', new THREE.Float32BufferAttribute(wf, 1));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute(wv.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  wm.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFall; varying float vFall; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = position; vFall = aFall;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; varying float vFall; varying vec3 vWP;
float fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(fh(i), fh(i + vec2(1, 0)), f.x), mix(fh(i + vec2(0, 1)), fh(i + vec2(1, 1)), f.x), f.y); }
float fw(vec2 p) { return fn(p * 2.2 + uTime * vec2(0.12, 0.07)) * 0.6 + fn(p * 5.1 - uTime * vec2(0.09, 0.15)) * 0.4; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (vFall < 0.5) { vec2 g = vec2(fw(vWP.xz + vec2(0.05, 0.0)) - fw(vWP.xz - vec2(0.05, 0.0)), fw(vWP.xz + vec2(0.0, 0.05)) - fw(vWP.xz - vec2(0.0, 0.05))) * 10.0;
  float rip = 0.5 + 0.5 * sin(length(vWP.xz - vec2(${IN.x1.toFixed(2)}, ${IN.z.toFixed(2)})) * 22.0 - uTime * 6.0);   // rings round the trickle
  g += rip * 0.6 * exp(-length(vWP.xz - vec2(${IN.x1.toFixed(2)}, ${IN.z.toFixed(2)})) * 2.5);
  normal = normalize((viewMatrix * vec4(normalize(vec3(-g.x * 0.06, 1.0, -g.y * 0.06)), 0.0)).xyz); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
diffuseColor.rgb = vFall > 0.5 ? vec3(0.75, 0.82, 0.84) : vec3(0.075, 0.09, 0.05);
vec3 vdir = normalize(cameraPosition - vWP); float fres = pow(1.0 - clamp(abs(vdir.y), 0.0, 1.0), 4.0);
diffuseColor.a = vFall > 0.5 ? 0.35 + 0.4 * step(0.5, fract(vWP.y * 9.0 + uTime * 5.0)) : clamp(0.6 + fres * 0.38, 0.0, 0.96);`);
  };
  wm.customProgramCacheKey = () => 'farm-water';
  const water = new THREE.Mesh(wg, wm); water.renderOrder = 1; scene.add(water);

  // ------------------------------------------------------------ colliders: bunds (stepped onto), fence, shed, barrel
  const cub = (x: number, y: number, z: number, hx: number, hy: number, hz: number) => world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z), fixed());
  for (const s of [-1, 1]) { cub(P.x, Y0 + 0.12, P.z + s * (P.hz + 0.25), P.hx + 0.5, 0.12, 0.22); cub(P.x + s * (P.hx + 0.25), Y0 + 0.12, P.z, 0.22, 0.12, P.hz + 0.25); }
  const wall = (x0: number, z0: number, x1: number, z1: number) => { const y = (gy(x0, z0) + gy(x1, z1)) / 2, dy = Math.abs(gy(x0, z0) - gy(x1, z1));
    cub((x0 + x1) / 2, y + 0.3, (z0 + z1) / 2, Math.max(0.05, Math.abs(x1 - x0) / 2), 0.4 + dy / 2, Math.max(0.05, Math.abs(z1 - z0) / 2)); };
  wall(F.x0, F.z1, F.x1, F.z1); wall(F.x0, F.z0, F.x1, F.z0); wall(F.x1, F.z0, F.x1, F.z1); wall(F.x0, F.z0, F.x0, F.gate[0]); wall(F.x0, F.gate[1], F.x0, F.z1);
  cub(S.x, SY + 1.1, S.z, 0.95, 1.1, 1.35);
  world.createCollider(RAPIER.ColliderDesc.cylinder(0.4, 0.32).setTranslation(FARM.barrel.x, gy(FARM.barrel.x, FARM.barrel.z) + 0.4, FARM.barrel.z), fixed());

  let shade = false;
  return {
    tris: (pos.length + wv.length) / 9,
    /** the plants' sway and the water's breath; the farm casts shadows only while the ronin is near */
    update(now: number, player: THREE.Vector3) {
      time.value = now;
      const near = !low && Math.hypot(player.x - P.x, player.z - (P.z + 4)) < 32; if (near !== shade) { shade = near; mesh.castShadow = near; }
    },
  };
}
