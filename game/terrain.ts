import * as THREE from 'three';

// Heightmap made by game-assets/tools/make_island.py: header (n, size, hmin, hmax) then n*n uint16, row index = +Z, then the
// water: a count, that many cell indices and their water levels (same scale). Outside the island the height is -200 (the drop).
/** w: the water surface over each grid point near the stream and the pond (NaN elsewhere) */
export type Terrain = { n: number; size: number; h: Float32Array; w: Float32Array; heightAt: (x: number, z: number) => number; waterAt: (x: number, z: number) => number };

export async function loadTerrain(): Promise<Terrain> {
  const buf = await (await fetch('/game/island.bin')).arrayBuffer();
  const [n, size, hmin, hmax] = new Float32Array(buf, 0, 4);
  const q = new Uint16Array(buf, 16, n * n), sc = (hmax - hmin) / 65535;
  const h = new Float32Array(n * n), w = new Float32Array(n * n).fill(NaN);
  for (let i = 0; i < h.length; i++) h[i] = hmin + q[i] * sc;
  const o = 16 + 2 * n * n;
  if (buf.byteLength >= o + 4) {
    const m = new DataView(buf).getUint32(o, true), idx = new Uint32Array(buf.slice(o + 4, o + 4 + 4 * m)), lv = new Uint16Array(buf.slice(o + 4 + 4 * m, o + 4 + 6 * m));
    for (let i = 0; i < m; i++) w[idx[i]] = hmin + lv[i] * sc;
  }
  const cell = size / (n - 1);
  const bilerp = (a: Float32Array, x: number, z: number) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + size / 2) / cell)), fz = Math.min(n - 1.001, Math.max(0, (z + size / 2) / cell));
    const j = Math.floor(fx), i = Math.floor(fz), tx = fx - j, tz = fz - i, k = i * n + j;
    return (a[k] * (1 - tx) + a[k + 1] * tx) * (1 - tz) + (a[k + n] * (1 - tx) + a[k + n + 1] * tx) * tz;   // NaN if any corner is dry
  };
  return { n, size, h, w, heightAt: (x, z) => bilerp(h, x, z), waterAt: (x, z) => bilerp(w, x, z) };
}

/** Rapier wants the same grid column-major (rows along Z, columns along X). */
/** the island's edge as make_island.py draws it: a lumpy oval, radius a sum of waves around the (layout) angle */
export type Outline = { base: number; waves: number[][]; zs: number };
const edgeR = (o: Outline, th: number) => o.base + o.waves.reduce((s, [a, k, p]) => s + a * Math.sin(k * th + p), 0);
/** layout angle of a game-space point (the game mirrors the layout's x) */
export const edgeAngle = (o: Outline, x: number, z: number) => Math.atan2(z / o.zs, -x);
/** the edge point at a layout angle, pushed out (or in, if negative) by `out` metres */
export const edgePoint = (o: Outline, th: number, out = 0): [number, number] => { const r = edgeR(o, th) + out; return [-r * Math.cos(th), r * Math.sin(th) * o.zs]; };
export const insideEdge = (o: Outline, x: number, z: number) => Math.hypot(-x, z / o.zs) < edgeR(o, edgeAngle(o, x, z));

export function heightfieldData(t: Terrain) {
  const out = new Float32Array(t.n * t.n);
  for (let i = 0; i < t.n; i++) for (let j = 0; j < t.n; j++) out[j * t.n + i] = t.h[i * t.n + j];
  return out;
}

const LAYERS = ['rocky_terrain_02', 'grass_path_2', 'rock_face_03', 'rocky_trail'];   // soil, meadow, cliff (and flagstones), gravel and pebbles

/** step 2 on phones: every other grid point, a quarter of the triangles; physics keeps the full grid */
export function terrainMesh(t: Terrain, normals: boolean, step = 1, outline?: Outline) {
  const m = (t.n - 1) / step;
  const geo = new THREE.PlaneGeometry(t.size, t.size, m, m);
  geo.rotateX(-Math.PI / 2); // row 0 ends up at z = -size/2, matching the heightmap
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i <= m; i++) for (let j = 0; j <= m; j++) pos.setY(i * (m + 1) + j, t.h[i * step * t.n + j * step]);
  if (outline) {                                                           // grid points just past the edge slide onto the smooth outline: no stair-step
    const W = m + 1, inside = new Uint8Array(W * W);
    for (let v = 0; v < W * W; v++) inside[v] = pos.getY(v) > -50 && insideEdge(outline, pos.getX(v), pos.getZ(v)) ? 1 : 0;
    for (let i = 0; i < W; i++) for (let j = 0; j < W; j++) {
      const v = i * W + j; if (inside[v]) continue;
      let sum = 0, cnt = 0;
      for (let a = Math.max(0, i - 1); a <= Math.min(W - 1, i + 1); a++) for (let b = Math.max(0, j - 1); b <= Math.min(W - 1, j + 1); b++) if (inside[a * W + b]) { sum += pos.getY(a * W + b); cnt++; }
      if (!cnt) { pos.setY(v, -200); continue; }
      const [x, z] = edgePoint(outline, edgeAngle(outline, pos.getX(v), pos.getZ(v)));
      pos.setXYZ(v, x, sum / cnt - 0.35, z);
    }
  }
  geo.computeVertexNormals();
  const idx = geo.index!.array, keep: number[] = [];                       // drop triangles that touch the drop
  for (let i = 0; i < idx.length; i += 3) if (pos.getY(idx[i]) > -50 && pos.getY(idx[i + 1]) > -50 && pos.getY(idx[i + 2]) > -50) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  geo.setIndex(keep);
  const tl = new THREE.TextureLoader();
  const load = (f: string, color: boolean) => {
    const tx = tl.load(`/game/tex/${f}.webp`);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4;
    if (color) tx.colorSpace = THREE.SRGBColorSpace;
    return tx;
  };
  const splat = tl.load('/game/island_splat.png');
  const uniforms: Record<string, { value: unknown }> = { uSplat: { value: splat }, uSize: { value: t.size } };
  LAYERS.forEach((l, k) => {
    uniforms[`uD${k}`] = { value: load(`${l}_diff`, true) };
    if (normals) uniforms[`uN${k}`] = { value: load(`${l}_nor_gl`, false) };
  });
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    const decl = LAYERS.map((_, k) => `uniform sampler2D uD${k};${normals ? ` uniform sampler2D uN${k};` : ''}`).join('\n');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm; uniform sampler2D uSplat; uniform float uSize;
${decl}
// steep ground: sample along all three axes so slopes never smear
vec3 tri(sampler2D t, float k) {
  vec3 b = pow(abs(vWNrm), vec3(4.0)); b /= b.x + b.y + b.z;
  return texture2D(t, vWPos.zy / k).rgb * b.x + texture2D(t, vWPos.xz / k).rgb * b.y + texture2D(t, vWPos.xy / k).rgb * b.z;
}
float th1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 th2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float tn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(th1(i), th1(i + vec2(1, 0)), f.x), mix(th1(i + vec2(0, 1)), th1(i + vec2(1, 1)), f.x), f.y); }
// irregular flagstones: cells of a jittered 0.7 m grid; F2 - F1 is the distance to the joint. cid = the stone's cell
float flags(vec2 p, out vec2 cid) {
  vec2 g = p / 0.7, i = floor(g), f = fract(g); float d1 = 9.0, d2 = 9.0; cid = i;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), r = o + 0.2 + 0.6 * th2(i + o) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; cid = i + o; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
vec4 groundWeights() {
  vec4 sp = texture2D(uSplat, vWPos.xz / uSize + 0.5);
  float rock = smoothstep(0.9, 0.72, vWNrm.y);
  return vec4(sp.g * (1.0 - rock), rock, sp.r * (1.0 - rock), sp.b);      // meadow, cliff, stone path, gravel
}`)
      .replace('#include <map_fragment>', `
vec4 w = groundWeights();
float bankW = texture2D(uSplat, vWPos.xz / uSize + 0.5).a, nb = tn(vWPos.xz * 1.7);
vec2 uv = vWPos.xz / 6.0, uvr = vWPos.xz / 9.0;
vec3 base = tri(uD0, 6.0) * mix(0.85, 1.1, texture2D(uD0, vWPos.xz / 97.0).g);     // large-scale variation breaks tiling
vec3 col = base;
vec3 gravel = texture2D(uD3, vWPos.xz / 2.2).rgb * 0.92;
col = mix(col, gravel, smoothstep(0.25, 0.6, w.w + (nb - 0.5) * 0.35));               // gravel verges and building aprons
vec3 g1 = texture2D(uD1, uv).rgb;
col = mix(col, mix(g1 * vec3(0.72, 0.98, 0.56), vec3(0.15, 0.25, 0.08) * (0.7 + 0.6 * dot(g1, vec3(0.33))), 0.55), w.x);   // a green floor under the meadow: no brown soil between the blades
vec3 rk = tri(uD2, 14.0); col = mix(col, mix(vec3(dot(rk, vec3(0.3, 0.59, 0.11))), rk, 0.5), w.y);
// pebble banks along the water, darker and wetter towards the waterline and on the bed
float bk = smoothstep(0.45, 0.75, bankW + (nb - 0.5) * 0.5);
vec3 peb = texture2D(uD3, vWPos.xz / 1.1).rgb; peb = mix(vec3(dot(peb, vec3(0.3, 0.59, 0.11))), peb, 0.45) * vec3(0.92, 0.95, 0.88);   // grey river pebbles
peb = mix(peb, vec3(0.13, 0.18, 0.08) * (0.7 + 0.6 * nb), smoothstep(0.62, 0.45, bankW) * 0.55);   // moss creeping in at the dry edge
peb *= mix(1.0, 0.55, smoothstep(0.8, 1.0, bankW));                                // wet at the waterline and under it
col = mix(col, peb, bk);
float jointW = 0.0;
if (w.z > 0.02) {
  vec2 cid; float e = flags(vWPos.xz, cid);
  float inPath = step(0.45, texture2D(uSplat, (cid + 0.2 + 0.6 * th2(cid)) * 0.7 / uSize + 0.5).r);   // whole stones: in if their middle is on the path
  float aa = fwidth(e) * 1.5, stoneM = inPath * smoothstep(0.05, 0.05 + aa + 0.012, e);
  float pz = smoothstep(0.2, 0.45, w.z);
  vec3 joint = mix(gravel * 0.5, vec3(0.1, 0.14, 0.05) * (0.7 + 0.6 * nb), 0.6 * smoothstep(0.4, 0.75, tn(vWPos.xz * 3.1)));   // grit in the joints, moss here and there
  vec2 r2 = th2(cid + 3.7);
  vec3 sc = texture2D(uD2, vWPos.xz / 2.6 + r2 * 9.0).rgb;                              // weathered granite: each stone its own patch of the rock
  sc = mix(vec3(dot(sc, vec3(0.3, 0.59, 0.11))), sc, 0.25) * (0.95 + 0.35 * r2.x) * vec3(1.0, 0.98 + 0.04 * r2.y, 0.95 + 0.06 * r2.y);
  sc *= mix(0.72, 1.0, smoothstep(0.07, 0.3, e));                                   // worn, darker edges
  col = mix(col, joint, pz * (1.0 - stoneM));
  col = mix(col, sc, stoneM);
  jointW = max(pz * (1.0 - stoneM), stoneM);
}
col *= mix(0.68, 1.0, smoothstep(0.55, 0.97, vWNrm.y));   // steep faces and gullies sit darker
diffuseColor.rgb *= col;`);
    if (normals)
      s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_maps>', `
vec3 nm = texture2D(uN0, uv).xyz;
nm = mix(nm, texture2D(uN1, uv).xyz, w.x); nm = mix(nm, texture2D(uN2, uvr).xyz, w.y);
nm = mix(nm, texture2D(uN3, vWPos.xz / 2.2).xyz, w.w); nm = mix(nm, texture2D(uN3, vWPos.xz / 1.3).xyz, bk);
nm = mix(nm, texture2D(uN2, vWPos.xz / 2.6).xyz, jointW * 0.6);
nm = nm * 2.0 - 1.0;
vec3 wn = normalize(vWNrm + vec3(nm.x, 0.0, nm.y) * 0.6);
normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
