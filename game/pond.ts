import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Island } from './island';
import type { Terrain } from './terrain';

/** a weathered stone: a smooth lump (shared vertices, so it shades round, not faceted), squashed flatter at the base,
 * with a few broad bulges and softer knobbles; rotate and stretch each instance for variety */
const tmp = new THREE.Vector3(), CUTS = [[0.6, 0.55, 0.58, 0.72], [-0.7, 0.3, 0.2, 0.78], [0.1, 0.4, -0.9, 0.8], [-0.3, 0.9, -0.3, 0.74]].map(([x, y, z, c]) => { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l, c]; });
export function stoneGeometry(seed = 1, detail = 2) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(1, detail).deleteAttribute('normal').deleteAttribute('uv')), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const r = 1 + 0.16 * Math.sin(v.x * 2.1 + seed) * Math.cos(v.z * 1.7 - seed) + 0.09 * Math.sin(v.y * 3.9 + v.x * 2.7 + seed * 2) + 0.04 * Math.sin(v.z * 7.3 + v.y * 5.1);
    v.multiplyScalar(r); if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.35;                // sits on a broad, flat-ish base
    for (const [nx, ny, nz, c] of CUTS) { const dd = v.x * nx + v.y * ny + v.z * nz - c; if (dd > 0) v.addScaledVector(tmp.set(nx, ny, nz), -dd * 0.85); }   // a few broken faces
    p.setXYZ(i, v.x, v.y * 0.72, v.z);
  }
  g.computeVertexNormals(); return g;
}

/** The koi pond as a garden pond, the spring and the stream's banks: natural stones round the shore (a few half in the
 * water, gaps where the stream comes in and goes out and where paths reach the bank), pebbly stones along the stream,
 * a little rock outcrop the spring rises from, and reeds and irises at the water's edge. The pond's deep middle gets
 * an invisible wall: you can wade the shallow margin, not swim. */
export function dressPond(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, rock: THREE.Material, low: boolean) {
  let sd = 5; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const P = I.spots.pond, pondY = P.y + 0.95, PS = I.pond ?? { r: 5.9, waves: [], zs: 1.35, y: pondY };
  const R = (a: number) => PS.r + PS.waves.reduce((s, [am, k, ph]) => s + am * Math.sin(k * a + ph), 0);
  // angles round the pond are the layout's (make_island.py's shore waves use them); the game mirrors x
  const onShore = (a: number, f: number) => [P.x - Math.cos(a) * R(a) * f * PS.zs, P.z + Math.sin(a) * R(a) * f] as const;
  const angle = ([x, z]: readonly number[]) => Math.atan2(z - P.z, -(x - P.x) / PS.zs);
  const k = I.stream.findIndex(([x, z]) => x === P.x && z === P.z), inlet = angle(I.stream[k - 1]), outlet = angle(I.stream[k + 1]);
  const clear = (a: number, w: number) => [inlet, outlet].every((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) > w);
  const segD = (pl: number[][], x: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < pl.length - 1; i++) {
      const [ax, az] = pl[i], ex = pl[i + 1][0] - ax, ez = pl[i + 1][1] - az, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1)));
      d = Math.min(d, Math.hypot(ax + ex * u - x, az + ez * u - z));
    }
    return d;
  };
  const AB = I.props.arched_bridge[0], FB = I.props.footbridge[0];
  const walkable = (x: number, z: number) => I.paths.some((p) => segD(p, x, z) < 2.4) || Math.hypot(x - AB[0], z - AB[1]) < 5 || Math.hypot(x - FB[0], z - FB[1]) < 3.8;

  const mats: THREE.Matrix4[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), solid = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const put = (x: number, y: number, z: number, s: number, flat = 1, collide = false) => {
    mats.push(m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.35, r() * 6.28, (r() - 0.5) * 0.35)), new THREE.Vector3(s * (1 + r() * 0.5), s * flat * (0.8 + r() * 0.4), s * (1 + r() * 0.4))).clone());
    if (collide) world.createCollider(RAPIER.ColliderDesc.ball(s * 0.85).setTranslation(x, y + s * 0.1, z), solid);
  };
  // the shore: clusters of stones, a big one with a few small ones tucked round it, half of them wetted by the water
  for (let a = 0; a < Math.PI * 2; a += 0.22 + r() * 0.35) {
    if (!clear(a, 0.45)) continue;
    const big = r() < 0.4, f = big ? 0.98 + r() * 0.1 : 0.94 + r() * 0.16, [x, z] = onShore(a, f); if (walkable(x, z)) continue;
    put(x, pondY - 0.12 + r() * 0.1, z, big ? 0.45 + r() * 0.35 : 0.18 + r() * 0.16);
    for (let j = 0; j < (big ? 3 : 1); j++) { const [x2, z2] = onShore(a + (r() - 0.5) * 0.18, f + (r() - 0.4) * 0.12); put(x2, pondY - 0.1, z2, 0.1 + r() * 0.14); }
  }
  // the stream's banks: stones on the shoreline the water grid gives (where the wet cells meet the dry), here and there
  const { n, size, h, w } = t, cell = size / (n - 1);
  for (let tries = 0, placed = 0; tries < 9000 && placed < (low ? 40 : 80); tries++) {
    const kk = Math.floor(r() * n * n); if (w[kk] !== w[kk] || w[kk] - h[kk] > 0.12 || w[kk] - h[kk] < -0.08) continue;
    const x = -size / 2 + (kk % n) * cell + (r() - 0.5) * cell, z = -size / 2 + Math.floor(kk / n) * cell + (r() - 0.5) * cell;
    if (Math.hypot((x - P.x) / PS.zs, z - P.z) < R(0) + 2.5 || walkable(x, z)) continue;
    put(x, t.heightAt(x, z) - 0.05, z, r() < 0.25 ? 0.3 + r() * 0.25 : 0.1 + r() * 0.12); placed++;
  }
  // the spring: a little outcrop on its uphill side, mossy, the water welling up at its foot
  if (I.spring) {
    const [sx, sz, sr] = I.spring, [ax, az] = I.stream[1], away = Math.atan2(sz - az, sx - ax);     // facing away from where the water runs
    for (let i = 0; i < 9; i++) {
      const a = away + (r() - 0.5) * 2.4, d = sr + 0.2 + r() * 0.9, x = sx + Math.cos(a) * d, z = sz + Math.sin(a) * d, s = i < 3 ? 0.7 + r() * 0.45 : 0.22 + r() * 0.3;
      put(x, t.heightAt(x, z) - 0.15, z, s, 1.1, s > 0.6);
    }
  }
  const stones = new THREE.InstancedMesh(stoneGeometry(3), rock, mats.length); mats.forEach((mm, i) => stones.setMatrixAt(i, mm));
  stones.receiveShadow = true; stones.castShadow = !low; stones.computeBoundingSphere(); scene.add(stones);

  // the pond's deep middle: one convex wall from the bed to a little above the water, where it's deeper than the knee
  const deep: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const kk = i * n + j; if (w[kk] !== w[kk] || w[kk] - h[kk] < 0.62) continue;
    const x = -size / 2 + j * cell, z = -size / 2 + i * cell; if (Math.hypot((x - P.x) / PS.zs, z - P.z) > R(0) + 1) continue;
    deep.push(x, h[kk] - 0.3, z, x, w[kk] + 1.3, z);
  }
  const hull = deep.length >= 24 ? RAPIER.ColliderDesc.convexHull(new Float32Array(deep)) : null;
  if (hull) world.createCollider(hull, solid);

  // reeds and irises: crossed cards in clumps along the shore
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const c = cv.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    const x = 14 + r() * 100, lean = (r() - 0.5) * 30, top = 30 + r() * 90;
    c.strokeStyle = `hsl(${88 + r() * 20}, ${38 + r() * 18}%, ${24 + r() * 14}%)`; c.lineWidth = 3 + r() * 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, 256); c.quadraticCurveTo(x + lean * 0.3, (256 + top) / 2, x + lean, top); c.stroke();
  }
  for (let i = 0; i < 4; i++) {                                                     // a few irises
    const x = 24 + r() * 80, y = 40 + r() * 50;
    c.fillStyle = '#6b4aa6'; for (const [dx, dy, rot] of [[-7, 2, -0.6], [7, 2, 0.6], [0, -8, 0]]) { c.beginPath(); c.ellipse(x + dx, y + dy, 6, 11, rot, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#f2d34f'; c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill();
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const cards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < (low ? 6 : 10); i++) {
    const a = r() * Math.PI * 2; if (!clear(a, 0.5)) continue;
    for (let j = 0; j < 3; j++) {
      const [x, z] = onShore(a + (r() - 0.5) * 0.2, 0.93 + r() * 0.12), s = 0.8 + r() * 0.5, y = Math.max(pondY - 0.15, t.heightAt(x, z) - 0.05);
      if (walkable(x, z)) continue;
      for (const turn of [0, Math.PI / 2]) cards.push(new THREE.PlaneGeometry(0.7 * s, 1.4 * s).translate(0, 0.7 * s, 0).rotateY(r() * 3 + turn).translate(x, y, z));
    }
  }
  if (cards.length) {
    const reeds = new THREE.Mesh(mergeGeometries(cards)!, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
    reeds.receiveShadow = true; scene.add(reeds);
  }
}
