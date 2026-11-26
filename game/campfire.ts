import * as THREE from 'three';
import type { Island } from './island';
import type { Terrain } from './terrain';

// The storyteller's fire, lit. Flame cards that turn to face the camera with a flickering shader, sparks rising off the
// embers and a warm glow painted on the ground share one additive mesh (one draw call); a thin wisp of smoke is a second.
// Everything moves in the vertex shader from a time uniform, so a frame costs one uniform write. No light: the glow is
// painted, so no other shader changes and nothing new casts a shadow. The logs, stones and embers are the 'firepit' prefab.

const NOISE = `float hsh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }`;

/** quads sharing a centre per card: position = the card's anchor, aCorner = -1..1, aInfo = (kind, seed, width, height) */
function cards(list: [number, number, number, number, number, number, number][]) {
  const pos: number[] = [], corner: number[] = [], info: number[] = [], idx: number[] = [];
  list.forEach(([x, y, z, kind, seed, w, h], i) => {
    for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { pos.push(x, y, z); corner.push(cx, cy); info.push(kind, seed, w, h); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 4)); g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 2, 0), 4.5);             // the shader moves things: cull by the whole plume
  return g;
}

export function buildCampfire(scene: THREE.Scene, t: Terrain, I: Island, low: boolean) {
  const [fx, fz] = I.props.firepit[0], base = new THREE.Vector3(fx, t.heightAt(fx, fz) - 0.05, fz);
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const uTime = { value: 0 };
  // kind 0: flame (anchored at its foot, stays upright), 1: spark, 2: the glow on the ground
  const fire: [number, number, number, number, number, number, number][] = [[0, 0.05, 0, 2, 0, 1.7, 1.7]];
  for (let i = 0; i < 5; i++) { const a = i * 2.4; fire.push([Math.cos(a) * 0.14 * (i > 0 ? 1 : 0), 0.08, Math.sin(a) * 0.14 * (i > 0 ? 1 : 0), 0, r(), i ? 0.3 + r() * 0.1 : 0.42, i ? 0.7 + r() * 0.4 : 1.25]); }
  for (let i = 0; i < (low ? 10 : 22); i++) fire.push([(r() - 0.5) * 0.4, 0.15, (r() - 0.5) * 0.4, 1, r(), 0.022 + r() * 0.02, 0]);
  const flames = new THREE.Mesh(cards(fire), new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; attribute vec2 aCorner; attribute vec4 aInfo; varying vec2 vUv; varying float vKind; varying float vSeed; varying float vFade;
void main() {
  float kind = aInfo.x, seed = aInfo.y; vUv = aCorner * 0.5 + 0.5; vKind = kind; vSeed = seed; vFade = 1.0;
  vec3 c = (modelMatrix * vec4(position, 1.0)).xyz, p;
  if (kind > 1.5) p = c + vec3(aCorner.x, 0.0, aCorner.y) * aInfo.z;                              // flat on the ground
  else {
    if (kind > 0.5) {                                                                                 // a spark: up, wandering, dying out
      float life = fract(uTime * (0.5 + 0.35 * fract(seed * 7.31)) + seed);
      c += vec3(sin(seed * 41.0 + uTime * 3.1) * 0.15 + (fract(seed * 13.7) - 0.5) * 0.5, 1.7 + fract(seed * 3.1), cos(seed * 23.0 + uTime * 2.7) * 0.15 + (fract(seed * 5.3) - 0.5) * 0.5) * life;
      vFade = (1.0 - life) * smoothstep(0.0, 0.06, life) * (0.6 + 0.4 * sin(uTime * 23.0 + seed * 50.0));
    }
    vec3 toCam = cameraPosition - c, right = normalize(vec3(toCam.z, 0.0, -toCam.x)), up = kind > 0.5 ? normalize(cross(toCam, right)) : vec3(0.0, 1.0, 0.0);
    vec2 q = kind > 0.5 ? aCorner * aInfo.z : vec2(aCorner.x * aInfo.z, (aCorner.y * 0.5 + 0.5) * aInfo.w);
    p = c + right * q.x + up * q.y;
    if (kind < 0.5) p += right * sin(uTime * 2.3 + seed * 9.0) * 0.05 * q.y;                          // the tips sway
  }
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vKind; varying float vSeed; varying float vFade;
${NOISE}
void main() {
  float flick = 0.82 + 0.18 * vnoise(vec2(uTime * 7.0, 3.0));
  vec4 o;
  if (vKind > 1.5) {                                                                                  // warm light pooled round the fire
    float d = length(vUv * 2.0 - 1.0); o = vec4(vec3(1.0, 0.45, 0.14) * 0.85 * flick, pow(max(0.0, 1.0 - d), 2.4));
  } else if (vKind > 0.5) {
    o = vec4(vec3(1.0, 0.62, 0.22) * 2.2, smoothstep(1.0, 0.1, length(vUv * 2.0 - 1.0)) * vFade);
  } else {                                                                                            // a teardrop of flame licked by rising noise
    float y = vUv.y, n = vnoise(vec2(vUv.x * 3.0 + vSeed * 17.0, y * 3.5 - uTime * 3.4)) * 0.65 + vnoise(vec2(vUv.x * 7.0 - vSeed * 5.0, y * 8.0 - uTime * 5.5)) * 0.35;
    float w = 0.46 * (1.0 - y) * (0.6 + 0.4 * smoothstep(0.0, 0.2, y)), dx = abs(vUv.x - 0.5 + (n - 0.5) * 0.4 * y);
    float body = smoothstep(w, w * 0.35, dx) * smoothstep(0.95, 0.35, y + (n - 0.5) * 0.55) * smoothstep(0.0, 0.08, y);
    float core = smoothstep(w * 0.6, 0.0, dx) * smoothstep(0.55, 0.05, y + (n - 0.5) * 0.3);
    o = vec4((mix(vec3(0.95, 0.22, 0.03), vec3(1.0, 0.5, 0.1), body) + vec3(1.0, 0.75, 0.35) * core * 0.7) * 1.3 * flick, body * flick);
  }
  gl_FragColor = o;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  flames.position.copy(base); flames.renderOrder = 2; scene.add(flames);
  // a thin wisp of smoke drifting off on the breeze
  const puffs: [number, number, number, number, number, number, number][] = [];
  for (let i = 0; i < (low ? 8 : 14); i++) puffs.push([0, 0.6, 0, 0, i / (low ? 8 : 14) + r() * 0.03, 0, 0]);
  const smoke = new THREE.Mesh(cards(puffs), new THREE.ShaderMaterial({
    uniforms: { uTime }, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime; attribute vec2 aCorner; attribute vec4 aInfo; varying vec2 vUv; varying float vA; varying float vSeed;
void main() {
  float seed = aInfo.y, life = fract(uTime * 0.09 + seed); vUv = aCorner * 0.5 + 0.5; vSeed = seed;
  vec3 c = (modelMatrix * vec4(position, 1.0)).xyz + vec3(0.9 * life * life + sin(uTime * 0.7 + seed * 20.0) * 0.18 * life, 4.8 * life, 0.5 * life * life);
  vA = 0.2 * smoothstep(0.0, 0.12, life) * (1.0 - life);
  vec3 toCam = cameraPosition - c, right = normalize(vec3(toCam.z, 0.0, -toCam.x)), up = normalize(cross(toCam, right));
  float sz = 0.25 + life * 1.3;
  gl_Position = projectionMatrix * viewMatrix * vec4(c + (right * aCorner.x + up * aCorner.y) * sz, 1.0);
}`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vA; varying float vSeed;
${NOISE}
void main() {
  float n = vnoise(vUv * 3.0 + vSeed * 31.0 + vec2(0.0, -uTime * 0.3));
  gl_FragColor = vec4(vec3(0.62, 0.6, 0.64), smoothstep(1.0, 0.2, length(vUv * 2.0 - 1.0) + (n - 0.5) * 0.5) * vA);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  }));
  smoke.position.copy(base); smoke.renderOrder = 3; scene.add(smoke);
  return (time: number) => { uTime.value = time; };
}
