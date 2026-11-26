import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergePrefab } from './prefab';
import type { Island } from './island';
import { puffs } from './life';

const Y = new THREE.Vector3(0, 1, 0);
const PED = [2.3, 1.65];                                                         // statue_build.py: the pedestal's bottom course, half width and half depth
const HOOK = 2.7, CLAP = 2.11, TIP = 1.70;                                        // statue_build.py GH_*: the chain's hook, the clapper's pivot, its grip
/** the ringing, in seconds from when the hand closes on the clapper: three strokes, then it's let go */
export const RING = { strikes: [0.72, 1.12, 1.52], release: 1.8, end: 2.4 };

/** carved granite: grey with dark and pale grains in object space (they stay put on the stone; grains smaller than a
 * pixel fade to their average instead of shimmering) and a little moss where the plinth meets the grass */
export function granite(color: number, maps?: { normal: THREE.Texture; ao: THREE.Texture }, ground = false) {
  // ground: a merged mesh of many stones (shrine_decor.ts) tints each by vertex colour and gives its height above the grass in aH
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, normalMap: maps?.normal ?? null, aoMap: maps?.ao ?? null, vertexColors: ground });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vOP;${ground ? '\nattribute float aH; varying float vH;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvOP = transformed;${ground ? ' vH = aH;' : ''}`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vOP;${ground ? '\nvarying float vH;' : '\n#define vH vOP.y'}
float gh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gh(i), gh(i + vec3(1, 0, 0)), f.x), mix(gh(i + vec3(0, 1, 0)), gh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gh(i + vec3(0, 0, 1)), gh(i + vec3(1, 0, 1)), f.x), mix(gh(i + vec3(0, 1, 1)), gh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `float aa = 1.0 - smoothstep(0.35, 1.0, length(fwidth(vOP)) * 110.0);
float dark = smoothstep(0.74, 0.82, gn(vOP * 110.0)), pale = smoothstep(0.72, 0.8, gn(vOP * 150.0 + 11.0));
diffuseColor.rgb *= (0.88 + 0.14 * gn(vOP * 2.5) + 0.05 * gn(vOP * 30.0)) * mix(0.98, (1.0 - 0.28 * dark) * (1.0 + 0.2 * pale), aa);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.09), (1.0 - smoothstep(0.08, 0.3, vH)) * smoothstep(0.4, 0.75, gn(vOP * 7.0)) * 0.75);`);
    // a soft fill from the viewer's side: the dawn sun sits behind the figure as you come over the bridge, which left its face in shade
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.45 * max(dot(normal, normalize(vViewPosition)), 0.0);');
  };
  m.customProgramCacheKey = () => (ground ? 'granite-g' : 'granite');
  return m;
}

/** a Chola temple bronze: warm aged bronze with a soft green patina settled in the hollows (the baked AO), gold on the crown,
 * the ring of fire and the worn high points of the jewellery (the baked convexity), the flame tips burnished copper. The masks
 * are in the figure's own space: the ring by its radius from the ring's centre `ring` (x, y, R; the ring stands behind the
 * figure, z < 0, and meets the lotus base in its bottom 25 degrees), the crown by height above `crown`. */
function bronze(maps: { normal: THREE.Texture; ao: THREE.Texture; cv: THREE.Texture }, ring: THREE.Vector3, crown: number) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 1, normalMap: maps.normal, aoMap: maps.ao, aoMapIntensity: 0.85 });
  const col = (h: number) => new THREE.Color(h);
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uCv: { value: maps.cv }, uRing: { value: ring }, uCrown: { value: crown },
      uBronze: { value: col(0x74492a) }, uGold: { value: col(0xc48a2a) }, uCopper: { value: col(0xc0582c) }, uPatina: { value: col(0x5f8a72) } });
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = transformed;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vOP; uniform sampler2D uCv; uniform vec3 uRing, uBronze, uGold, uCopper, uPatina; uniform float uCrown;
float bh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float bn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bh(i), bh(i + vec3(1, 0, 0)), f.x), mix(bh(i + vec3(0, 1, 0)), bh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bh(i + vec3(0, 0, 1)), bh(i + vec3(1, 0, 1)), f.x), mix(bh(i + vec3(0, 1, 1)), bh(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `vec2 rv = vOP.xy - uRing.xy; float rr = length(rv) / uRing.z, down = -rv.y / max(length(rv), 1e-3);
float ao = texture2D(aoMap, vAoMapUv).r, cv = texture2D(uCv, vAoMapUv).r, n1 = bn(vOP * 9.0), n2 = bn(vOP * 31.0 + 5.0);
float ring = smoothstep(0.74, 0.79, rr) * (1.0 - smoothstep(-0.07, 0.03, vOP.z)) * (1.0 - smoothstep(0.88, 0.94, down));
float flame = ring * smoothstep(0.9, 0.99, rr);
float crown = smoothstep(uCrown, uCrown + 0.1, vOP.y) * (1.0 - smoothstep(0.7, 0.75, rr)) * (1.0 - smoothstep(0.38, 0.5, abs(vOP.x - uRing.x + 0.12)));
float gold = max(max(ring, crown) * (0.75 + 0.25 * n1), smoothstep(0.3, 0.75, cv) * smoothstep(0.55, 0.85, ao) * 0.9);
float patina = (1.0 - smoothstep(0.45, 0.9, ao)) * (0.6 + 0.4 * n1) * (1.0 - 0.7 * gold);
vec3 metal = mix(uBronze * (0.8 + 0.35 * n2), uGold * (0.9 + 0.15 * n2), gold);
metal = mix(metal, uCopper, flame * 0.85);
diffuseColor.rgb = mix(metal, uPatina * (0.75 + 0.4 * n2), patina);
float bMetal = mix(0.88, 0.0, patina), bRough = mix(mix(0.5 + 0.12 * n2, 0.4, gold), 0.85, patina);`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
      // the dawn sun is behind the figure as you come over the bridge: a soft fill from the viewer's side keeps its face lit
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
float vf = max(dot(normal, normalize(vViewPosition)), 0.0);
reflectedLight.indirectDiffuse += material.diffuseColor * 0.5 * vf;
reflectedLight.indirectSpecular += material.specularColor * (0.25 + 0.6 * vf * vf) * ao;`);
  };
  m.customProgramCacheKey = () => 'bronze';
  return m;
}

/** a Shiva lingam of dark polished stone on its yoni (a round basin whose spout carries the poured water away), garlanded
 * with marigolds; its origin on the ground, the spout to the right. Returns the mesh and the height of its rounded top. */
function lingam() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(0.42, 0.46, 0.14, 20).translate(0, 0.07, 0), new THREE.CylinderGeometry(0.36, 0.42, 0.08, 20).translate(0, 0.18, 0));   // a footing and the basin
  parts.push(new THREE.BoxGeometry(0.36, 0.07, 0.14).translate(0.52, 0.18, 0));    // the spout
  parts.push(new THREE.CylinderGeometry(0.13, 0.14, 0.3, 16, 1, true).translate(0, 0.37, 0), new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.52, 0));
  const mesh = new THREE.Mesh(mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; }))!,
    new THREE.MeshStandardMaterial({ color: 0x2f2d2a, roughness: 0.28 }));          // oiled and wet from the morning's water
  mesh.castShadow = mesh.receiveShadow = true;
  // a marigold garland round the basin's rim
  const flower = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.035, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 22), m = new THREE.Matrix4();
  for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2; flower.setMatrixAt(i, m.makeTranslation(Math.cos(a) * 0.33, 0.24, Math.sin(a) * 0.33)); flower.setColorAt(i, new THREE.Color([0xf08a12, 0xf7b41c][i % 2])); }
  mesh.add(flower);
  return { mesh, top: 0.65 };
}

/** a banana leaf heaped with marigolds and jasmine, and a little brass cup of incense, laid on the grass before the image */
function offering() {
  let k = 7; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647), parts: THREE.BufferGeometry[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const put = (geo: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, s = 1, sy = s, yaw = r() * 6.28, tilt = 0) => {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(tilt, yaw, tilt * 0.7)), new THREE.Vector3(s, sy, s)));
    g.deleteAttribute('uv'); const c = new THREE.Color(hex), col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) c.toArray(col, i);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };
  put(new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2).scale(0.36, 1, 0.19), 0x4f7a2a, 0, 0.012, 0, 1, 1, 0);
  for (let i = 0; i < 16; i++) {                                                  // marigold heads, piled towards the middle
    const a = r() * 6.28, d = Math.sqrt(r());
    put(new THREE.IcosahedronGeometry(0.045, 0), [0xf08a12, 0xf7b41c, 0xe5701a][i % 3], Math.cos(a) * d * 0.27, 0.035 + 0.035 * (1 - d), Math.sin(a) * d * 0.12, 1, 0.7);
  }
  for (let i = 0; i < 6; i++) { const a = r() * 6.28; put(new THREE.IcosahedronGeometry(0.022, 0), 0xf4f0e4, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.14); }
  put(new THREE.CylinderGeometry(0.05, 0.04, 0.06, 8), 0xa8843a, 0.48, 0.03, 0.05, 1, 1, 0);
  for (let i = 0; i < 3; i++) put(new THREE.CylinderGeometry(0.004, 0.004, 0.3, 3), 0x6b2a1c, 0.48 + (i - 1) * 0.012, 0.2, 0.05, 1, 1, i * 2.1, (i - 1) * 0.08);
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
  mesh.receiveShadow = true; return mesh;
}

/** Lord Shiva as Nataraja, a 4.5 m figure carved in granite on a stepped pedestal where the islet shrine stood, facing the rope bridge;
 * a temple bell in a granite gateway to one side of the path. Returns where to ring the bell, Pandit Shankar's places, and the update. */
export async function buildStatue(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, I: Island, low: boolean) {
  const g = await loader.loadAsync('/game/nataraja.glb');
  const isl = I.islets[0], [sx, sz, yaw] = I.props.shrine[0];
  const top = (x: number, z: number) => isl.y + 0.8 * (1 - Math.min(1, Math.hypot(x - isl.x, z - isl.z) / isl.r) ** 2);   // the islet's grassy dome (make_island.py)
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const local = (x: number, z: number) => new THREE.Vector3(sx, 0, sz).addScaledVector(side, x).addScaledVector(fwd, z);
  // the pedestal sits a little into the dome at its lowest corner, so no corner ever floats
  const base = Math.min(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const p = local(a * PED[0], b * PED[1]); return top(p.x, p.z); })) - 0.04;
  const statue = new THREE.Group(); statue.position.set(sx, base, sz); statue.rotation.y = yaw;
  // the bell frame: to the statue's left, a few metres towards the bridge, its striker turned to whoever comes across
  const land = [...I.bridges].sort((a, b) => Math.hypot(a.b[0] - isl.x, a.b[2] - isl.z) - Math.hypot(b.b[0] - isl.x, b.b[2] - isl.z))[0]?.b;
  const fp = local(3.6, 4.2), fYaw = land ? Math.atan2(land[0] - fp.x, land[2] - fp.z) : yaw;
  const frame = new THREE.Group(); frame.position.set(fp.x, top(fp.x, fp.z) - 0.05, fp.z); frame.rotation.y = fYaw;
  scene.add(statue, frame); statue.updateMatrixWorld(); frame.updateMatrixWorld();

  // the bell (with its chain) and its clapper move when rung: lift them out before the still parts are merged
  const src = g.scene.getObjectByName('ghanta')!, clapSrc = new THREE.Group(), bellSrc = new THREE.Group();
  for (const o of [...src.children]) if (o.name.startsWith('gh_clap')) clapSrc.add(o); else if (o.name.startsWith('gh_bell')) bellSrc.add(o);
  const P = mergePrefab(g.scene.getObjectByName('statue')!), F = mergePrefab(src), C = mergePrefab(clapSrc), B = mergePrefab(bellSrc);
  const tex = (f: string) => { const t = new THREE.TextureLoader().load(`/game/${f}`); t.flipY = false; t.anisotropy = 4; return t; };   // glTF UVs
  // the figure's ring of fire: round, its flames touching the bounding box's sides and top (statue_build.py protect())
  const fig = mergeGeometries(P.groups.M_Nataraja)!; fig.computeBoundingBox(); const fb = fig.boundingBox!, R = (fb.max.x - fb.min.x) / 2;
  const ringC = new THREE.Vector3((fb.max.x + fb.min.x) / 2, fb.max.y - R, R);
  const cast = bronze({ normal: tex('nataraja_nor.webp'), ao: tex('nataraja_ao.webp'), cv: tex('nataraja_cv.webp') }, ringC, ringC.y + 0.48 * R), plinthStone = granite(0x86827b);
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a3e, metalness: 0.85, roughness: 0.32 });   // polished by every hand that rings it
  const plain = (gs: THREE.BufferGeometry[] = []) => gs.map((c) => { for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); return c; });
  const add = (parent: THREE.Object3D, gs: THREE.BufferGeometry[], m: THREE.Material, shadow = !low) => {
    const mesh = new THREE.Mesh(gs.length > 1 ? mergeGeometries(gs)! : gs[0], m); mesh.castShadow = shadow; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  add(statue, [fig], cast);                                                      // one draw call for the figure, one for all the granite
  const toStatue = statue.matrix.clone().invert().multiply(frame.matrix);
  add(statue, plain([...P.groups.M_Granite, ...(F.groups.M_Granite ?? []).map((c) => c.applyMatrix4(toStatue))]), plinthStone);
  add(frame, plain(F.groups.M_Brass), brass);                                    // the kalasha and the hook
  // the bell sways about the hook; the clapper, hung inside it, swings about its own pivot
  const bell = new THREE.Group(), clap = new THREE.Group(), grip = new THREE.Object3D(); bell.position.y = HOOK; clap.position.y = CLAP - HOOK; grip.position.y = TIP - CLAP;
  frame.add(bell); bell.add(clap); clap.add(grip);
  add(bell, plain(B.groups.M_Bronze).map((c) => c.translate(0, -HOOK, 0)), brass, false);
  add(clap, plain(C.groups.M_Bronze).map((c) => c.translate(0, -CLAP, 0)), brass, false);
  // before the pedestal: the lingam where the water is poured, the offerings to its left, then the priest's ground
  const FZ = PED[1] + 0.95, lg = lingam(), lp = local(0, FZ); lg.mesh.position.set(0, top(lp.x, lp.z) - base - 0.03, FZ); statue.add(lg.mesh);
  const offer = offering(), op = local(-0.85, FZ - 0.1); offer.position.set(-0.85, top(op.x, op.z) - base, FZ - 0.1); statue.add(offer);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()), q = new THREE.Quaternion();
  for (const [o, boxes] of [[statue, P.boxes], [frame, F.boxes]] as const) {     // COL_* boxes -> colliders, turned with their prefab
    q.setFromAxisAngle(Y, o.rotation.y);
    for (const b of boxes) {
      const c = b.getCenter(new THREE.Vector3()).applyQuaternion(q).add(o.position), s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      world.createCollider(RAPIER.ColliderDesc.cuboid(s.x, s.y, s.z).setTranslation(c.x, c.y, c.z).setRotation(q), body);
    }
  }

  // incense smoke: a thin, slow column of soft puffs, each one rising, widening and fading on a loop
  const n = low ? 8 : 16, smoke = puffs(n, new THREE.Color(0xe9e5df)), tip = statue.localToWorld(new THREE.Vector3(offer.position.x + 0.48, offer.position.y + 0.36, offer.position.z + 0.05));
  scene.add(smoke.pts);
  let now = 0, rung = -99, struck = 0, onStrike: ((k: number) => void) | null = null;
  const mat = local(-1.5, FZ + 1.6), aarti = local(0, FZ + 1.0), face = yaw + Math.PI;
  const spot = (p: THREE.Vector3, yw: number) => ({ x: p.x, z: p.z, yaw: yw, y: top(p.x, p.z) });
  return {
    bell: frame.localToWorld(new THREE.Vector3(0, 1.5, 0.6)), bellYaw: fYaw + Math.PI,   // in front of the gateway; you face the bell to ring it
    /** where to stand to reach the clapper (under it, a little in front) */
    ringStand: frame.localToWorld(new THREE.Vector3(0, 0, 0.36)),  // a little in front: he reaches up and forward, elbow bent
    /** the clapper's tongue, where the hand holds it (world space, this frame) */
    grip: (out: THREE.Vector3) => grip.getWorldPosition(out),
    statue: new THREE.Vector3(sx, base, sz), yaw,
    /** the bell gateway's foot and the way it faces (shrine_decor.ts hangs garlands on it) */
    gate: { x: frame.position.x, y: frame.position.y, z: frame.position.z, yaw: fYaw },
    /** Pandit Shankar's mat, to one side, turned towards the image; where he stands for the aarti; the lingam's rounded top */
    shrine: { priestSpot: spot(mat, Math.atan2(sx - mat.x, sz - mat.z)), aartiSpot: spot(aarti, face), lingam: statue.localToWorld(new THREE.Vector3(0, lg.mesh.position.y + lg.top, FZ)) },
    /** the hand has the clapper: strike on RING.strikes (calling back on each), then let it swing free */
    ring: (strike: (k: number) => void) => { rung = now; struck = 0; onStrike = strike; },
    update: (time: number) => {
      now = time;
      for (let i = 0; i < n; i++) {
        const f = (time * 0.16 + i / n) % 1, k = i * 3;
        smoke.pos[k] = tip.x + Math.sin(time * 0.7 + i * 2.3) * 0.07 * f + f * 0.12; smoke.pos[k + 1] = tip.y + f * 1.3; smoke.pos[k + 2] = tip.z + Math.cos(time * 0.5 + i * 1.7) * 0.07 * f;
        smoke.size[i] = 0.04 + f * 0.22; smoke.alpha[i] = 0.3 * Math.sin(f * Math.PI) * (1 - 0.4 * f);
      }
      smoke.dirty();
      const t = time - rung; if (t > 7) return;
      // the clapper, flicked side to side by its tongue: the ball meets one wall, then the other (0.55 rad), on each of
      // RING.strikes; it rushes through the middle and lingers at the walls. Let go, it swings itself still.
      let a = 0, b = 0;
      const S = RING.strikes, P = S[1] - S[0], last = S[S.length - 1], side = (k: number) => (k % 2 ? -1 : 1);
      if (t > S[0] - P / 2 && t <= last) { const c = Math.cos(Math.PI * (t - S[0]) / P); a = 0.55 * Math.sign(c) * Math.abs(c) ** 0.6; }
      else if (t > last) { const u = t - last; a = 0.55 * side(S.length - 1) * Math.exp(-2.5 * u) * Math.cos(7 * u); }
      while (struck < S.length && t >= S[struck]) onStrike?.(struck++);
      S.forEach((s0, k) => { if (t > s0) { const u = t - s0; b += side(k) * 0.05 * Math.exp(-1.1 * u) * Math.sin(4.6 * u); } });   // each stroke rocks the bell on its chain
      clap.rotation.z = a; bell.rotation.z = b;                                  // across the ringer's view, so every stroke shows
    },
  };
}
