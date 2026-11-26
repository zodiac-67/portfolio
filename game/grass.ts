import * as THREE from 'three';
import type { Terrain } from './terrain';

/** Spring meadow: curved blades in a patch that follows the camera, in drifting colour patches and tall and short
 * stands, with wind gusts rolling across the field and small wildflowers in clusters. Heights and the meadow mask come
 * from textures, so paths and the square stay clear and the grass thins out towards them. Returns the per-frame update. */
export function addGrass(scene: THREE.Scene, t: Terrain, low: boolean) {
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const patch = low ? 40 : 58, count = low ? 16000 : 56000, flowers = low ? 1400 : 4200;
  // half floats: linear filtering works on every WebGL2 device (full floats need an extension phones often lack)
  const hTex = new THREE.DataTexture(Uint16Array.from(t.h, (v) => THREE.DataUtils.toHalfFloat(v)), t.n, t.n, THREE.RedFormat, THREE.HalfFloatType);
  hTex.magFilter = hTex.minFilter = THREE.LinearFilter; hTex.needsUpdate = true;
  const splat = new THREE.TextureLoader().load('/game/island_splat.png');
  const U = { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uH: { value: hTex }, uSplat: { value: splat } };

  /** the shared trick: each instance wraps around the camera in a `patch`-sized tile and stands on the heightmap */
  const meadowMaterial = (flower: boolean) => {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, U);
      s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
uniform vec3 uCam; uniform float uTime; uniform sampler2D uH; uniform sampler2D uSplat; varying float vTip; varying vec3 vCol;${flower ? '\nattribute float aPart; varying float vPart;' : ''}
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gh(i), gh(i + vec2(1, 0)), f.x), mix(gh(i + vec2(0, 1)), gh(i + vec2(1, 1)), f.x), f.y); }`)
        .replace('#include <project_vertex>', `
vec4 ip = instanceMatrix * vec4(transformed, 1.0);
vec2 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
vec2 wp = base + floor((uCam.xz - base) / ${patch.toFixed(1)} + 0.5) * ${patch.toFixed(1)};
vec2 tuv = wp / ${t.size.toFixed(1)} + 0.5;
float fade = 1.0 - smoothstep(${(patch * 0.32).toFixed(1)}, ${(patch * 0.5).toFixed(1)}, distance(wp, uCam.xz));
float r1 = gh(base * 0.731);
float k = smoothstep(0.08, 0.6, texture2D(uSplat, tuv).g) * fade${flower ? ' * step(0.58, gn(wp * 0.16 + 3.0))' : ''};     // ${flower ? 'flowers grow in clusters' : 'thin out towards paths'}
float tall = 0.55 + 0.9 * gn(wp * 0.11 + 7.0);                                   // stands of long grass among short
vec3 p = vec3(wp.x, texture2D(uH, tuv).r, wp.y) + vec3(ip.x - base.x, ip.y * tall, ip.z - base.y) * k;
float tip = transformed.y / ${flower ? '0.36' : '0.58'};
float gust = 0.5 + 0.5 * sin(uTime * 0.9 - dot(wp, vec2(0.12, 0.07)));            // waves of wind rolling across the field
p.xz += (vec2(0.7, 0.4) * (0.05 + 0.18 * gust * gust) + vec2(sin(uTime * 3.1 + r1 * 6.3), cos(uTime * 2.7 + r1 * 4.0)) * 0.025) * tip * tall * k;
vTip = tip;
${flower ? 'vCol = vec3(1.0); vPart = aPart;' : `float pn = gn(wp * 0.07);
vCol = mix(vec3(0.38, 0.55, 0.26), vec3(0.5, 0.6, 0.3), pn);                           // deep spring green to lighter, sunnier patches
vCol = mix(vCol, vec3(0.28, 0.42, 0.24), step(0.8, r1) * 0.7);                         // a few darker blades
vCol = pow(vCol * (0.85 + 0.3 * r1) * (1.0 + 0.14 * gust * tip), vec3(2.2));       // picked as screen colours; the shader works in linear light`}
vec4 mvPosition = viewMatrix * vec4(p, 1.0);
gl_Position = projectionMatrix * mvPosition;`);
      s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying float vTip; varying vec3 vCol;${flower ? ' varying float vPart;' : ''}`)
        .replace('#include <color_fragment>', flower ? '#include <color_fragment>\ndiffuseColor.rgb = vPart < 0.5 ? vec3(0.07, 0.17, 0.04) : vPart < 1.5 ? diffuseColor.rgb * mix(0.75, 1.0, vTip) : vec3(0.85, 0.55, 0.06);   // green stem and leaves, petals, a golden eye' : '#include <color_fragment>\ndiffuseColor.rgb *= vCol * mix(0.62, 1.12, vTip);   // shaded roots, bright tips');
    };
    mat.customProgramCacheKey = () => (flower ? 'flowers' : 'grass');
    return mat;
  };

  // a tuft: two slim blades crossing, each curving forward as it rises
  const blade = new THREE.BufferGeometry(), bp: number[] = [], bi: number[] = [];
  for (const [ang, h, lean] of [[0, 0.58, 0.15], [1.25, 0.5, -0.12]]) {
    const c = Math.cos(ang), s2 = Math.sin(ang), o = bp.length / 3;
    for (const [x, y, z] of [[-0.028, 0, 0], [0.028, 0, 0], [-0.017, h * 0.52, lean * 0.3], [0.017, h * 0.52, lean * 0.3], [0, h, lean]]) bp.push(x * c + z * s2, y, -x * s2 + z * c);
    bi.push(o, o + 1, o + 2, o + 1, o + 3, o + 2, o + 2, o + 3, o + 4);
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  blade.setAttribute('normal', new THREE.Float32BufferAttribute(Array(bp.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  blade.setIndex(bi);
  // a flower: a slim stem with a leaf, five cupped petals round a golden eye (aPart: 0 green, 1 petal, 2 eye)
  const pos: number[] = [], part: number[] = [], idx: number[] = [];
  const quad = (pts: number[][], pt: number) => { const o = pos.length / 3; for (const p of pts) { pos.push(...p); part.push(pt); } idx.push(o, o + 1, o + 2, o, o + 2, o + 3); };
  for (const a of [0, Math.PI / 2]) { const c = Math.cos(a) * 0.006, z = Math.sin(a) * 0.006; quad([[-c, 0, -z], [c, 0, z], [c, 0.34, z], [-c, 0.34, -z]], 0); }
  quad([[0, 0.07, 0], [0.03, 0.1, 0.012], [0.075, 0.13, 0], [0.03, 0.095, -0.012]], 0);                 // a leaf off the stem
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca;           // along and across the petal
    const p = (u: number, v: number, y: number) => [ca * u + px * v, 0.34 + y, sa * u + pz * v];
    quad([p(0.008, 0, 0), p(0.026, 0.017, 0.006), p(0.05, 0, 0.02), p(0.026, -0.017, 0.006)], 1);
  }
  for (const a of [0, Math.PI / 2]) { const c = Math.cos(a) * 0.012, z = Math.sin(a) * 0.012; quad([[-c, 0.347, -z], [-z, 0.352, c], [c, 0.347, z], [z, 0.352, -c]], 2); }
  const flowerGeo = new THREE.BufferGeometry();
  flowerGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); flowerGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  flowerGeo.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1)); flowerGeo.setIndex(idx);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tr = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const grass = new THREE.InstancedMesh(blade, meadowMaterial(false), count); grass.frustumCulled = false;
  for (let i = 0; i < count; i++) {
    tr.set((rnd() - 0.5) * patch, 0, (rnd() - 0.5) * patch); q.setFromAxisAngle(Y, rnd() * Math.PI * 2);
    const h = 0.34 + rnd() * 0.4; sc.set(0.62 + rnd() * 0.45, h, 0.8 + rnd() * 0.5); grass.setMatrixAt(i, m.compose(tr, q, sc));   // slim blades, knee-high at most
  }
  const bloom = new THREE.InstancedMesh(flowerGeo, meadowMaterial(true), flowers); bloom.frustumCulled = false;
  const hues = [0xf4f0e6, 0xf2d34f, 0xe9a9bb, 0xb9a2e0, 0xf4f0e6];                // white, buttercup, pink, violet
  for (let i = 0; i < flowers; i++) {
    tr.set((rnd() - 0.5) * patch, 0, (rnd() - 0.5) * patch); q.setFromAxisAngle(Y, rnd() * Math.PI * 2);
    const s = 0.7 + rnd() * 0.6; bloom.setMatrixAt(i, m.compose(tr, q, sc.set(s, 0.8 + rnd() * 0.5, s)));
    bloom.setColorAt(i, new THREE.Color(hues[Math.floor(rnd() * hues.length)]).multiplyScalar(1.15));   // a little brighter than the grass so they read
  }
  scene.add(grass, bloom);
  return (camPos: THREE.Vector3, time: number) => { U.uCam.value.copy(camPos); U.uTime.value = time; };
}
