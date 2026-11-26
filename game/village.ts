import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergePrefab } from './prefab';
import type { Island } from './island';
import { insideEdge, type Terrain } from './terrain';
import { cardTexture, crossCards } from './flora';
import { decorPlaces, decorDressing, cookSmoke, washLines } from './decor';
import { marketStalls, buildDressing } from './market';

type Place = { id: string; x: number; z: number; yaw: number; y?: number };

/** textures projected along three axes, in world space */
function triplanar(name: string, tint: number, scale: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const tex = new THREE.TextureLoader().load(`/game/tex/${name}_diff.webp`);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.85, ...extra });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTex = { value: tex };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uTex;')
      .replace('#include <map_fragment>', `vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= bw.x + bw.y + bw.z; float k = ${(1 / scale).toFixed(3)};
diffuseColor.rgb *= texture2D(uTex, vWP.zy * k).rgb * bw.x + texture2D(uTex, vWP.xz * k).rgb * bw.y + texture2D(uTex, vWP.xy * k).rgb * bw.z;`);
  };
  m.customProgramCacheKey = () => `vtri-${name}-${scale}`;
  m.userData.tex = tex;
  return m;
}

/** dark fired-clay roof tiles: rounded columns down the slope and rows of tile ends, drawn from the roof UVs (metres) */
function roofTiles() {
  const m = new THREE.MeshStandardMaterial({ color: 0x3b4049, roughness: 0.55, metalness: 0.15 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvRU = uv;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRU;')
      .replace('#include <map_fragment>', `float col = abs(fract(vRU.x / 0.32) - 0.5) * 2.0, row = fract(vRU.y / 0.9);
diffuseColor.rgb *= mix(0.62, 1.08, 1.0 - col * col) * mix(0.7, 1.0, smoothstep(0.0, 0.12, row));`);
  };
  m.customProgramCacheKey = () => 'roof-tiles';
  return m;
}

/** lime plaster: broad soft patches and trowel marks (world-space value noise), faint vertical rain streaks, and grime
 * splashed up the foot of each wall (village_build.py bakes each piece's height above its own foot into 1 - uv.y) */
function plaster() {
  const m = new THREE.MeshStandardMaterial({ color: 0xe4dccb, roughness: 0.95 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vPW; varying float vPH;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPH = 1.0 - uv.y;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvPW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vPW; varying float vPH;
float pH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float pN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pH(i), pH(i + vec3(1, 0, 0)), f.x), mix(pH(i + vec3(0, 1, 0)), pH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(pH(i + vec3(0, 0, 1)), pH(i + vec3(1, 0, 1)), f.x), mix(pH(i + vec3(0, 1, 1)), pH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <map_fragment>', `float pa = pN(vPW * 0.7), pb = pN(vPW * 3.1 + 5.3), pc = pN(vec3((vPW.x + vPW.z) * 5.0, vPW.y * 0.45, 2.0));
diffuseColor.rgb *= (0.9 + 0.12 * pa) * (0.96 + 0.06 * pb) * (1.0 - 0.07 * smoothstep(0.6, 0.95, pc));
float gr = (1.0 - smoothstep(0.0, 1.2, vPH + 0.35 * (pb - 0.5))) * (0.75 + 0.25 * pa);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.55, 0.5, 0.42), gr * 0.7);`);
  };
  m.customProgramCacheKey = () => 'lime-plaster';
  return m;
}

/** the street props' material: colours come from the little palette texture the glb carries (one cell per colour) */
function palette(root: THREE.Object3D) {
  let map: THREE.Texture | null = null;
  root.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m?.name === 'M_Props' && m.map) map = m.map; });
  const tex = map as THREE.Texture | null;
  if (tex) { tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; }
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
}

/** The arched bridge stands on the lower of its two banks (its middle is over the stream bed). */
export const bridgeY = (t: Terrain, x: number, z: number, yaw: number) =>
  Math.min(t.heightAt(x + Math.sin(yaw) * 3.5, z + Math.cos(yaw) * 3.5), t.heightAt(x - Math.sin(yaw) * 3.5, z - Math.cos(yaw) * 3.5)) - 0.1;

/** Edo village from village.glb, placed by island.json; every material is one merged mesh (a handful of draw calls). */
export async function buildVillage(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, t: Terrain, I: Island, low: boolean) {
  const g = await loader.loadAsync('/game/village.glb'), decor = decorPlaces(t, I);
  // every building at its spot facing the way the layout says; hand-placed props from island.json
  const places: Place[] = [
    ...I.houses.map(([x, z, yaw], i) => ({ id: i % 2 ? 'house_b' : 'house_a', x, z, yaw })),
    ...['torii', 'pagoda', 'castle', 'gate', 'teahouse', 'post', 'smithy', 'workshop', 'sakura'].map((id) => ({ id, ...I.spots[id] })),
    ...['footbridge', 'arched_bridge', 'pier', 'lantern', 'firepit', 'bench'].flatMap((id) => I.props[id].map(([x, z, yaw]) => ({ id, x, z, yaw }))),
    ...(['post', 'workshop', 'smithy', 'teahouse'] as const).map((k) => ({ id: `wares_${k === 'teahouse' ? 'tea' : k}`, ...I.spots[k] })),   // each stall's wares, in its frame
    ...marketStalls(I, t).map((s) => ({ id: `stall_${s.id}`, x: s.x, z: s.z, yaw: s.yaw })),                // the market corner in the square
    ...decor,
  ];
  const pier = places.find((p) => p.id === 'pier')!; pier.y = t.heightAt(pier.x, pier.z + 1) + 0.1;
  for (const b of places) if (b.id === 'arched_bridge') b.y = bridgeY(t, b.x, b.z, b.yaw);
    // the plank footbridge rests on its lower bank, not on the stream bed under its middle
    else if (b.id === 'footbridge') b.y = Math.min(t.heightAt(b.x + Math.sin(b.yaw) * 2.6, b.z + Math.cos(b.yaw) * 2.6), t.heightAt(b.x - Math.sin(b.yaw) * 2.6, b.z - Math.cos(b.yaw) * 2.6)) - 0.12;
  const wood = triplanar('weathered_brown_planks', 0xa48874, 1.6), mats: Record<string, THREE.Material> = {
    M_DarkWood: wood, M_Wood: triplanar('weathered_brown_planks', 0xd8b48e, 1.6), M_Roof: roofTiles(),
    M_Plaster: plaster(), M_Vermilion: new THREE.MeshStandardMaterial({ color: 0xc4472f, roughness: 0.55 }),
    M_Stone: triplanar('medieval_blocks_03', 0xb4afa6, 2.2), M_Gold: new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.9, roughness: 0.3 }),
    M_Paper: new THREE.MeshStandardMaterial({ color: 0xf4ead4, emissive: 0xffc98a, emissiveIntensity: 0.35, roughness: 0.9, side: THREE.DoubleSide }),
    M_Indigo: new THREE.MeshStandardMaterial({ color: 0x1e2c5e, roughness: 0.95, side: THREE.DoubleSide }), M_Iron: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, metalness: 0.6, roughness: 0.5 }),
    M_Ember: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a20).multiplyScalar(2.2) }), M_Red: new THREE.MeshStandardMaterial({ color: 0xb3241e, roughness: 0.8, side: THREE.DoubleSide }),
    M_Bark: new THREE.MeshStandardMaterial({ color: 0x4d3a30, roughness: 1 }), M_Props: palette(g.scene), M_Bamboo: new THREE.MeshStandardMaterial({ color: 0xb59e66, roughness: 0.8 }), M_Blossom: new THREE.MeshStandardMaterial({ color: 0xe9a9bb, roughness: 1, emissive: 0x7a3a4a, emissiveIntensity: 0.2 }),
  };
  const ROOFED = new Set(['house_a', 'house_b', 'pagoda', 'castle', 'teahouse', 'post', 'smithy', 'workshop']), roofs = new Map<object, THREE.Box3 | null>();
  const roofBox = (pf: ReturnType<typeof mergePrefab>) => {
    if (!roofs.has(pf)) {
      const all = new THREE.Box3(); for (const gs of Object.values(pf.groups)) for (const geo of gs) { geo.computeBoundingBox(); all.union(geo.boundingBox!); }
      const top = Math.max(...pf.boxes.map((b) => b.max.y));
      roofs.set(pf, pf.boxes.length && all.max.y > top + 0.3 ? new THREE.Box3(new THREE.Vector3(all.min.x, top, all.min.z), all.max.clone()) : null);
    }
    return roofs.get(pf)!;
  };
  const prefabs = new Map<string, ReturnType<typeof mergePrefab>>(), byMat: Record<string, THREE.BufferGeometry[]> = {};
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  for (const p of places) {
    let pf = prefabs.get(p.id);
    if (!pf) { pf = mergePrefab(g.scene.getObjectByName(p.id)!); prefabs.set(p.id, pf); }
    const y = p.y ?? t.heightAt(p.x, p.z) - 0.05;
    m4.compose(new THREE.Vector3(p.x, y, p.z), q.setFromAxisAngle(Y, p.yaw), new THREE.Vector3(1, 1, 1));
    for (const [name, gs] of Object.entries(pf.groups)) for (const geo of gs) {
      const c = geo.clone().applyMatrix4(m4);
      for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
      if (!c.getAttribute('uv')) c.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
      (byMat[name] ??= []).push(c.index ? c.toNonIndexed() : c);
    }
    // a roofed building's COL boxes stop at the walls; over them goes a sensor box round the roof, which the camera's ray
    // stops at (sensors don't block walking, animals or the boat) so it never ends up inside a roof
    const roof = ROOFED.has(p.id) ? roofBox(pf) : null;
    for (const b of roof ? [...pf.boxes, roof] : pf.boxes) {                      // COL_* boxes -> colliders, turned with the prefab
      const c = b.getCenter(new THREE.Vector3()).applyQuaternion(q).add(new THREE.Vector3(p.x, y, p.z)), s = b.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      world.createCollider(RAPIER.ColliderDesc.cuboid(s.x, s.y, s.z).setTranslation(c.x, c.y, c.z).setRotation(q).setSensor(b === roof), body);
    }
  }
  for (const p of places) if (p.id === 'arched_bridge') bridgeWalk(world, body, t, p as Required<Place>, byMat);
  // the sakura's crown: soft petal-cluster cards scattered over the blossom clumps, so it reads fluffy, not faceted
  const bloom = byMat.M_Blossom ? mergeGeometries(byMat.M_Blossom)! : null;
  if (bloom) {
    let k = 3; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647), pos = bloom.attributes.position, n = low ? 160 : 320;
    const tex = cardTexture((c) => {
      for (let i = 0; i < 70; i++) {
        const a = r() * 6.283, d = Math.sqrt(r()) * 54, x = 64 + Math.cos(a) * d, y = 64 + Math.sin(a) * d;
        c.fillStyle = `hsl(${340 + r() * 18}, ${55 + r() * 25}%, ${80 + r() * 12}%)`; c.beginPath(); c.arc(x, y, 4 + r() * 4, 0, 6.283); c.fill();
      }
    });
    const cards = new THREE.InstancedMesh(crossCards(1.5, 1.5, -0.75), new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x6a3442 }), n);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, Math.floor(r() * pos.count)); cards.setMatrixAt(i, m4.compose(v, q.setFromAxisAngle(Y, r() * 6.283), new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + r() * 0.6))); }
    cards.computeBoundingSphere(); scene.add(cards);
  }
  for (const [name, gs] of Object.entries(byMat)) {
    const mesh = new THREE.Mesh(name === 'M_Blossom' ? bloom! : mergeGeometries(gs)!, mats[name] ?? wood);
    mesh.castShadow = !low && name !== 'M_Ember'; mesh.receiveShadow = true; scene.add(mesh);
  }
  castleTerrace(scene, world, t, I, mats.M_Stone, body);
  buildDressing(scene, t, I, low, (k) => decorDressing(k, t, I));              // signs, noren, awnings, lanterns, washing: one swaying mesh
  cookSmoke(scene, t, I, decor, low);
  // the laundry is solid: a thin box along each line from the hems (about 1.35 m up) to the rope, so the ronin walks round it
  for (const [a, b] of washLines(t, I)) {
    const len = Math.hypot(b.x - a.x, b.z - a.z), foot = (a.y + b.y) / 2 - 2.5;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.12, 0.55, len * 0.45).setTranslation((a.x + b.x) / 2, foot + 1.95, (a.z + b.z) / 2)
      .setRotation(q.setFromAxisAngle(Y, Math.atan2(b.x - a.x, b.z - a.z))), body);
  }
}

/** The red arched bridge on the ground it actually meets: where an end stands above the path (the prefab sits on the lower
 * bank) a stone abutment goes under it and a cleated plank ramp runs down to the ground (merged into the village's wood and
 * stone, no extra draws). Colliders: the deck as 14 short slabs whose tops follow the arch (each joint turns < 6 degrees,
 * the ends ~37 degrees, under the walker's 48 degree climb limit), the ramps, and a solid wall under each handrail from below
 * the deck to rail height, so you go up and over, never through the side. Matches arched_bridge() in village_build.py. */
function bridgeWalk(world: RAPIER.World, body: RAPIER.RigidBody, t: Terrain, p: Required<Place>, byMat: Record<string, THREE.BufferGeometry[]>) {
  const SPAN = 7, W = 1.8, RISE = 1.3, f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)), side = new THREE.Vector3(f.z, 0, -f.x);
  const top = (s: number) => p.y + RISE * (1 - (2 * s / SPAN) ** 2) + 0.2;             // deck top at s metres along the bridge
  const at = (s: number, y: number, lat = 0) => new THREE.Vector3(p.x, y, p.z).addScaledVector(f, s).addScaledVector(side, lat);
  const g = (s: number) => t.heightAt(p.x + f.x * s, p.z + f.z * s), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1), qq = new THREE.Quaternion(), e = new THREE.Euler();
  const slab = (s0: number, y0: number, s1: number, y1: number, hw: number, th: number, wall = false) => {   // a cuboid whose top runs from (s0, y0) to (s1, y1)
    if (s1 < s0) [s0, y0, s1, y1] = [s1, y1, s0, y0];
    const len = Math.hypot(s1 - s0, y1 - y0), pitch = Math.atan2(y1 - y0, s1 - s0), c = at((s0 + s1) / 2, (y0 + y1) / 2 - th / Math.cos(pitch));
    qq.setFromEuler(e.set(-pitch, p.yaw, 0, 'YXZ'));
    if (!wall) world.createCollider(RAPIER.ColliderDesc.cuboid(hw, th, len / 2 + 0.02).setTranslation(c.x, c.y, c.z).setRotation(qq), body);
    else for (const sd of [-1, 1]) {                                                 // the rail walls: from 0.6 under the deck top to 1.0 over it
      const w = c.clone().addScaledVector(side, sd * (W / 2 + 0.03)).add(new THREE.Vector3(0, th / Math.cos(pitch) + 0.2, 0));
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.07, 0.8, len / 2 + 0.02).setTranslation(w.x, w.y, w.z).setRotation(qq), body);
    }
    return { c, len, q: qq.clone() };
  };
  const N = 14;
  for (let i = 0; i < N; i++) { const s0 = -SPAN / 2 + (SPAN * i) / N, s1 = -SPAN / 2 + (SPAN * (i + 1)) / N; slab(s0, top(s0), s1, top(s1), W / 2, 0.2); slab(s0, top(s0), s1, top(s1), W / 2, 0.2, true); }
  const geo = (b: THREE.BufferGeometry, mat: string) => { b.deleteAttribute('uv'); b.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.attributes.position.count * 2), 2)); (byMat[mat] ??= []).push(b.toNonIndexed()); };
  for (const k of [-1, 1]) {
    const sE = (k * SPAN) / 2, yE = top(sE), h = yE - g(sE + k * 0.8);
    if (h < 0.08) continue;                                                          // this end is already down on its bank
    const L = Math.min(2.6, Math.max(0.6, h / Math.tan(0.38))), yG = g(sE + k * L) - 0.03;
    if (yE - yG < 0.08) continue;
    const r = slab(sE, yE, sE + k * L, yG, W / 2 - 0.1, 0.12);                       // the ramp (it walks like the deck)
    geo(new THREE.BoxGeometry(W - 0.2, 0.1, r.len + 0.15).applyMatrix4(m.compose(r.c.clone().add(new THREE.Vector3(0, 0.07, 0)), r.q, one)), 'M_Wood');
    for (let j = 1; j <= Math.floor(r.len / 0.4); j++) {                             // cleats across it, for footing
      const s = sE + k * (j * 0.4) * (L / r.len), cy = yE + (yG - yE) * ((s - sE) / (k * L));
      geo(new THREE.BoxGeometry(W - 0.25, 0.04, 0.06).applyMatrix4(m.compose(at(s, cy + 0.015), r.q, one)), 'M_DarkWood');
    }
    const gl = Math.min(g(sE), g(sE + k * 0.3)) - 0.35, hh = yE - 0.2 - gl;          // the stone abutment the deck end rests on
    if (hh > 0.05) geo(new THREE.BoxGeometry(W + 0.3, hh, 0.55).applyMatrix4(m.compose(at(sE - k * 0.12, gl + hh / 2), qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), one)), 'M_Stone');
  }
}

/** The castle terrace: a battered stone wall round the flat hilltop (its foot follows the real ground, so it never
 * floats) with a gap where stone stairs climb from the gate. The stairs get one smooth ramp collider to walk on. */
function castleTerrace(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, stone: THREE.Material, body: RAPIER.RigidBody) {
  const C = I.spots.castle, S = I.stairs, R0 = S.terrace, yT = C.y, tris: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tris.push(...a.toArray(), ...c.toArray(), ...b.toArray(), ...a.toArray(), ...d.toArray(), ...c.toArray());   // wound to face outwards and up
  const sa = Math.atan2(S.b[2] - C.z, S.b[0] - C.x), gap = (S.w / 2 + 0.5) / R0, n = 48;
  const at = (a: number, r: number, y: number) => new THREE.Vector3(C.x + Math.cos(a) * r, y, C.z + Math.sin(a) * r);
  const ground = (a: number, r: number) => { const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r; return insideEdge(I.outline, x, z) ? t.heightAt(x, z) : Infinity; };
  // buried a little below the real ground; where the terrace comes near the island's edge only ground on the island counts
  // (else the wall hung down past the cliff top as a bare slab)
  const foot = (a: number) => { const g = Math.min(ground(a, R0 + 1.2), ground(a, R0 + 2.4)); return Math.max(yT - 12, (g < Infinity ? g : yT - 0.4) - 0.6); };
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, mid = (a0 + a1) / 2;
    if (Math.abs(Math.atan2(Math.sin(mid - sa), Math.cos(mid - sa))) < gap) continue;                       // the stairs come up here
    const f0 = foot(a0), f1 = foot(a1);
    quad(at(a0, R0, yT + 0.08), at(a0, R0 + 1.4, f0), at(a1, R0 + 1.4, f1), at(a1, R0, yT + 0.08));           // the battered face
    quad(at(a0, R0 - 0.5, yT + 0.08), at(a0, R0, yT + 0.08), at(a1, R0, yT + 0.08), at(a1, R0 - 0.5, yT + 0.08)); // coping stones on top
  }
  // stairs: one step per ~0.3 m of rise on the even ramp make_island.py cut (each tread's nose a little rounded off), between
  // two smooth sloping stone cheek walls with a coping on top (a single slab a side, not a sawtooth of blocks)
  const A = new THREE.Vector3(...S.a), B = new THREE.Vector3(...S.b), d = new THREE.Vector3(B.x - A.x, 0, B.z - A.z), L = d.length(); d.normalize();
  const side = new THREE.Vector3(-d.z, 0, d.x), rise = B.y - A.y, steps = Math.ceil(rise / 0.3), tread = L / steps, riser = rise / steps;
  const boxes: THREE.BufferGeometry[] = [], yaw = Math.atan2(d.x, d.z), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < steps; k++) {
    const c = A.clone().addScaledVector(d, tread * (k + 0.5)), top = A.y + riser * (k + 1);
    boxes.push(new THREE.BoxGeometry(S.w, riser + 0.7, tread + 0.04).applyMatrix4(m.compose(c.clone().setY(top - (riser + 0.7) / 2), q, one)));
    boxes.push(new THREE.CylinderGeometry(0.06, 0.06, S.w, 6, 1).rotateZ(Math.PI / 2).applyMatrix4(m.compose(c.clone().addScaledVector(d, -tread / 2 + 0.03).setY(top - 0.05), q, one)));
  }
  const pitch = Math.atan2(rise, L), sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')), len = Math.hypot(L, rise) + 0.5;
  const mid0 = A.clone().add(B).multiplyScalar(0.5);
  for (const s2 of [-1, 1]) {
    const at = mid0.clone().addScaledVector(side, s2 * (S.w / 2 + 0.24));
    boxes.push(new THREE.BoxGeometry(0.48, 1.6, len).applyMatrix4(m.compose(at.clone().setY(at.y - 0.2), sq, one)));                                     // top ~0.6 above the step line
    boxes.push(new THREE.BoxGeometry(0.58, 0.12, len).applyMatrix4(m.compose(at.clone().setY(at.y + 0.64), sq, one)));                                   // coping stones
  }
  const wall = new THREE.BufferGeometry(); wall.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3)); wall.computeVertexNormals();
  const geos = [wall, ...boxes.map((g) => g.toNonIndexed())]; for (const g of geos) { g.deleteAttribute('uv'); if (!g.getAttribute('normal')) g.computeVertexNormals(); }
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, stone); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  // walk up a smooth slope through the step middles
  const mid = A.clone().add(B).multiplyScalar(0.5).add(new THREE.Vector3(0, riser * 0.5 - 0.15, 0));
  const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ'));
  world.createCollider(RAPIER.ColliderDesc.cuboid(S.w / 2, 0.15, Math.hypot(L, rise) / 2 + 0.3).setTranslation(mid.x, mid.y, mid.z).setRotation(rq), body);
}
