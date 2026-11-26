import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { dressPond, stoneGeometry } from './pond';
import { edgePoint, heightfieldData, terrainMesh, type Outline, type Terrain } from './terrain';
import { toFloat } from './prefab';

export type Spot = { x: number; y: number; z: number; yaw: number };
export type Island = {
  size: number; n: number; spawn: { x: number; z: number; yaw: number }; spots: Record<string, Spot>; paths: [number, number][][];
  outline: Outline; stairs: { a: [number, number, number]; b: [number, number, number]; w: number; terrace: number }; stream: [number, number, number][]; islets: { x: number; z: number; r: number; y: number }[];
  bridges: { a: [number, number, number]; b: [number, number, number] }[]; rim: [number, number][];
  houses: [number, number, number][]; props: Record<string, [number, number, number][]>; groves: Record<string, [number, number, number]>;
  /** the koi pond's shore (radius waves round the layout angle, x stretched by zs) and water level; the spring's pool [x, z, r] */
  pond?: { r: number; waves: number[][]; zs: number; y: number }; spring?: [number, number, number];
};
export const CLOUD_Y = -38;
const LIT = new THREE.Color(1.0, 0.9, 0.86), SHADE = new THREE.Color(0.58, 0.6, 0.74);   // dawn-lit cloud tops, lavender shade

const NOISE = `
float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

/** textures projected along three axes: rough rock and domed tops look right from every side */
export function triplanar(name: string, tint: number, scale: number, moss = false, grey = 0) {
  const tex = new THREE.TextureLoader().load(`/game/tex/${name}_diff.webp`);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.95 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTex = { value: tex };
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vec4 wp4 = vec4(transformed, 1.0); vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;
  #endif
  vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform sampler2D uTex;${moss ? NOISE : ''}`)
      .replace('#include <map_fragment>', `vec3 bw = pow(abs(vWN), vec3(4.0)); bw /= bw.x + bw.y + bw.z;
vec3 tx = texture2D(uTex, vWP.zy / ${scale.toFixed(1)}).rgb * bw.x + texture2D(uTex, vWP.xz / ${scale.toFixed(1)}).rgb * bw.y + texture2D(uTex, vWP.xy / ${scale.toFixed(1)}).rgb * bw.z;
diffuseColor.rgb *= mix(tx, vec3(dot(tx, vec3(0.3, 0.59, 0.11))), ${grey.toFixed(2)});${moss ? `
  // moss settles on what faces the sky, in soft patches that creep down the sides: no hard line round the stone
  vec2 mp = vWP.xz * 1.7 + vWP.y * 0.9; float mn = vnoise(mp) * 0.65 + vnoise(mp * 2.7 + 5.3) * 0.35, mo = smoothstep(0.45, 0.9, vWN.y + (mn - 0.5) * 0.8) * smoothstep(0.35, 0.65, mn + vWN.y * 0.25);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.19, 0.07) * (0.7 + 0.6 * mn), mo * 0.8);` : ''}`);
  };
  m.customProgramCacheKey = () => `tri-${name}-${scale}-${moss}-${grey}`;
  m.userData.tex = tex;
  return m;
}

/** a sagging plank bridge with rope rails, solid enough to walk across. Heavy anchor posts at both ends carry the rails;
 * where the ground falls away under the deck before the drop, trestle bents hold it up (nothing hangs in the air) */
function ropeBridge(scene: THREE.Scene, world: RAPIER.World, t: Terrain, a: THREE.Vector3, b: THREE.Vector3, wood: THREE.Material) {
  const len = a.distanceTo(b), sag = len * 0.045, n = Math.ceil(len / 0.42);
  const at = (u: number) => new THREE.Vector3().lerpVectors(a, b, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));
  const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z);
  const boxes: THREE.Matrix4[] = [], e = new THREE.Euler(), up = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const box = (p: THREE.Vector3, sx: number, sy: number, sz: number, q = up) => boxes.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(sx, sy, sz)));
  const post = (p: THREE.Vector3, y0: number, y1: number, w: number) => box(p.clone().setY((y0 + y1) / 2), w, y1 - y0, w);
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = at(u), d = at(Math.min(1, u + 0.01)).sub(at(Math.max(0, u - 0.01)));
    box(p, 1.7, 0.07, 0.34, new THREE.Quaternion().setFromEuler(e.set(-Math.atan2(d.y, Math.hypot(d.x, d.z)), yaw, (i % 3 - 1) * 0.02, 'YXZ')));
    if (i % 4 || i === 0) continue;                                       // a trestle bent wherever there's ground a little way under the deck
    const ahead = p.clone().addScaledVector(dir, 0.9), g = Math.min(t.heightAt(p.x, p.z), t.heightAt(ahead.x, ahead.z));
    if (g < -50 || p.y - g < 0.3 || p.y - g > 4) continue;
    for (const s of [-1, 1]) post(p.clone().addScaledVector(side, s * 0.72), g - 0.5, p.y - 0.04, 0.14);
    box(p.clone().setY(p.y - 0.13), 1.75, 0.14, 0.16);
    const mid = p.clone().setY((g + p.y) / 2 - 0.1), h = p.y - g - 0.3;
    box(mid, Math.hypot(1.44, h), 0.08, 0.08, new THREE.Quaternion().setFromEuler(e.set(0, yaw, Math.atan2(h, 1.44), 'YXZ')));   // a brace across the bent
  }
  for (const [p, ground] of [[a, a.y - 0.06], [b, b.y - 0.06]] as const)   // anchor posts sunk into the ground at both ends, a beam between them
    for (const s of [-1, 1]) { const q = p.clone().addScaledVector(side, s * 1.0); post(q, ground - 0.7, p.y + 1.3, 0.24); box(q.clone().setY(p.y + 1.33), 0.3, 0.06, 0.3); }
  const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wood, boxes.length);
  boxes.forEach((m, i) => planks.setMatrixAt(i, m));
  planks.castShadow = planks.receiveShadow = true; planks.computeBoundingSphere(); scene.add(planks);
  // rope rails from anchor to anchor and hangers down to the deck edge, merged into one mesh
  const ropes: THREE.BufferGeometry[] = [], body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (const s of [-1, 1]) {
    const rail = Array.from({ length: 33 }, (_, i) => at(i / 32).addScaledVector(side, s * 0.97).add(new THREE.Vector3(0, 1.22 - 0.3 * 4 * (i / 32) * (1 - i / 32), 0)));
    ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail), 64, 0.035, 5));
    for (let i = 2; i <= 30; i += 4) ropes.push(new THREE.TubeGeometry(new THREE.LineCurve3(at(i / 32).addScaledVector(side, s * 0.85), rail[i]), 1, 0.02, 4));
  }
  scene.add(new THREE.Mesh(mergeGeometries(ropes)!, new THREE.MeshLambertMaterial({ color: 0x8a7352 })));
  // deck and waist-high side walls in short straight pieces along the sag
  const segs = Math.ceil(len / 1.5);
  for (let i = 0; i < segs; i++) {
    const p0 = at(i / segs), p1 = at((i + 1) / segs), c = p0.clone().add(p1).multiplyScalar(0.5), d = p1.clone().sub(p0);
    const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.atan2(d.y, Math.hypot(d.x, d.z)), yaw, 0, 'YXZ'));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.85, 0.08, d.length() / 2 + 0.05).setTranslation(c.x, c.y - 0.05, c.z).setRotation(rot), body);
    for (const s of [-1, 1]) {
      const w = c.clone().addScaledVector(side, s * 0.9);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.05, 0.6, d.length() / 2 + 0.05).setTranslation(w.x, w.y + 0.6, w.z).setRotation(rot), body);
    }
  }
}

/** the sea of clouds: a soft billowing layer the island floats in, an opaque floor below it, puffs drifting by the cliffs */
function clouds(scene: THREE.Scene, sunDir: THREE.Vector3, low: boolean) {
  const seaMat = (scale: number, drift: number, lo: number, hi: number, alpha: number) => new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uLit: { value: LIT }, uShade: { value: SHADE }, uSun: { value: sunDir.clone() } }]),
    fog: true, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float uTime; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uSun; varying vec3 vW;
#include <fog_pars_fragment>
${NOISE}
void main() {
  vec2 p = vW.xz * ${scale} + vec2(uTime * ${drift * 2}, uTime * ${drift});
  float n = fbm(p) * 0.75 + fbm(p * 0.23 + 3.1) * 0.25, lit = clamp(0.5 + (n - fbm(p + uSun.xz * 0.06)) * 10.0, 0.0, 1.0);
  gl_FragColor = vec4(mix(uShade * 0.9, uLit, lit), smoothstep(${lo}, ${hi}, n) * ${alpha.toFixed(2)});
#include <fog_fragment>
}`,
  });
  const sea = seaMat(0.011, 0.006, 0.3, 0.58, 1), top = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), sea); top.rotation.x = -Math.PI / 2; top.position.y = CLOUD_Y; scene.add(top);
  const wisp = low ? null : seaMat(0.021, 0.016, 0.52, 0.78, 0.55);                // a thinner, faster layer above it: the sea gets depth
  if (wisp) { const w = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), wisp); w.rotation.x = -Math.PI / 2; w.position.y = CLOUD_Y + 7; scene.add(w); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ color: SHADE.clone().lerp(LIT, 0.3) }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = CLOUD_Y - 10; scene.add(floor);
  // billboard puffs around the island, below the rim
  const puffMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLit: { value: LIT }, uShade: { value: SHADE } }]), fog: true, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; varying float vSeed;
#include <fog_pars_vertex>
varying float vA;
void main() { vUv = uv; vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float s = length(instanceMatrix[0].xyz); vSeed = c.x * 0.13 + c.z * 0.07;
  vA = length(instanceMatrix[2].xyz) / s;                                         // how solid this puff is
  vec4 mvPosition = viewMatrix * vec4(c, 1.0); mvPosition.xy += position.xy * vec2(s, length(instanceMatrix[1].xyz)); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform vec3 uLit; uniform vec3 uShade; varying vec2 vUv; varying float vSeed; varying float vA;
#include <fog_pars_fragment>
${NOISE}
void main() { vec2 q = vUv * 2.0 - 1.0; float n = fbm(vUv * 3.0 + vSeed);
  float a = smoothstep(1.0, 0.25, length(q) + (n - 0.5) * 0.6) * 0.75;
  gl_FragColor = vec4(mix(uShade, uLit, clamp(0.35 + q.y * 0.5 + n * 0.4, 0.0, 1.0)), a * vA);
#include <fog_fragment>
}`,
  });
  // rings of puffs: [angle, radius, height, size, solidity, drift]. Banks round the island, big ones on the horizon,
  // mist hanging round the rock under the island, and a thin morning mist just below the rim
  const seeds: [number, number, number, number, number, number][] = [], f = low ? 0.5 : 1;
  const ring = (n: number, r0: number, dr: number, y0: number, dy: number, s0: number, ds: number, solid: number, drift: number) => {
    n = Math.round(n * f); for (let i = 0; i < n; i++) seeds.push([(i / n) * Math.PI * 2 + Math.sin(i * 7.1) * 0.2, r0 + (i % 5) / 4 * dr, y0 + (i % 4) / 3 * dy, s0 + (i % 3) / 2 * ds, solid, drift]);
  };
  ring(34, 125, 72, CLOUD_Y + 6, 21, 38, 32, 1, 0.004);
  ring(24, 420, 380, CLOUD_Y + 8, 32, 160, 140, 0.9, 0.0015);
  ring(12, 28, 46, CLOUD_Y + 2, 14, 40, 22, 0.6, 0.006);
  ring(16, 66, 14, -2, 5, 26, 14, 0.32, 0.003);
  const puffs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puffMat, seeds.length), m = new THREE.Matrix4();
  puffs.frustumCulled = false; scene.add(puffs);
  return (time: number) => {
    sea.uniforms.uTime.value = time; if (wisp) wisp.uniforms.uTime.value = time;
    seeds.forEach(([a0, r, y, s, solid, drift], i) => { const a = a0 + time * drift; puffs.setMatrixAt(i, m.makeScale(s, s * 0.55, s * solid).setPosition(Math.cos(a) * r, y, Math.sin(a) * r * 1.1)); });
    puffs.instanceMatrix.needsUpdate = true;
  };
}

/** the edge dressed: mossy boulders half-sunk along the rim (they hide where grass meets cliff and keep you from
 * stumbling off) and roots hanging down the cliff; gaps are left for the pier, the rope bridge and the waterfall */
function rimDressing(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, rock: THREE.Material, low: boolean) {
  let sd = 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const o = I.outline, fall = I.stream[I.stream.length - 1], gaps = [[I.props.pier[0][0], I.props.pier[0][1], 5], [fall[0], fall[1], 6], ...I.bridges.map((b) => { const k = 4.2 / Math.hypot(b.b[0] - b.a[0], b.b[2] - b.a[2]); return [b.a[0] + (b.b[0] - b.a[0]) * k, b.a[2] + (b.b[2] - b.a[2]) * k, 3.2]; })];   // where the bridge leaves the rim
  const open = (x: number, z: number) => gaps.some(([gx, gz, gr]) => Math.hypot(x - gx, z - gz) < gr);
  const geo = stoneGeometry(7, low ? 1 : 2);
  const n = low ? 110 : 180, mats: THREE.Matrix4[] = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.05, [x, z] = edgePoint(o, th, 0.1 + r() * 0.6), [ix, iz] = edgePoint(o, th, -1.6);
    if (open(x, z) || Math.sin(th * 23) + Math.sin(th * 37) > 1.3) continue;                        // clusters and gaps, not a necklace
    const s = 0.7 + r() * 1.3, y = t.heightAt(ix, iz) - 0.45 - s * 0.35, sy = s * (0.55 + r() * 0.3);
    mats.push(m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set((r() - 0.5) * 0.4, r() * 6.28, (r() - 0.5) * 0.4)), new THREE.Vector3(s * (1 + r() * 0.5), sy, s * (1 + r() * 0.5))).clone());
    world.createCollider(RAPIER.ColliderDesc.ball(Math.max(sy, s * 0.8) * 0.85).setTranslation(x, y, z), body);
  }
  const rocks = new THREE.InstancedMesh(geo, rock, mats.length); mats.forEach((mm, i) => rocks.setMatrixAt(i, mm));
  rocks.receiveShadow = true; rocks.castShadow = !low; rocks.computeBoundingSphere(); scene.add(rocks);
  // roots and a little ivy hanging over the edge
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512; const c = cv.getContext('2d')!;
  for (let k = 0; k < 7; k++) {
    let x = 10 + r() * 108, y = 0; const len = 220 + r() * 290, drift = (r() - 0.5) * 60, ivy = r() < 0.5;
    for (let s2 = 0; s2 < 24; s2++) {
      const f = s2 / 24, nx = x + drift / 24 + Math.sin(f * 9 + k) * 2, ny = y + len / 24;
      c.strokeStyle = '#3a2a1e'; c.lineWidth = 5 * (1 - f) + 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
      if (ivy && s2 % 2) { c.fillStyle = s2 % 4 ? '#4e6b33' : '#5f7d3c'; c.beginPath(); c.ellipse(nx + (s2 % 4 ? 6 : -6), ny, 7, 4, s2 % 4 ? 0.6 : -0.6, 0, Math.PI * 2); c.fill(); }
      x = nx; y = ny;
    }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const cards: THREE.BufferGeometry[] = [];
  for (let th = 0; th < Math.PI * 2; th += 0.06 + r() * 0.08) {
    const [x, z] = edgePoint(o, th, 0.9), [ix, iz] = edgePoint(o, th, -1.6); if (open(x, z) || r() < 0.3) continue;
    const g = new THREE.PlaneGeometry(1.3, 4.2); g.translate(0, -2.1, 0); g.rotateY(Math.atan2(x, z)); g.translate(x, t.heightAt(ix, iz) - 0.5, z); cards.push(g);
  }
  const roots = new THREE.Mesh(mergeGeometries(cards)!, new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
  roots.receiveShadow = true; scene.add(roots);
}

/** The floating island: ground, rocky underside, islets, rope bridges, clouds. Returns the per-frame update. */
export async function buildIsland(scene: THREE.Scene, world: RAPIER.World, t: Terrain, loader: GLTFLoader, low: boolean, I: Island, sunDir: THREE.Vector3) {
  scene.add(terrainMesh(t, !low, low ? 2 : 1, I.outline));
  world.createCollider(RAPIER.ColliderDesc.heightfield(t.n - 1, t.n - 1, heightfieldData(t), { x: t.size, y: 1, z: t.size }));
  const rock = triplanar('rock_face_03', 0xb1a69c, 9, true), moss = triplanar('grass_path_2', 0x9cc98a, 6), wood = triplanar('weathered_brown_planks', 0xffffff, 2);
  const g = await loader.loadAsync('/game/island.glb'), solid = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    const top = mesh.name.includes('top'); mesh.material = top ? moss : rock; mesh.receiveShadow = true; mesh.castShadow = !low && top;
    if (top) {                                                                          // the islets' grassy tops are walkable
      const geo = toFloat(mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld), idx = geo.index!.array;
      world.createCollider(RAPIER.ColliderDesc.trimesh(geo.attributes.position.array as Float32Array, new Uint32Array(idx)), solid);
    }
  });
  scene.add(g.scene);
  for (const b of I.bridges) ropeBridge(scene, world, t, new THREE.Vector3(...b.a), new THREE.Vector3(...b.b), wood);
  const stones = triplanar('rock_face_03', 0xb5b0a6, 4, true, 0.75);                  // grey weathered stone, not the cliff's orange
  rimDressing(scene, world, t, I, stones, low); dressPond(scene, world, t, I, stones, low);
  const updateClouds = clouds(scene, sunDir, low);
  return updateClouds;
}
