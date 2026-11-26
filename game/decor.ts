import * as THREE from 'three';
import type { Island } from './island';
import { insideEdge, type Terrain } from './terrain';
import { CAST } from './npcs';
import { marketStalls, decorTime, type Kit } from './market';

// A lived-in Edo street: barrels, rain tubs, crates, rice bales, baskets, jars, firewood, potted pines, laundry poles
// and hanging shop signs set round every house and stall (prefabs from village.glb; village.ts merges them with the
// buildings, so they cost no extra draw calls). Each building offers slots in its own frame (x right, z forward = its
// front); a slot is used only where the ground is flat and it keeps clear of paths, the stream, doorways, other
// buildings, villagers, posters and everything you can sit at, read or ring. Also here: washing lines strung between
// neighbouring houses (their cloth goes into market.ts's swaying mesh) and the smoke off the cooking stoves.

export type Place = { id: string; x: number; z: number; yaw: number; y?: number };
type Slot = [number, number, number, string[]];

/** footprint radius and height of each prop */
const SIZE: Record<string, [number, number]> = {
  barrel: [0.38, 0.7], rain_barrel: [0.6, 1.6], crates: [0.7, 1.1], bales: [0.6, 1.0], baskets: [0.85, 0.6], pots: [0.6, 0.8], firewood: [0.85, 1.2],
  bonsai: [0.4, 1.2], potted_pine: [0.45, 1.6], laundry: [1.3, 2.0], bucket: [0.22, 0.3],   // laundry: a thin line, checked as a disc
  veg: [0.5, 0.5], drying: [0.9, 0.75], woodpile: [0.7, 0.85], stove: [0.45, 0.95], planter: [0.45, 1.0], bench: [0.9, 0.5],
};
const Q = Math.PI / 2;

/** house slots for a house W wide and D deep: by the door, the front corners, the sides, round the back */
const houseSlots = (W: number, D: number): Slot[] => [
  [-(W / 2 - 0.9), D / 2 + 0.55, 0, ['potted_pine', 'planter', 'barrel', 'baskets', 'pots']], [W / 2 - 0.9, D / 2 + 0.55, 0, ['baskets', 'planter', 'pots', 'barrel', 'potted_pine']],
  [-1.5, D / 2 + 0.45, 0, ['bonsai', 'veg', 'bucket', 'pots']], [1.5, D / 2 + 0.45, 0, ['veg', 'bucket', 'bonsai']],
  [W / 2 + 0.6, D / 2 - 2.6, Q, ['stove', 'veg']], [-(W / 2 + 0.6), D / 2 - 2.6, -Q, ['stove', 'drying']],   // by the kitchen side
  [W / 2 + 0.85, D / 2 - 1.0, Q, ['rain_barrel', 'bales', 'barrel']], [-(W / 2 + 0.85), D / 2 - 1.0, -Q, ['rain_barrel', 'crates', 'barrel']],
  [W / 2 + 0.55, -0.9, Q, ['firewood', 'crates']], [-(W / 2 + 0.55), -0.9, -Q, ['firewood', 'bales']], [W / 2 + 1.7, -1.2, Q, ['laundry']], [-(W / 2 + 1.7), -1.2, -Q, ['laundry']],
  [-1.4, -(D / 2 + 0.75), Math.PI, ['woodpile', 'crates', 'bales', 'pots']], [1.4, -(D / 2 + 0.75), Math.PI, ['pots', 'woodpile', 'barrel']], [0.4, -(D / 2 + 2.2), Math.PI, ['laundry', 'drying']],
];
/** around the stalls (their wares are prefabs of their own, placed with the stall) */
const STALLS: Record<string, Slot[]> = {
  // (clear of the shops' own displays, benches, planters, awning poles and letter rack: village_build.py more_*)
  post: [[2.85, 0.4, Q, ['crates', 'bales']], [-2.85, 0.6, -Q, ['bales', 'barrel']], [2.8, 2.3, 0, ['planter', 'barrel']], [-2.85, 2.6, 0, ['bench', 'planter']]],
  workshop: [[2.85, 0.4, Q, ['crates']], [-2.75, -1.6, -Q, ['bales']]],
  smithy: [[3.5, 0.5, Q, ['rain_barrel']], [-3.5, -0.3, -Q, ['firewood']], [3.4, -1.6, Q, ['bales']], [-3.3, 1.9, 0, ['crates']]],
  teahouse: [[4.1, 3.4, 0, ['potted_pine']], [-4.1, 3.4, 0, ['potted_pine']], [4.2, 0, Q, ['rain_barrel']], [-4.1, -0.6, -Q, ['bales', 'crates']], [1.5, -3.1, Math.PI, ['crates', 'pots']], [-1.6, -3.0, Math.PI, ['firewood']]],
  storyteller: [[0.6, -3.0, 0.5, ['firewood']]],                                 // off the path, clear of the fire and the banner
};
const POSTER_HOUSES = [0, 4, 1, 2, 3, 5];                                         // as in boards.ts: these have a poster on the south side wall

export function decorPlaces(t: Terrain, I: Island): Place[] {
  let sd = 9; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const S = I.spots, out: Place[] = [], placed: [number, number, number][] = [];
  const frame = (s: { x: number; z: number; yaw: number }, lx: number, lz: number): [number, number] =>
    [s.x + lx * Math.cos(s.yaw) + lz * Math.sin(s.yaw), s.z - lx * Math.sin(s.yaw) + lz * Math.cos(s.yaw)];
  // keep-outs: [x, z, radius, the building they belong to (its own props may stand inside them)]
  const keep: [number, number, number, string?][] = [];
  for (const [k, r] of [['torii', 3], ['post', 3.3], ['workshop', 3.3], ['smithy', 3.8], ['teahouse', 5.2], ['pagoda', 6.5], ['gate', 6], ['castle', 13], ['sakura', 3.2]] as const) keep.push([S[k].x, S[k].z, r, k]);
  for (const [k, r] of [['lantern', 0.9], ['pine', 1.6], ['footbridge', 3.6], ['arched_bridge', 5], ['firepit', 1.7], ['bench', 1.9]] as const) for (const [x, z] of I.props[k]) keep.push([x, z, r]);
  const [px, pz] = I.props.pier[0]; for (let k = 0; k <= 12; k += 2) keep.push([px, pz - k, 2.0, 'pier']);               // the dock (it runs south)
  const rel = (s: { x: number; z: number; yaw: number }, fw: number, sd2: number) => [s.x + Math.sin(s.yaw) * fw + Math.cos(s.yaw) * sd2, s.z + Math.cos(s.yaw) * fw - Math.sin(s.yaw) * sd2];
  const fire = I.props.firepit[0];                                                 // nobori banners (boards.ts)
  for (const [x, z] of [[3.6, -48.5], [-3.6, -48.5], rel(S.teahouse, 5.5, -3.2), rel(S.smithy, 3.2, -2.8), rel(S.post, 3.5, 2.4), rel(S.pagoda, 5.6, 3.2), [fire[0] + 4.7, fire[1] - 3.9]]) keep.push([x, z, 0.7]);
  keep.push([S.square.x + 6.5, S.square.z - 1, 2.6]);                             // the notice board
  for (const st of marketStalls(I, t)) keep.push([st.x, st.z, 1.8], [st.vendor.x, st.vendor.z, 0.8]);   // the market corner
  const T = S.teahouse, C = S.castle; keep.push([T.x + Math.sin(T.yaw) * 4, T.z + Math.cos(T.yaw) * 4, 1.6], [C.x + Math.sin(C.yaw) * 8.5, C.z + Math.cos(C.yaw) * 8.5, 2.6]);   // veranda seat, castle lookout
  for (const v of CAST) {                                                          // villagers where they stand or sit (and Yuki's music board)
    if (v.spot === 'shrine') continue;
    const s = S[v.spot], [x, z] = frame(s, v.at[0], v.at[1]); keep.push([x, z, 1.3]);
    if (v.id === 'yuki') { const sak = S.sakura, rx = Math.cos(s.yaw), rz = -Math.sin(s.yaw), k = (x + rx - sak.x) ** 2 + (z + rz - sak.z) ** 2 > (x - rx - sak.x) ** 2 + (z - rz - sak.z) ** 2 ? 1 : -1; keep.push([x + k * rx * 1.9, z + k * rz * 1.9, 2.0]); }
  }
  const segDist = (pts: number[][], x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - ax - u * dx, z - az - u * dz));
    }
    return d;
  };
  /** is the prop free to stand here? returns its height, or null */
  const fits = (id: string, x: number, z: number, own: number[][], owner: string) => {
    const [r] = SIZE[id], hs = [t.heightAt(x, z)];
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; hs.push(t.heightAt(qx, qz)); if (!insideEdge(I.outline, x + Math.cos(a) * (r + 1.2), z + Math.sin(a) * (r + 1.2))) return null; }
    if (Math.max(...hs) - Math.min(...hs) > (id === 'laundry' ? 0.6 : 0.3)) return null;                // (the laundry only stands on its two stakes)
    if (I.paths.some((p) => segDist(p, x, z) < 1.9 + r * 0.6) || segDist(I.stream, x, z) < 2.1 + r) return null;
    if (keep.some(([kx, kz, kr, ko]) => ko !== owner && Math.hypot(x - kx, z - kz) < kr + r) || placed.some(([qx, qz, qr]) => Math.hypot(x - qx, z - qz) < qr + r)) return null;
    if (own.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 5.4 + r)) return null;               // other houses
    return Math.min(...hs) - 0.02;
  };
  const put = (s: { x: number; z: number; yaw: number }, slots: Slot[], own: number[][], owner: string, skip: (lx: number, lz: number, id: string) => boolean, max: number) => {
    let n = 0;
    for (const [lx, lz, yw, ids] of [...slots].sort(() => rnd() - 0.5)) {
      if (n >= max || rnd() < 0.2) continue;
      const k0 = Math.floor(rnd() * ids.length);
      for (let k = 0; k < ids.length; k++) {
        const id = ids[(k0 + k) % ids.length]; if (skip(lx, lz, id)) continue;
        const [x, z] = frame(s, lx, lz), y = fits(id, x, z, own, owner); if (y === null) continue;
        out.push({ id, x, z, yaw: s.yaw + yw + (id === 'barrel' || id === 'pots' || id === 'baskets' ? rnd() * 6.28 : (rnd() - 0.5) * 0.12), y }); placed.push([x, z, SIZE[id][0]]); n++; break;
      }
    }
  };
  const lines = washLines(t, I), under = (x: number, z: number) => lines.some(([a, b]) => segDist([[a.x, a.z], [b.x, b.z]], x, z) < 2.4);
  I.houses.forEach(([hx, hz, hyaw], i) => {
    const [W, D] = i % 2 ? [8, 7] : [7, 8], s = { x: hx, z: hz, yaw: hyaw }, others = I.houses.filter((_, j) => j !== i);
    const side = Math.sin(hyaw) >= 0 ? 1 : -1, poster = POSTER_HOUSES.includes(i);
    put(s, houseSlots(W, D), others, '', (lx, lz, id) => (poster && Math.sign(lx) === side && Math.abs(lx) > W / 2 && lz > D / 2 - 2.6 && SIZE[id][1] > 0.8) ||
      (id === 'laundry' && (out.some((o) => o.id === 'laundry' && Math.hypot(o.x - hx, o.z - hz) < 9) || under(...frame(s, lx, lz)))) ||
      (id === 'stove' && out.filter((o) => o.id === 'stove').length >= 4) || (id === 'drying' && out.filter((o) => o.id === 'drying').length >= 3), 8);
    const sign = rnd(); if (sign < 0.8) {                                         // a hanging sign off one front corner post (its outer half: clear of the lantern)
      const sx = rnd() < 0.5 ? -1 : 1, [x, z] = frame(s, sx * (W / 2 - 0.12), D / 2 - 0.07);
      out.push({ id: sign < 0.55 ? 'sign' : 'sugidama', x, z, yaw: hyaw, y: t.heightAt(hx, hz) - 0.05 });
    }
  });
  const houses = I.houses.map(([x, z]) => [x, z]);
  for (const [k, slots] of Object.entries(STALLS)) put(S[k], slots, houses, k, () => false, 9);
  put({ x: px, z: pz, yaw: I.props.pier[0][2] }, [[2.8, -4.0, 0, ['crates', 'bales']], [-2.9, -4.4, 0, ['bales', 'barrel']], [-3.0, -3.0, 0, ['barrel']]], houses, 'pier', () => false, 3);   // cargo for the sky-boat
  return out;
}

/** washing lines between neighbouring houses that stand side by side (same facing, 9-15 m apart along their fronts): a
 * rope from wall to wall at 2.55 m behind the middle of each, unless a path runs under it */
export function washLines(t: Terrain, I: Island) {
  const out: [THREE.Vector3, THREE.Vector3][] = [];
  const at = (x: number, z: number, yaw: number, lx: number, lz: number) => new THREE.Vector3(x + lx * Math.cos(yaw) + lz * Math.sin(yaw), t.heightAt(x, z) + 2.5, z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
  I.houses.forEach(([ax, az, ay], i) => I.houses.forEach(([bx, bz, by], j) => {
    if (j <= i || Math.abs(ay - by) > 0.05) return;
    const dx = bx - ax, dz = bz - az, lx = dx * Math.cos(ay) - dz * Math.sin(ay), lz = dx * Math.sin(ay) + dz * Math.cos(ay);
    if (Math.abs(lz) > 2.5 || Math.abs(lx) < 9 || Math.abs(lx) > 15) return;
    const sg = Math.sign(lx), a = at(ax, az, ay, sg * ((i % 2 ? 4 : 3.5) - 0.18), -1), b = at(bx, bz, ay, -sg * ((j % 2 ? 4 : 3.5) - 0.18), -1);
    for (let k = 0; k <= 8; k++) {
      const p = a.clone().lerp(b, k / 8);
      if (I.paths.some((pa) => pa.some(([x, z], n) => n > 0 && segTo(pa[n - 1], [x, z], p.x, p.z) < 1.6))) return;
    }
    out.push([a, b]);
  }));
  return out;
}
const segTo = ([ax, az]: number[], [bx, bz]: number[], x: number, z: number) => {
  const dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - u * dx, z - az - u * dz);
};

/** the washing on the lines: a sagging rope, then towels, tenugui, a kimono through its sleeves... pegged along it, swaying */
export function decorDressing(k: Kit, t: Terrain, I: Island) {
  const sizes = [[0.42, 0.62], [0.32, 0.8], [1.1, 0.0], [0.5, 0.55], [0.36, 0.7], [0.6, 0.45]];
  for (const [a, b] of washLines(t, I)) {
    const L = a.distanceTo(b), d = b.clone().sub(a).normalize(), n = new THREE.Vector3(-d.z, 0, d.x), yaw = Math.atan2(d.x, d.z) - Math.PI / 2;
    const p = (s: number) => a.clone().lerp(b, s).add(new THREE.Vector3(0, -0.35 * 4 * s * (1 - s), 0));   // sag 35 cm in the middle
    for (let i = 0; i < 8; i++) k.rod(p(i / 8), p((i + 1) / 8), 0.008, 'rope', 3);
    let s = 0.1 / L * 6, j = Math.floor(L * 7) % 6;
    while (s < 0.9) {
      const [w, h] = sizes[j % 6], half = w / 2 / L; if (s + 2 * half > 0.92) break;
      const c = p(s + half), top = c.y - 0.01, sw = { top, dir: n.clone().multiplyScalar(0.16), phase: s * 9 };
      const m = (y: number) => new THREE.Matrix4().compose(c.clone().setY(y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      if (h === 0) {                                                               // a kimono hung through its sleeves on the rope
        k.put(new THREE.PlaneGeometry(w, 0.32, 2, 1), k.R.laundry(j % 2 ? 3 : 0), m(top - 0.16), sw);
        k.put(new THREE.PlaneGeometry(0.5, 0.85, 1, 3), k.R.laundry(j % 2 ? 3 : 0), m(top - 0.32 - 0.42), sw);
      } else k.put(new THREE.PlaneGeometry(w, h, 1, 3), k.R.laundry(j % 6), m(top - h / 2), sw);
      for (const e of [-1, 1]) k.rod(c.clone().addScaledVector(d, e * (w / 2 - 0.04)).setY(top + 0.03), c.clone().addScaledVector(d, e * (w / 2 - 0.04)).setY(top - 0.05), 0.012, 'bamboo', 4);   // pegs
      s += 2 * half + 0.14 / L; j++;
    }
  }
}

/** smoke off the cooking stoves and the sweet stall's grill: soft puffs that rise, drift and fade, moved entirely in
 * the vertex shader (one draw, nothing to update per frame) */
export function cookSmoke(scene: THREE.Scene, t: Terrain, I: Island, places: Place[], low: boolean) {
  const src = places.filter((p) => p.id === 'stove').map((p) => new THREE.Vector3(p.x, (p.y ?? t.heightAt(p.x, p.z)) + 0.95, p.z));
  for (const st of marketStalls(I, t)) if (st.id === 'sweets') src.push(new THREE.Vector3(st.x + 0.58 * Math.cos(st.yaw) + 0.22 * Math.sin(st.yaw), t.heightAt(st.x, st.z) + 1.0, st.z - 0.58 * Math.sin(st.yaw) + 0.22 * Math.cos(st.yaw)));
  const per = low ? 5 : 10, n = src.length * per, pos = new Float32Array(n * 3), seed = new Float32Array(n);
  src.forEach((p, i) => { for (let j = 0; j < per; j++) { pos.set([p.x, p.y, p.z], (i * per + j) * 3); seed[i * per + j] = j / per + i * 0.37; } });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uT = decorTime, mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 600 } }]), fog: true, transparent: true, depthWrite: false,
    vertexShader: `attribute float aSeed; uniform float uT, uScale; varying float vA;
#include <fog_pars_vertex>
void main() { float l = fract(uT * 0.14 + aSeed);
  vec3 p = position + vec3(sin(aSeed * 41.0 + uT * 0.6) * 0.3 * l + l * 0.5, l * 2.8, cos(aSeed * 29.0 + uT * 0.5) * 0.3 * l + l * 0.35);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (0.15 + l * 0.85) * uScale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition; vA = 0.28 * sin(l * 3.1416);
#include <fog_vertex>
}`,
    fragmentShader: `varying float vA;
#include <fog_pars_fragment>
void main() { float f = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); if (f * vA < 0.01) discard; gl_FragColor = vec4(0.86, 0.84, 0.82, f * vA);
#include <fog_fragment>
}`,
  });
  mat.uniforms.uT = uT;
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
}
