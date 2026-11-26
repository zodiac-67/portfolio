import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergePrefab, toFloat } from './prefab';
import { puffs } from './life';
import { CLOUD_Y, type Island } from './island';
import type { Terrain } from './terrain';

// The sky-boat: docked beside the pier, it brings first-time visitors in through the clouds, takes anyone on a tour
// around the island, and can be sailed by hand from the wheel on its helm deck. It banks into turns, bobs on the cloud
// swell and leaves a wake of cloud behind it.

const canvasTex = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = false) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
const planks = () => canvasTex(256, 256, (c) => {                                 // fore-and-aft deck planks, butt joints staggered
  c.fillStyle = '#9a7653'; c.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 10; i++) {
    c.fillStyle = `hsl(28, 32%, ${36 + ((i * 37) % 9)}%)`; c.fillRect(i * 25.6 + 1, 0, 24, 256);
    c.fillStyle = 'rgba(40, 25, 15, .55)'; c.fillRect(i * 25.6, 0, 1.5, 256); c.fillRect(i * 25.6, ((i * 97) % 256), 25.6, 1.5);
  }
}, true);
const sailCloth = () => canvasTex(512, 512, (c) => {                              // cloth panels with seams and an ink-brushed circle
  c.fillStyle = '#efe7d6'; c.fillRect(0, 0, 512, 512);
  for (let x = 0; x < 512; x += 64) { c.fillStyle = 'rgba(120, 100, 70, .16)'; c.fillRect(x, 0, 3, 512); }
  c.strokeStyle = 'rgba(38, 32, 30, .82)'; c.lineCap = 'round';                   // an open enso, thick at the start and trailing off
  for (let i = 0; i < 60; i++) { const a = -1.9 + i * 0.09; c.lineWidth = 30 * (1 - i / 75); c.beginPath(); c.arc(256, 230, 112, a, a + 0.11); c.stroke(); }
  const g = c.createRadialGradient(256, 256, 160, 256, 256, 380); g.addColorStop(0, 'rgba(90, 60, 30, 0)'); g.addColorStop(1, 'rgba(90, 60, 30, .22)');
  c.fillStyle = g; c.fillRect(0, 0, 512, 512);
});

export type Voyage = 'arrive' | 'tour';
/** what the helmsman asks for this frame: throttle and lift -1..1, steer -1 (to port) .. 1 (to starboard), boost (Q) */
export type Helm = { throttle: number; steer: number; lift: number; boost: boolean };
type Mode = Voyage | 'docked' | 'pilot' | 'hold' | 'docking';

// sailing by hand (m, s, rad): an arcade glide, not a simulation
const VMAX = 16, VREV = 4, VBOOST = 28, BOOST_T = 1.4, BOOST_CD = 5.4, TURN = 1.05, CLIMB = 6;
const EDGE = 150, CEIL = 90, FLOOR = CLOUD_Y + 5;                                 // a soft fence round the island, the cloud sea below, the high sky above
const STAND = new THREE.Vector3(0, 0.3, -3.25);                                    // where the helmsman stands (boat space: x to port, y up, z to the bow)
const PROBES = [[0, -0.4, 4.5], [0, 0.2, -4.3], [0, -1.4, 0], [1.6, 0.3, 0.3], [-1.6, 0.3, 0.3], [0, 7.4, 0.9]].map(([x, y, z]) => new THREE.Vector3(x, y, z));   // bow, stern, keel, sides, masthead
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export async function buildBoat(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, t: Terrain, I: Island, low: boolean) {
  const g = await loader.loadAsync('/game/boat.glb'), src = g.scene.getObjectByName('boat')!;
  // the wheel comes out first: its own mesh, centred on its hub so it can turn on the axle
  src.updateMatrixWorld(true);
  const wsrc = src.getObjectByName('helm_wheel') as THREE.Mesh;
  const wgeo = toFloat(wsrc.geometry.clone()).applyMatrix4(src.matrixWorld.clone().invert().multiply(wsrc.matrixWorld));
  for (const k of Object.keys(wgeo.attributes)) if (k !== 'position' && k !== 'normal') wgeo.deleteAttribute(k);
  wgeo.computeBoundingBox(); const hub = wgeo.boundingBox!.getCenter(new THREE.Vector3()); wgeo.translate(-hub.x, -hub.y, -hub.z);
  wsrc.removeFromParent();
  const pf = mergePrefab(src);
  const time = { value: 0 }, flap = { value: 0 };                                 // flap: 0 becalmed .. ~1.3 at full speed with the boost on
  const sail = new THREE.MeshStandardMaterial({ map: sailCloth(), side: THREE.DoubleSide, roughness: 0.95 });
  sail.onBeforeCompile = (sh) => {                                                // the cloth breathes between its battens, fills and shivers with speed
    sh.uniforms.uTime = time; sh.uniforms.uFlap = flap;
    sh.vertexShader = 'uniform float uTime, uFlap;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
  float belly = sin(3.14159 * uv.x);
  transformed.z -= belly * (0.05 + 0.04 * sin(uTime * 1.7 + uv.y * 5.0) + uFlap * 0.035 * sin(uTime * 7.3 + uv.y * 9.0 + uv.x * 4.0));
  transformed.z += belly * sin(3.14159 * uv.y) * uFlap * 0.12;`);
  };
  const pennant = new THREE.MeshStandardMaterial({ color: 0xc4472f, side: THREE.DoubleSide, roughness: 0.8 });
  pennant.onBeforeCompile = (sh) => {                                             // hangs slack at rest, streams and snaps at speed (u runs out from the mast)
    sh.uniforms.uTime = time; sh.uniforms.uFlap = flap;
    sh.vertexShader = 'uniform float uTime, uFlap;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
  float slack = clamp(1.0 - uFlap, 0.0, 1.0), u2 = uv.x * uv.x;
  transformed.x += sin(uTime * 6.0 - uv.x * 7.0) * uv.x * (0.06 + 0.2 * min(uFlap, 1.3));
  transformed.y -= u2 * slack * 0.9; transformed.z += u2 * slack * 0.3;`);
  };
  const mats: Record<string, THREE.Material> = {
    M_Hull: new THREE.MeshStandardMaterial({ color: 0x5c3523, roughness: 0.45, side: THREE.DoubleSide }),   // lacquer; double-sided so the bulwarks show from the deck
    M_Vermilion: new THREE.MeshStandardMaterial({ color: 0xc4472f, roughness: 0.5, side: THREE.DoubleSide }),
    M_Deck: new THREE.MeshStandardMaterial({ map: planks(), roughness: 0.85 }),
    M_DarkWood: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.85 }),
    M_Sail: sail, M_Rope: new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }),
    M_Paper: new THREE.MeshStandardMaterial({ color: 0xf4ead4, emissive: 0xffc98a, emissiveIntensity: 0.4, roughness: 0.9 }),
    M_Roof: new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.7 }),
    M_Lantern: new THREE.MeshStandardMaterial({ color: 0xc8402c, emissive: 0xff7a3a, emissiveIntensity: 0.7, roughness: 0.8 }),
    M_Helm: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.6 }), M_Pennant: pennant,
  };
  const boat = new THREE.Group();
  for (const [name, gs] of Object.entries(pf.groups)) {
    const m = new THREE.Mesh(mergeGeometries(gs.map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x; }))!, mats[name] ?? mats.M_DarkWood);
    m.castShadow = !low; m.receiveShadow = true; boat.add(m);
  }
  const wheel = new THREE.Mesh(wgeo, mats.M_Helm); wheel.position.copy(hub); wheel.castShadow = !low; boat.add(wheel);
  scene.add(boat);

  // the deck colliders ride along on a kinematic body
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
  for (const b of pf.boxes) { const c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5); world.createCollider(RAPIER.ColliderDesc.cuboid(s.x, s.y, s.z).setTranslation(c.x, c.y, c.z), body); }

  // where it docks: alongside the pier, bow towards the island, its deck level with the pier's
  const [px, pz] = I.props.pier[0], pierTop = t.heightAt(px, pz + 1) + 0.2, y0 = pierTop;
  const dock = new THREE.Vector3(px + 3.55, y0, pz - 6.5);
  const V = (x: number, dy: number, z: number) => new THREE.Vector3(x, y0 + dy, z);
  const arrive = new THREE.CatmullRomCurve3([V(80, -16, -250), V(52, -10, -180), V(20, -3, -122), V(dock.x, -0.6, -92), V(dock.x, -0.1, dock.z - 9), dock.clone()], false, 'centripetal');
  const ring: THREE.Vector3[] = [];
  for (let a = 30; a <= 335; a += 25) {                                           // around the island, wide of the monk's islet, higher past the castle
    const r = a > 195 && a < 280 ? 124 : 108, rad = (a * Math.PI) / 180;
    ring.push(V(Math.sin(rad) * r, 5 + 6 * Math.exp(-(((a - 150) / 45) ** 2)) + 2 * Math.sin(rad * 2), -Math.cos(rad) * r));
  }
  const tour = new THREE.CatmullRomCurve3([dock.clone(), V(dock.x + 4, 0.6, dock.z + 2), V(dock.x + 13, 1.6, dock.z - 3), V(dock.x + 20, 3, dock.z - 14),
    ...ring, V(-20, 2.5, -108), V(dock.x, 1, -92), V(dock.x, 0.1, dock.z - 9), dock.clone()], false, 'centripetal');

  // cloud wake: soft puffs shed from under the stern while it moves, more and bigger the faster it goes
  const NW = low ? 40 : 80, LIFE = 1.8, wake = puffs(NW, new THREE.Color(0xfaf4f0)), wlife = new Float32Array(NW), wsize = new Float32Array(NW);
  const wvel: THREE.Vector3[] = Array.from({ length: NW }, () => new THREE.Vector3());
  scene.add(wake.pts); let wi = 0, shed = 0;

  // the island as cheap shapes, for the meshes the physics world holds no collider for (its rock underside, the islet's)
  // or holds as the heightfield, whose cliff drops 200 m at the edge and would wall off the way under the island
  const O = I.outline, ZS = O.zs, IS = I.islets[0] as Island['islets'][number] | undefined;
  const edgeR = (th: number) => { let r = O.base; for (let i = 0; i < O.waves.length; i++) r += O.waves[i][0] * Math.sin(O.waves[i][1] * th + O.waves[i][2]); return r; };
  /** how deep a point is inside the island (its ground, its edge, the rock beneath) or the islet's rock; the way out goes in n */
  const probe = (x: number, y: number, z: number, n: THREE.Vector3) => {
    let d = Infinity;
    const th = Math.atan2(z / ZS, -x), r = Math.hypot(x, z / ZS), R = edgeR(th), h = r < R + 0.5 ? t.heightAt(x, z) : -Infinity;
    if (h > -Infinity && y > h - 5) {                                           // over the island (or in its topsoil): off the slope, or out past the edge if nearer
      if (y >= h + 0.3) return 0;
      n.set(t.heightAt(x - 1, z) - t.heightAt(x + 1, z), 2, t.heightAt(x, z - 1) - t.heightAt(x, z + 1)).normalize();
      const up = (h + 0.3 - y) * n.y, out = R + 0.5 - r;
      if (up < out) return up;
      n.set(x, 0, z / (ZS * ZS)).normalize(); return out;
    }
    // under the ground or out past the edge: the rock, rings 62 m deep under the rim shrinking towards a point that drifts
    // off-centre (make_island.py), crags allowed for
    const f = (t.heightAt(-(R - 1.5) * Math.cos(th), (R - 1.5) * Math.sin(th) * ZS) - 0.4 - y) / 62;
    if (f > 0 && f < 1) {
      const rx = x + 6 * f, rz = z + 4 * f, th2 = Math.atan2(rz / ZS, -rx), r2 = Math.hypot(rx, rz / ZS), e2 = edgeR(th2), R2 = e2 * (1 - f ** 1.25) * (1.03 + 0.056 * f) + 1.5;
      if (r2 < R2 && r2 > 1e-3) {
        const slope = Math.min(2, (e2 * 1.25 * f ** 0.25) / 62), dd = (R2 - r2) / Math.hypot(1, slope);
        if (dd < d) { d = dd; n.set(rx / r2, -slope, rz / (ZS * ZS * r2)).normalize(); }
      }
    }
    if (IS) {                                                                     // the islet's rock: the same, smaller (its grassy top has a collider)
      const fi = (IS.y - 0.1 - y) / (IS.r * 2.6);
      if (fi > 0 && fi < 1) {
        const ix = x - IS.x + 6 * fi, iz = z - IS.z + 4 * fi, ri = Math.hypot(ix, iz), Ri = IS.r * 1.08 * (1 - fi ** 1.25) * (1.03 + 0.035 * fi) + 0.8;
        if (ri < Ri && ri > 1e-3) {
          const slope = Math.min(2, (1.25 * fi ** 0.25) / 2.6), dd = (Ri - ri) / Math.hypot(1, slope);
          if (dd < d) { d = dd; n.set(ix / ri, -slope, iz / ri).normalize(); }
        }
      }
    }
    return d === Infinity ? 0 : d;
  };
  const near = (p: THREE.Vector3) => (Math.hypot(p.x, p.z / ZS) < O.base + 32 && p.y < 55) || (!!IS && Math.hypot(p.x - IS.x, p.z - IS.z) < IS.r + 30 && p.y < IS.y + 25);
  // everything else solid (houses, the castle, trees, boulders, bridges, the pier) by a hull-sized box swept along each move
  let ground: RAPIER.Collider | undefined;
  world.forEachCollider((c) => { if (c.shapeType() === RAPIER.ShapeType.HeightField) ground = c; });
  const hull = new RAPIER.Cuboid(1.65, 4.4, 4.55), HC = new THREE.Vector3(0, 3, 0.1);

  let mode: Mode = 'docked', voyage: { kind: Voyage; curve: THREE.CatmullRomCurve3; dur: number; t: number } | null = null;
  const pos = dock.clone(), prev = new THREE.Vector3(), last = dock.clone(), cp = new THREE.Vector3(), tan = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
  const w = new THREE.Vector3(), nn = new THREE.Vector3(), hitN = new THREE.Vector3(), from = new THREE.Vector3(), delta = new THREE.Vector3(), knock = new THREE.Vector3();
  const wheelAt = new THREE.Vector3(), mInv = new THREE.Matrix4(), mInvPrev = new THREE.Matrix4(), mDelta = new THREE.Matrix4();
  const input: Helm = { throttle: 0, steer: 0, lift: 0, boost: false };
  const dk = { t: 0, dur: 1, p0: new THREE.Vector3(), p1: new THREE.Vector3(), p2: new THREE.Vector3() };
  let yaw = 0, roll = 0, pitch = 0, speed = 0, spd = 0, vy = 0, yawRate = 0, accel = 0, boostT = 0, cool = 0, wheelA = 0, bump = 0, bumpGap = 0, turned = 0, steerS = 0, liftS = 0, cast = 0;

  const place = (p: THREE.Vector3, yw: number, rl: number, pt: number, clock: number) => {
    boat.position.copy(p); boat.position.y += Math.sin(clock * 1.1) * 0.08;
    boat.quaternion.setFromEuler(e.set(pt, yw, rl + Math.sin(clock * 0.8) * 0.015));
    body.setNextKinematicTranslation(boat.position); body.setNextKinematicRotation(boat.quaternion);
    boat.updateMatrix(); mInvPrev.copy(mInv); mInv.copy(boat.matrix).invert(); mDelta.multiplyMatrices(boat.matrix, mInvPrev);   // this frame's move, for whoever stands on deck
    wheelAt.copy(hub).applyQuaternion(boat.quaternion).add(boat.position);
  };
  place(dock, 0, 0, 0, 0); body.setTranslation(boat.position, true);

  /** a knock against the island: lose way (head-on more than glancing), cancel the push into it, a little bounce */
  const respond = (n: THREE.Vector3) => {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    spd *= 1 - 0.5 * clamp(-(fx * n.x + fz * n.z) * Math.sign(spd), 0, 1);
    if (vy * n.y < 0) vy *= 0.3;
    const vn = (fx * spd + knock.x) * n.x + (vy + knock.y) * n.y + (fz * spd + knock.z) * n.z;
    if (vn >= 0) return;
    knock.addScaledVector(n, -vn * 1.2); if (knock.lengthSq() > 100) knock.setLength(10);
    if (-vn > 0.8 && bumpGap <= 0) { bump = Math.min(1, -vn / 12); bumpGap = 0.35; }
  };

  /** sailing by hand ('pilot'), or let go and drifting to a stop where it is ('hold') */
  const free = (dt: number) => {
    const piloting = mode === 'pilot', ease = (r: number) => 1 - Math.exp(-r * dt);
    // keys are all-or-nothing: the wheel and the lift lever come round over a moment (and centre a little quicker), so turns
    // and climbs curve in and out instead of snapping
    const st0 = piloting ? input.steer : 0, lf0 = piloting ? input.lift : 0;
    steerS += (st0 - steerS) * ease(st0 ? 5 : 7); liftS += (lf0 - liftS) * ease(lf0 ? 3.5 : 4.5);
    let thr = piloting ? input.throttle : 0; const st = steerS, lf = liftS;
    // casting off: she's moored bow-in, so she first drifts clear of the pier and swings her bow out to the open sky (the
    // throttle only drives her forward once the bow is mostly clear); before this, W from the berth ran her into the island
    const out = Math.atan2(pos.x, pos.z), off = cast > 0 ? wrap(out - yaw) : 0;
    if (cast > 0) { cast = Math.abs(off) < 0.2 ? 0 : cast - dt; knock.x += Math.sin(out) * 6 * dt; knock.z += Math.cos(out) * 6 * dt; if (Math.abs(off) > 1.2) thr = Math.min(thr, 0); }
    if (piloting && input.boost && cool <= 0) { boostT = BOOST_T; cool = BOOST_CD; }
    boostT = Math.max(0, boostT - dt); cool = Math.max(0, cool - dt);
    // way: eases towards what the throttle asks; braking bites, the reverse is slow, an idle helm glides to a stop
    const want = boostT > 0 ? VBOOST : thr >= 0 ? thr * VMAX : thr * VREV, s0 = spd;
    spd += (want - spd) * ease(!piloting ? 1.2 : boostT > 0 ? 2 : want > spd ? (spd < -0.1 ? 2.2 : 1.1) : thr < -0.05 && spd > 0.1 ? 2.2 : 0.5);
    accel += ((spd - s0) / Math.max(dt, 1e-3) - accel) * ease(4);
    // the wheel turns her quickly at any speed (a touch less at full); past the fence she's drawn back round towards the island
    let yr = cast > 0 ? clamp(off * 1.6, -1.4, 1.4) : -st * TURN * (1 - 0.3 * Math.min(1, Math.abs(spd) / VMAX));
    const r = Math.hypot(pos.x, pos.z), over = clamp((r - EDGE + 25) / 25, 0, 1);
    if (over > 0) { if (piloting) yr += clamp(wrap(Math.atan2(-pos.x, -pos.z) - yaw) * 1.6, -1.2, 1.2) * over; knock.x -= (pos.x / r) * over * 8 * dt; knock.z -= (pos.z / r) * over * 8 * dt; }
    yawRate += (yr - yawRate) * ease(5); yaw = wrap(yaw + yawRate * dt);
    // climb and sink, easing off near the cloud sea and the top of the sky
    const vyT = pos.y < FLOOR ? (FLOOR - pos.y) * 2 : lf * CLIMB * clamp(lf < 0 ? (pos.y - FLOOR) / 8 : (CEIL - pos.y) / 8, 0, 1);
    vy += (vyT - vy) * ease(2.2);
    prev.copy(pos);
    pos.x += (Math.sin(yaw) * spd + knock.x) * dt; pos.y += (vy + knock.y) * dt; pos.z += (Math.cos(yaw) * spd + knock.z) * dt;
    knock.multiplyScalar(Math.exp(-dt * 2.5));
    const r1 = Math.hypot(pos.x, pos.z); if (r1 > EDGE + 10) { pos.x *= (EDGE + 10) / r1; pos.z *= (EDGE + 10) / r1; }
    pos.y = clamp(pos.y, FLOOR - 2, CEIL);
    // lean into the turn, more the faster she goes; nose up on the climb and as she gathers way
    roll += (clamp(-yawRate * (0.14 + 0.02 * Math.abs(spd)), -0.34, 0.34) - roll) * ease(3);
    pitch += (clamp(-vy * 0.03 - clamp(accel * 0.012, -0.07, 0.07), -0.2, 0.2) - pitch) * ease(3);
    q.setFromEuler(e.set(pitch, yaw, roll));
    // bump off the island: the deepest hull point comes back out, then the hull's box is swept from where it was
    let deep = 0;
    for (let i = 0; i < PROBES.length; i++) { w.copy(PROBES[i]).applyQuaternion(q).add(pos); const d = probe(w.x, w.y, w.z, nn); if (d > deep) { deep = d; hitN.copy(nn); } }
    if (deep > 0) { pos.addScaledVector(hitN, deep); respond(hitN); }
    if (near(pos)) {
      from.copy(HC).applyQuaternion(q).add(prev); delta.subVectors(pos, prev);
      const hit = world.castShape(from, q, delta, hull, 0.02, 1, false, RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, ground);
      if (hit) { pos.copy(prev).addScaledVector(delta, Math.max(0, hit.time_of_impact - 0.02)); respond(nn.set(hit.normal1.x, hit.normal1.y, hit.normal1.z)); }
    }
    return st;
  };
  const canDock = () => mode === 'pilot' && Math.hypot(pos.x - dock.x, pos.z - dock.z) < 18 && pos.y - dock.y > -8 && pos.y - dock.y < 12 && pos.x > dock.x - 3;
  const reset = () => { spd = vy = yawRate = accel = boostT = steerS = liftS = cast = 0; knock.set(0, 0, 0); };
  /** jump to the dock (skipping the arrival, cutting the tour short, or bringing her home once nobody's aboard) */
  const finish = () => { voyage = null; mode = 'docked'; yaw = roll = pitch = 0; pos.copy(dock); reset(); };

  return {
    dock, pierTop,
    /** where to stand on the pier to board for the tour */
    boardAt: new THREE.Vector3(px + 1.2, pierTop + 1.3, dock.z + 1.5),
    /** the wheel's hub in world space, riding with the boat (the same vector every frame: use it as a spot's `at`) */
    wheelAt,
    get moving() { return voyage !== null; },
    get kind() { return voyage?.kind ?? null; },
    get mode() { return mode; },
    get yaw() { return yaw; },
    /** her centre without the bob, lean or pitch: a steady point for the camera to follow */
    get centre() { return pos; },
    /** yaw change over the last update, to turn whoever stands on deck with her */
    get turned() { return turned; },
    /** signed way (m/s, forward +) when sailed by hand; how fast she moves 0..1 in any mode */
    get speed() { return mode === 'pilot' || mode === 'hold' ? spd : speed; },
    get speed01() { return clamp(speed / VMAX, 0, 1); },
    get boosting() { return boostT > 0; },
    get boostReady() { return cool <= 0; },
    /** climbing (+) or sinking (-), -1..1 */
    get lift() { return clamp(vy / CLIMB, -1, 1); },
    /** a knock this frame, 0..1 (0 most frames) */
    get bump() { return bump; },
    /** close enough to the berth to dock */
    get dockable() { return canDock(); },
    /** 'arrive' | 'tour' follow their paths; 'pilot' takes the helm (from the berth she casts off astern); 'hold' lets go: she
     *  drifts to a stop and hangs where she is; null snaps her back to the berth */
    set(kind: Voyage | 'pilot' | 'hold' | null) {
      if (kind === 'arrive' || kind === 'tour') { voyage = { kind, curve: kind === 'arrive' ? arrive : tour, dur: kind === 'arrive' ? 13 : 46, t: 0 }; mode = kind; reset(); return; }
      if (kind === 'pilot') { if (mode === 'docked') { reset(); vy = 0.8; cast = 4; } voyage = null; mode = 'pilot'; return; }
      if (kind === 'hold') { if (mode === 'pilot' || mode === 'docking') mode = 'hold'; return; }
      finish();
    },
    /** the helmsman's input for this frame (read while piloting) */
    helm(i: Helm) { input.throttle = clamp(i.throttle, -1, 1); input.steer = clamp(i.steer, -1, 1); input.lift = clamp(i.lift, -1, 1); input.boost = i.boost; },
    /** ease into the berth (when dockable); update() returns true the frame she's in */
    dockIn() {
      if (!canDock()) return false;
      dk.t = 0; dk.dur = clamp(pos.distanceTo(dock) / 6 + 1.5, 3, 6);
      dk.p0.copy(pos); dk.p1.set(Math.sin(yaw) * spd, vy, Math.cos(yaw) * spd).add(knock).multiplyScalar(dk.dur / 3).add(pos);   // leaves at the speed she had
      dk.p2.set(dock.x, dock.y, dock.z - 1);                                     // and comes in bow first from seaward, barely moving
      reset(); mode = 'docking'; return true;
    },
    /** a point on the deck in world space (boat space: x to port, z to the bow, y up from the deck), riding with the boat */
    deck: (lx: number, lz: number, ly = 0, out = new THREE.Vector3()) => out.set(lx, ly, lz).applyQuaternion(boat.quaternion).add(boat.position),
    /** where the helmsman's feet go, in world space */
    helmStand: (out: THREE.Vector3) => out.copy(STAND).applyQuaternion(boat.quaternion).add(boat.position),
    /** is a world point (feet) on her deck? */
    aboard(p: { x: number; y: number; z: number }) { w.set(p.x, p.y, p.z).applyMatrix4(mInv); return Math.abs(w.x) < 1.7 && w.z > -4.4 && w.z < 3.8 && w.y > -0.8 && w.y < 2.6; },
    /** move a world point the way the deck moved over the last update (in place): whoever stands on it goes with her */
    carry: (p: THREE.Vector3) => p.applyMatrix4(mDelta),
    /** advance; returns true on the frame a voyage ends or she settles into the berth */
    update(dt: number, clock: number) {
      time.value = clock; let ended = false, st = 0; const y0w = yaw;
      bump = 0; bumpGap -= dt;
      if (voyage) {
        voyage.t = Math.min(1, voyage.t + dt / voyage.dur);
        const s = voyage.kind === 'arrive' ? 1 - (1 - voyage.t) ** 2.2 : voyage.t * voyage.t * (3 - 2 * voyage.t);   // the arrival glides in and slows
        voyage.curve.getPointAt(s, cp); voyage.curve.getTangentAt(Math.min(0.999, s), tan);
        const turn = wrap(Math.atan2(tan.x, tan.z) - yaw);
        yaw += turn * Math.min(1, dt * 4); roll += (-turn * 2.2 - roll) * Math.min(1, dt * 2);        // lean into the turn
        pos.copy(cp); pos.y += Math.sin(clock * 1.3) * Math.min(1, speed / 6) * 0.35;
        place(pos, yaw, clamp(roll, -0.25, 0.25), -tan.y * 0.6, clock);
        if (voyage.t >= 1) { voyage = null; mode = 'docked'; yaw = 0; roll = 0; ended = true; }
      } else if (mode === 'pilot' || mode === 'hold') {
        st = free(dt); place(pos, yaw, roll, pitch, clock);
      } else if (mode === 'docking') {                                           // a cubic from where she was to the berth
        dk.t = Math.min(1, dk.t + dt / dk.dur); const u = dk.t, a = 1 - u;
        prev.copy(pos); pos.copy(dk.p0).multiplyScalar(a * a * a).addScaledVector(dk.p1, 3 * a * a * u).addScaledVector(dk.p2, 3 * a * u * u).addScaledVector(dock, u * u * u);
        tan.subVectors(pos, prev);
        let ny = tan.x * tan.x + tan.z * tan.z > 1e-8 ? Math.atan2(tan.x, tan.z) : yaw; if (Math.cos(ny - yaw) < 0) ny += Math.PI;   // backing in stays backing in
        ny += wrap(-ny) * u * u * u;                                             // squared up to the pier by the end
        const turn = wrap(ny - yaw); yaw = wrap(yaw + turn * Math.min(1, dt * 4));
        roll += (-turn * 2.2 - roll) * Math.min(1, dt * 2); roll *= 1 - u; pitch *= 1 - Math.min(1, dt * 3);
        if (dk.t >= 1) { mode = 'docked'; pos.copy(dock); yaw = roll = pitch = 0; ended = true; }
        place(pos, yaw, clamp(roll, -0.25, 0.25), pitch, clock);
      } else { pos.copy(dock); place(dock, 0, 0, 0, clock); }
      turned = wrap(yaw - y0w);
      speed += (Math.min(40, pos.distanceTo(last) / Math.max(dt, 1e-3)) - speed) * Math.min(1, dt * 6); last.copy(pos);
      // the wheel follows the helmsman's hands, or (sailing herself) her turn; it springs back when let go
      if (mode !== 'pilot') st = clamp(-turned / Math.max(dt, 1e-3) / TURN, -1, 1);
      wheelA += (st * 1.9 - wheelA) * Math.min(1, dt * 7); wheel.rotation.z = wheelA;
      flap.value += (clamp(speed / VMAX, 0, 1) + (boostT > 0 ? 0.3 : 0) - flap.value) * Math.min(1, dt * 2);
      // the wake
      const fast = clamp(speed / VMAX, 0, 1);
      shed += dt * Math.min(NW / LIFE, Math.min(1, speed / 3) * (18 + speed * 1.4) * (boostT > 0 ? 1.5 : 1));
      for (; shed >= 1; shed--) {
        w.set((Math.random() - 0.5) * 1.6, -1.1 - Math.random() * 0.4, -3.6 - Math.random()).applyQuaternion(boat.quaternion).add(boat.position);
        wake.pos[wi * 3] = w.x; wake.pos[wi * 3 + 1] = w.y; wake.pos[wi * 3 + 2] = w.z; wlife[wi] = LIFE; wsize[wi] = 1 + fast * 0.6 + (boostT > 0 ? 0.4 : 0);
        wvel[wi].set((Math.random() - 0.5) * 1.2, -0.5 - Math.random() * 0.5, (Math.random() - 0.5) * 1.2); wi = (wi + 1) % NW;
      }
      for (let i = 0; i < NW; i++) {                                             // each puff swells and thins out as it falls behind
        wlife[i] = Math.max(0, wlife[i] - dt); const f = wlife[i] / LIFE;
        wake.pos[i * 3] += wvel[i].x * dt; wake.pos[i * 3 + 1] += wvel[i].y * dt; wake.pos[i * 3 + 2] += wvel[i].z * dt;
        wake.size[i] = (1.6 + (1 - f) * 3.2) * wsize[i]; wake.alpha[i] = f * (1 - f) * 2.4;
      }
      wake.dirty();
      return ended;
    },
    finish,
    /** testing aid: put her somewhere, stopped (hanging there unless someone's at the helm) */
    put(x: number, y: number, z: number, yw: number) { voyage = null; if (mode !== 'pilot') mode = 'hold'; pos.set(x, y, z); last.copy(pos); yaw = yw; roll = pitch = 0; reset(); },
    /** testing aid */
    debug: () => ({ mode, pos: pos.toArray().map((n) => +n.toFixed(2)), yaw: +yaw.toFixed(3), roll: +roll.toFixed(3), pitch: +pitch.toFixed(3), spd: +spd.toFixed(2), vy: +vy.toFixed(2), boost: boostT > 0, ready: cool <= 0, dockable: canDock(), wheel: +wheelA.toFixed(2) }),
  };
}
