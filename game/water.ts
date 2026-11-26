import * as THREE from 'three';
import type { Island } from './island';
import type { Terrain } from './terrain';
import { CLOUD_Y } from './island';

const RIPPLE = `
float wh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }`;

let T: Terrain | null = null;
/** how deep the water is over a point (0 on dry land): the ronin wades in the shallows, the pond's middle is walled off */
export function waterDepthAt(x: number, z: number) {
  if (!T) return 0;
  const w = T.waterAt(x, z); return w === w ? Math.max(0, w - T.heightAt(x, z)) : 0;
}

/** One sheet of water for the spring, the stream and the koi pond, laid on the levels make_island.py carved: it meets
 * the banks wherever the water does, fading out where it thins to nothing (no hard edges, no seams at the stream's
 * mouth). Ripples run with the flow (along the stream, still in the pond), the colour deepens with the depth. */
function waterSheet(t: Terrain, I: Island, time: { value: number }) {
  const { n, size, h, w } = t, cell = size / (n - 1), S = I.stream, P = I.spots.pond, k0 = S.findIndex(([x, z]) => x === P.x && z === P.z);
  // the flow: along the stream's course, easing to stillness in the spring and across the pond, quicker below it
  const flowAt = (x: number, z: number): [number, number] => {
    let best = Infinity, dx = 0, dz = 0, seg = 0;
    for (let i = 0; i < S.length - 1; i++) {
      const [ax, az] = S[i], ex = S[i + 1][0] - ax, ez = S[i + 1][1] - az, l2 = ex * ex + ez * ez, u = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const d = (ax + ex * u - x) ** 2 + (az + ez * u - z) ** 2; if (d < best) { best = d; dx = ex; dz = ez; seg = i; }
    }
    const l = Math.hypot(dx, dz) || 1, pd = Math.hypot((x - P.x) / 1.35, z - P.z), src = Math.hypot(x - S[0][0], z - S[0][1]);
    const sp = (seg >= k0 ? 0.9 : 0.55) * THREE.MathUtils.smoothstep(pd, 5.5, 9) * THREE.MathUtils.smoothstep(src, 1.2, 4);
    return [(dx / l) * sp, (dz / l) * sp];
  };
  const vid = new Int32Array(n * n).fill(-1), pos: number[] = [], dep: number[] = [], flow: number[] = [], idx: number[] = [];
  for (let k = 0; k < n * n; k++) {
    if (w[k] !== w[k] || h[k] < -50) continue;
    const x = -size / 2 + (k % n) * cell, z = -size / 2 + Math.floor(k / n) * cell;
    vid[k] = pos.length / 3; pos.push(x, w[k], z); dep.push(w[k] - h[k]); flow.push(...flowAt(x, z));
  }
  // the terrain's own split of each cell, so the depth between the corners is exact and the shore falls where the banks are
  const tri = (a: number, b: number, c: number) => { if (vid[a] >= 0 && vid[b] >= 0 && vid[c] >= 0 && Math.max(dep[vid[a]], dep[vid[b]], dep[vid[c]]) > -0.04) idx.push(vid[a], vid[b], vid[c]); };
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const k = i * n + j; tri(k, k + n, k + 1); tri(k + n, k + n + 1, k + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aDepth', new THREE.Float32BufferAttribute(dep, 1));
  g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, envMapIntensity: 1.1, transparent: true, depthWrite: false });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDepth; attribute vec2 aFlow; varying float vDepth; varying vec2 vFlow; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vDepth = aDepth; vFlow = aFlow;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vDepth; varying vec2 vFlow; varying vec3 vWP; uniform float uTime;${RIPPLE}
// the noise's slope, worked out with it (four hashes): little wavelets as a normal
vec2 wg(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = wh(i), b = wh(i + vec2(1, 0)), c = wh(i + vec2(0, 1)), d = wh(i + vec2(1, 1)); return du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx); }
vec2 waves(vec2 p, vec2 off) { return wg(p * 1.6 + off) * 0.6 + wg(p * 3.7 - off * 1.3 + 4.1) * 0.4; }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
// two copies of the ripple pattern slide along the flow half a cycle apart and cross-fade: it moves, never stretches
float ph0 = fract(uTime * 0.3), ph1 = fract(uTime * 0.3 + 0.5), fw = abs(ph0 * 2.0 - 1.0);
vec2 drift = vec2(uTime * 0.05, uTime * 0.035);                               // a breath of wind over still water
vec2 gsl = mix(waves(vWP.xz - vFlow * ph0 * 3.3 + drift, vec2(0.0)), waves(vWP.xz - vFlow * ph1 * 3.3 + drift, vec2(3.3, 1.7)), fw);
float amp = 0.05 + 0.13 * clamp(length(vFlow) * 1.6, 0.0, 1.0);
normal = normalize((viewMatrix * vec4(normalize(vec3(-gsl.x * amp, 1.0, -gsl.y * amp)), 0.0)).xyz);`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float dd = max(vDepth, 0.0), deepen = smoothstep(0.04, 0.95, dd);
diffuseColor.rgb = mix(vec3(0.1, 0.19, 0.19), vec3(0.02, 0.08, 0.1), deepen);       // clear and blue-green over the shallows, dark in the deep
// soft sheen streaks drawn out along the current (none on the still pond)
float fl = clamp(length(vFlow) * 1.8, 0.0, 1.0); vec2 fd = fl > 0.01 ? normalize(vFlow) : vec2(1.0, 0.0);
vec2 fq = vec2(dot(vWP.xz, fd) * 0.7 - uTime * length(vFlow) * 1.4, dot(vWP.xz, vec2(-fd.y, fd.x)) * 3.2);
diffuseColor.rgb += vec3(0.32, 0.38, 0.4) * smoothstep(0.6, 0.95, wn(fq)) * fl * 0.55;
vec3 vdir = normalize(cameraPosition - vWP); float fres = pow(1.0 - clamp(vdir.y, 0.0, 1.0), 4.0);
float shore = smoothstep(0.0, 0.06 + 0.05 * wn(vWP.xz * 2.3), vDepth);             // the edge feathers out on the bank
diffuseColor.a = shore * clamp(mix(0.55, 0.88, deepen) + fres * 0.4, 0.0, 0.97);`);
  };
  m.customProgramCacheKey = () => 'water-sheet';
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 1; return mesh;
}

/** expanding rings on the water: a small pool of quads, one draw call; `ripple()` drops a new one into the oldest slot */
const RINGS = 24;
let rings: THREE.InstancedMesh | null = null, ringNext = 0, ringTime: { value: number } | null = null;
const rm = new THREE.Matrix4(), rp = new THREE.Vector3(), rq = new THREE.Quaternion(), rs = new THREE.Vector3();
export function ripple(x: number, z: number, strength = 1) {
  if (!rings || !T || !ringTime) return;
  const y = T.waterAt(x, z); if (y !== y || y - T.heightAt(x, z) < 0.02) return;
  const i = ringNext++ % RINGS, r = 0.7 + 1.1 * strength;
  rings.setMatrixAt(i, rm.compose(rp.set(x, y + 0.012, z), rq, rs.set(r * 2, 1, r * 2))); rings.instanceMatrix.needsUpdate = true;
  const b = rings.geometry.getAttribute('aBirth') as THREE.InstancedBufferAttribute, st = rings.geometry.getAttribute('aStr') as THREE.InstancedBufferAttribute;
  b.setX(i, ringTime.value); st.setX(i, Math.min(1, strength)); b.needsUpdate = st.needsUpdate = true;
}
function ringMesh(time: { value: number }) {
  const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  g.setAttribute('aBirth', new THREE.InstancedBufferAttribute(new Float32Array(RINGS).fill(-99), 1)); g.setAttribute('aStr', new THREE.InstancedBufferAttribute(new Float32Array(RINGS), 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: time }]), fog: true, transparent: true, depthWrite: false,
    vertexShader: `attribute float aBirth; attribute float aStr; varying vec2 vU; varying float vAge; varying float vS;\n#include <fog_pars_vertex>
uniform float uTime;
void main() { vU = uv * 2.0 - 1.0; vS = aStr; vAge = (uTime - aBirth) / (1.3 + 0.7 * aStr);
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `varying vec2 vU; varying float vAge; varying float vS;\n#include <fog_pars_fragment>
void main() { if (vAge < 0.0 || vAge > 1.0) discard;
  float r = length(vU), R = pow(vAge, 0.55), k = 0.05 + 0.04 * vAge;
  float ring = exp(-pow((r - R) / k, 2.0)) + 0.55 * exp(-pow((r - R * 0.62) / (k * 0.8), 2.0));
  gl_FragColor = vec4(vec3(0.86, 0.92, 0.95), ring * (1.0 - vAge) * (1.0 - vAge) * (0.3 + 0.45 * vS) * step(r, 1.0));\n#include <fog_fragment>\n}`,
  });
  const mesh = new THREE.InstancedMesh(g, mat, RINGS); mesh.frustumCulled = false; mesh.renderOrder = 2;
  for (let i = 0; i < RINGS; i++) mesh.setMatrixAt(i, rm.makeScale(0, 0, 0));
  return mesh;
}

/** The spring, the stream, the koi pond and the waterfall off the island's edge. Returns the per-frame update. */
export function buildWater(scene: THREE.Scene, t: Terrain, I: Island) {
  T = t;
  const time = { value: 0 }; ringTime = time;
  scene.add(waterSheet(t, I, time));
  rings = ringMesh(time); ringNext = 0; scene.add(rings);
  // the waterfall: a sheet curling over the lip where the stream leaves the island, falling into the clouds, streaked
  // white, fading out low down
  const S = I.stream, [fx, fz] = S[S.length - 1], [px, pz] = S[S.length - 2], dir = new THREE.Vector3(fx - px, 0, fz - pz).normalize();
  const lip = new THREE.Vector3(fx, 0, fz).addScaledVector(dir, -0.4);
  let y0 = NaN; for (let b = 0.4; y0 !== y0 && b < 8; b += 0.5) y0 = t.waterAt(fx - dir.x * b, fz - dir.z * b);   // the water's level just inside the lip
  if (y0 !== y0) y0 = t.heightAt(lip.x, lip.z) + 0.3;
  const drop = y0 - CLOUD_Y + 6, rows = 40, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let r = 0; r <= rows; r++) {
    const f = r / rows, out = 0.2 + 4.5 * Math.sqrt(f), y = y0 - 0.06 - drop * Math.pow(f, 1.25), w = 2.2 + 3 * f;   // curls over, then drops
    const c = lip.clone().addScaledVector(dir, out);
    for (const s of [-0.5, 0.5]) { pos.push(c.x - dir.z * s * w, y, c.z + dir.x * s * w); uv.push(s + 0.5, f * drop); }
    if (r) idx.push(2 * r - 2, 2 * r - 1, 2 * r, 2 * r - 1, 2 * r + 1, 2 * r);
  }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); fg.setIndex(idx);
  const fall = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: time, uDrop: { value: drop } }]), fog: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vU;\n#include <fog_pars_vertex>\nvoid main() { vU = uv; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float uTime; uniform float uDrop; varying vec2 vU;\n#include <fog_pars_fragment>\n${RIPPLE}
void main() { float n = wn(vec2(vU.x * 9.0, vU.y * 0.35 - uTime * 3.2)) * 0.6 + wn(vec2(vU.x * 23.0, vU.y * 0.9 - uTime * 5.0)) * 0.4;
  float edge = smoothstep(0.0, 0.12, vU.x) * smoothstep(1.0, 0.88, vU.x), fade = 1.0 - smoothstep(uDrop * 0.55, uDrop, vU.y), top = smoothstep(0.0, 0.5, vU.y);
  gl_FragColor = vec4(mix(vec3(0.62, 0.78, 0.84), vec3(0.97, 0.98, 1.0), n * top), (0.45 + 0.5 * n * top) * edge * fade);
#include <fog_fragment>\n}`,
  });
  scene.add(new THREE.Mesh(fg, fall));
  return (now: number) => { time.value = now; };
}
