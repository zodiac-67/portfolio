import * as THREE from 'three';
import type { Island } from './island';
import type { Terrain } from './terrain';

let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const local = (s: { x: number; z: number; yaw: number }, lx: number, lz: number) => {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); return [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c] as const;
};

/** small soft sprites that drift, grow and fade (smoke, food, petals): one Points draw call per kind */
export function puffs(n: number, color: THREE.Color, additive = false) {
  const pos = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: color }, uScale: { value: 600 } }]), fog: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: `attribute float size; attribute float alpha; uniform float uScale; varying float vA;
#include <fog_pars_vertex>
void main() { vA = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mvPosition.z; gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform vec3 uColor; varying float vA;
#include <fog_pars_fragment>
void main() { float f = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); if (f * vA < 0.01) discard; gl_FragColor = vec4(uColor, f * vA);
#include <fog_fragment>
}`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return { pts, pos, size, alpha, mat, dirty: () => { for (const k of ['position', 'size', 'alpha']) (g.attributes[k] as THREE.BufferAttribute).needsUpdate = true; } };
}

/** Birds, petals, smoke and koi: the island going about its morning. Returns the per-frame update and two triggers. */
export function buildLife(scene: THREE.Scene, t: Terrain, I: Island, low: boolean, sfx: { flutter: () => void; plop: () => void } | null) {
  const S = I.spots, pondY = S.pond.y + 0.95;
  // ---- sakura petals drifting off the big tree across the square
  const NP = low ? 90 : 180, petals = puffs(NP, new THREE.Color(0xf7c9d6)), pv = new Float32Array(NP * 3);
  const spawnPetal = (i: number, anywhere: boolean) => {
    const a = rnd() * Math.PI * 2, r = rnd() * 4.5, g = t.heightAt(S.sakura.x, S.sakura.z);
    petals.pos.set([S.sakura.x + Math.cos(a) * r, g + 3.6 + rnd() * 2.6 - (anywhere ? rnd() * 5 : 0), S.sakura.z + Math.sin(a) * r], i * 3);
    pv.set([0, -0.25 - rnd() * 0.2, 0], i * 3); petals.size[i] = 0.07 + rnd() * 0.05; petals.alpha[i] = 0.95;
  };
  for (let i = 0; i < NP; i++) spawnPetal(i, true);
  scene.add(petals.pts);
  // ---- smoke from the forge hood and the tea house kitchen
  const sources = [local(S.smithy, -1.4, -1.2).concat(t.heightAt(S.smithy.x, S.smithy.z) + 3.7), local(S.teahouse, 1.6, -1.4).concat(t.heightAt(S.teahouse.x, S.teahouse.z) + 4.1)] as [number, number, number][];
  const NS = low ? 30 : 60, smoke = puffs(NS, new THREE.Color(0xd8d4d0)), sl = new Float32Array(NS);
  for (let i = 0; i < NS; i++) sl[i] = rnd() * 6;
  scene.add(smoke.pts);
  // ---- birds: they peck about, take off when you come close, land somewhere else
  const perches: THREE.Vector3[] = [];
  for (let k = 0; perches.length < 26 && k < 400; k++) {
    const c = [S.meadow, S.meadow, S.square, S.sakura, S.torii, S.pond][k % 6], x = c.x + (rnd() - 0.5) * 22, z = c.z + (rnd() - 0.5) * 22, y = t.heightAt(x, z);
    const wet = ((x - S.pond.x) / 9.5) ** 2 + ((z - S.pond.z) / 7.5) ** 2 < 1 || I.stream.some(([ax, az], i) => {   // no pecking under water
      const [bx, bz] = I.stream[i + 1] ?? [ax, az], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - ax - u * dx, z - az - u * dz) < 2.4;
    });
    if (y > -5 && !wet) perches.push(new THREE.Vector3(x, y, z));
  }
  const NB = low ? 6 : 10, birdBody = new THREE.IcosahedronGeometry(0.08, 0).scale(0.8, 0.75, 1.6), wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.06, 0.2, 0, -0.02, 0, 0, -0.08], 3)); wing.computeVertexNormals();
  const birdMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2c, side: THREE.DoubleSide });
  const bodies = new THREE.InstancedMesh(birdBody, birdMat, NB), wl = new THREE.InstancedMesh(wing, birdMat, NB), wr = new THREE.InstancedMesh(wing, birdMat, NB);
  for (const m of [bodies, wl, wr]) { m.frustumCulled = false; scene.add(m); }
  type Bird = { at: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; yaw: number; peck: number };
  const birds: Bird[] = Array.from({ length: NB }, (_, i) => { const p = perches[(i * 7) % perches.length].clone(); return { at: p, from: p.clone(), to: p.clone(), t: 1, dur: 1, yaw: rnd() * 6, peck: rnd() * 5 }; });
  // ---- koi in the pond: they wander, and gather when fed
  const NK = 7, koi = koiMesh(NK), wig = koi.geometry.getAttribute('aWig') as THREE.InstancedBufferAttribute;
  koi.frustumCulled = false; scene.add(koi);                                     // instances move away from where three first measured them
  const P = S.pond, inPond = (x: number, z: number) => ((x - P.x) / (6.4 * 1.35 * 0.78)) ** 2 + ((z - P.z) / (6.4 * 0.78)) ** 2 < 1;
  const wander = () => { for (;;) { const x = P.x + (rnd() - 0.5) * 14, z = P.z + (rnd() - 0.5) * 10; if (inPond(x, z)) return new THREE.Vector2(x, z); } };
  const fish = Array.from({ length: NK }, () => ({ p: wander(), goal: wander(), yaw: rnd() * 6, wig: rnd() * 6 }));
  const NF = 16, food = puffs(NF, new THREE.Color(0xc9a46a)), foodLife = new Float32Array(NF);
  scene.add(food.pts);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), tmp = new THREE.Vector3();
  let wind = 1, gustT = 0;
  return {
    /** the shrine bell stirs the petals */
    gust() { gustT = 3.5; },
    /** scatter food on the pond in front of a point */
    feed(near: THREE.Vector3) {
      const dx = P.x - near.x, dz = P.z - near.z, d = Math.hypot(dx, dz) || 1, cx = near.x + (dx / d) * 3.6, cz = near.z + (dz / d) * 3.6;
      for (let i = 0; i < NF; i++) { food.pos.set([cx + (rnd() - 0.5) * 1.6, pondY + 0.02, cz + (rnd() - 0.5) * 1.6], i * 3); food.size[i] = 0.09; food.alpha[i] = 1; foodLife[i] = 25; }
      setTimeout(() => sfx?.plop(), 280);
    },
    update(dt: number, time: number, player: THREE.Vector3) {
      gustT = Math.max(0, gustT - dt); wind += ((gustT > 0 ? 5 : 1) - wind) * Math.min(1, dt * 2);
      for (let i = 0; i < NP; i++) {                                                // petals: fall, flutter, drift with the wind
        const k = i * 3, ph = time * 2 + i;
        petals.pos[k] += (0.35 * wind + Math.sin(ph) * 0.25) * dt; petals.pos[k + 2] += (Math.cos(ph * 0.7) * 0.25 - 0.12 * wind) * dt; petals.pos[k + 1] += pv[k + 1] * dt * (0.6 + 0.4 * Math.sin(ph * 1.3));
        const g = t.heightAt(petals.pos[k], petals.pos[k + 2]);
        if (petals.pos[k + 1] < g + 0.03 || Math.abs(petals.pos[k] - S.sakura.x) > 30) spawnPetal(i, false);
      }
      petals.dirty();
      for (let i = 0; i < NS; i++) {                                                // smoke: rise, spread, fade, start again
        sl[i] += dt; const life = sl[i] % 6, src = sources[i % sources.length], f = life / 6, k = i * 3;
        smoke.pos.set([src[0] + Math.sin(i * 3.1 + time * 0.3) * f * 0.8 + f * 1.4 * wind * 0.4, src[2] + life * 0.55, src[1] + Math.cos(i * 1.7) * f * 0.8], k);
        smoke.size[i] = 0.4 + f * 1.8; smoke.alpha[i] = 0.32 * Math.sin(f * Math.PI);
      }
      smoke.dirty();
      birds.forEach((b, i) => {                                                     // birds
        if (b.t < 1) {
          b.t = Math.min(1, b.t + dt / b.dur); const u = b.t;
          b.at.lerpVectors(b.from, b.to, u).add(tmp.set(0, Math.sin(u * Math.PI) * (4 + i % 3), 0));
          b.yaw = Math.atan2(b.to.x - b.from.x, b.to.z - b.from.z);
        } else if (player.distanceTo(b.at) < 5.5) {
          b.from.copy(b.at); let to = perches[Math.floor(rnd() * perches.length)];
          for (let k = 0; k < 8 && to.distanceTo(player) < 15; k++) to = perches[Math.floor(rnd() * perches.length)];
          b.to.copy(to); b.t = 0; b.dur = 2.5 + b.from.distanceTo(b.to) / 7; sfx?.flutter();
        } else { b.peck += dt; if (b.peck > 2.5) { b.peck = 0; b.yaw += (rnd() - 0.5) * 2; } }
        const flying = b.t < 1, flap = flying ? Math.sin(time * 26 + i) * 0.9 : 0.15, bob = !flying && b.peck < 0.25 ? 0.5 : 0;
        q.setFromEuler(e.set(bob, b.yaw, 0, 'YXZ')); bodies.setMatrixAt(i, m.compose(tmp.copy(b.at).add({ x: 0, y: 0.07, z: 0 } as THREE.Vector3), q, one));
        wl.setMatrixAt(i, m.compose(tmp.copy(b.at).add({ x: 0, y: 0.09, z: 0 } as THREE.Vector3), q.setFromEuler(e.set(0, b.yaw, flap, 'YXZ')), one));
        wr.setMatrixAt(i, m.compose(tmp.copy(b.at).add({ x: 0, y: 0.09, z: 0 } as THREE.Vector3), q.setFromEuler(e.set(0, b.yaw + Math.PI, -flap, 'YXZ')), one));
      });
      bodies.instanceMatrix.needsUpdate = wl.instanceMatrix.needsUpdate = wr.instanceMatrix.needsUpdate = true;
      let anyFood = false;
      for (let i = 0; i < NF; i++) { if (foodLife[i] > 0) { foodLife[i] -= dt; anyFood = true; food.alpha[i] = Math.min(1, foodLife[i]); } else food.alpha[i] = 0; }
      food.dirty();
      fish.forEach((f, i) => {                                                      // koi: chase food if there is any, otherwise wander
        if (anyFood) {
          let bd = Infinity;
          for (let k = 0; k < NF; k++) if (foodLife[k] > 0) { const d = Math.hypot(food.pos[k * 3] - f.p.x, food.pos[k * 3 + 2] - f.p.y); if (d < bd) { bd = d; f.goal.set(food.pos[k * 3], food.pos[k * 3 + 2]); } if (d < 0.18) { foodLife[k] = 0; if (rnd() < 0.3) sfx?.plop(); } }
        } else if (f.p.distanceTo(f.goal) < 0.4) f.goal = wander();
        const want = Math.atan2(f.goal.x - f.p.x, f.goal.y - f.p.y), speed = anyFood ? 0.9 : 0.35;
        f.yaw += Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw)) * Math.min(1, dt * 2.5); f.wig += dt * (anyFood ? 14 : 7);
        f.p.x += Math.sin(f.yaw) * speed * dt; f.p.y += Math.cos(f.yaw) * speed * dt;
        if (!inPond(f.p.x, f.p.y)) { f.goal = wander(); f.yaw += Math.PI * 0.5 * dt; }
        q.setFromEuler(e.set(0, f.yaw + Math.sin(f.wig) * 0.05, 0, 'YXZ'));
        koi.setMatrixAt(i, m.compose(tmp.set(f.p.x, pondY - 0.1, f.p.y), q, one)); wig.setX(i, f.wig);   // the body's S-wave runs in the shader
      });
      koi.instanceMatrix.needsUpdate = wig.needsUpdate = true;
    },
  };
}

/** koi: a tapered body (shoulders, a narrow wrist to the tail), a forked tail fan, pectoral fins and a low dorsal, about
 * 50 cm long, all in one instanced draw. Each fish's variety rides in instance attributes (base colour; pattern seed,
 * red and black cover, a tancho head spot) and the shader paints it from noise on the body; aWig drives the swimming
 * S-wave that runs down the body to the tail. */
function koiMesh(n: number) {
  const P = [[0.23, 0.03], [0.19, 0.055], [0.12, 0.072], [0.04, 0.076], [-0.05, 0.066], [-0.12, 0.046], [-0.18, 0.026], [-0.21, 0.016]], S = 10;
  const ring = (z: number, r: number) => Array.from({ length: S }, (_, j) => [Math.cos((j / S) * 6.283) * r * 0.9, Math.sin((j / S) * 6.283) * r * 0.85, z]);
  const rings = P.map(([z, r]) => ring(z, r)), nose = [0, -0.005, 0.255], tailEnd = [0, 0, -0.225];
  const pos: number[] = [], nor: number[] = [], fin: number[] = [];
  const v3 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const tri = (p: number[], q: number[], r: number[], f: number) => {               // flat-normal triangle (the body gets smooth normals below)
    a.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]); b.set(r[0] - p[0], r[1] - p[1], r[2] - p[2]); v3.crossVectors(a, b).normalize();
    pos.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) { nor.push(v3.x, v3.y, v3.z); fin.push(f); }
  };
  for (let j = 0; j < S; j++) {
    const k = (j + 1) % S; tri(nose, rings[0][j], rings[0][k], 0);
    for (let i = 0; i < rings.length - 1; i++) { tri(rings[i][j], rings[i + 1][j], rings[i][k], 0); tri(rings[i][k], rings[i + 1][j], rings[i + 1][k], 0); }
    tri(tailEnd, rings[rings.length - 1][k], rings[rings.length - 1][j], 0);
  }
  for (let i = 0; i < pos.length; i += 3) {                                       // smooth body normals: the ellipse's outward direction, tipped toward the nose/tail at the ends
    const x = pos[i], y = pos[i + 1], z = pos[i + 2], end = z > 0.2 ? (z - 0.2) / 0.055 : z < -0.2 ? (z + 0.2) / 0.025 : 0;
    v3.set(x / 0.81, y / 0.72, end * 0.08).normalize(); if (!x && !y) v3.set(0, 0, Math.sign(z)); nor.splice(i, 3, v3.x, v3.y, v3.z);
  }
  const both = (p: number[], q: number[], r: number[]) => { tri(p, q, r, 1); tri(p, r, q, 1); };   // fins: thin, seen from either side
  both([0, 0, -0.2], [0.115, 0.004, -0.36], [0, 0, -0.31]); both([0, 0, -0.2], [0, 0, -0.31], [-0.115, 0.004, -0.36]);   // the forked tail fan
  for (const s of [-1, 1]) both([s * 0.058, -0.025, 0.12], [s * 0.15, -0.04, 0.05], [s * 0.062, -0.025, 0.035]);      // pectorals
  both([0, 0.062, 0.08], [0, 0.09, -0.01], [0, 0.05, -0.11]);                                                          // dorsal
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aFin', new THREE.Float32BufferAttribute(fin, 1));
  // [base colour, seed, red cover, black cover, tancho]: kohaku, sanke, showa, yamabuki ogon, tancho, orange with black, bekko
  const V: [number, number, number, number][] = [[0xf2eee6, 0.55, 0, 0], [0xf2eee6, 0.45, 0.22, 0], [0x16161a, 0.45, 0, 0], [0xf0b43c, 0, 0, 0], [0xf2eee6, 0, 0, 1], [0xee6a1c, 0, 0.12, 0], [0xeee8dc, 0, 0.3, 0]];
  const kv = new Float32Array(n * 4), base = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) { const [col, r, k, t] = V[i % V.length]; kv.set([i * 3.7 + 1, r, k, t], i * 4); c.setHex(col); base.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('aKoi', new THREE.InstancedBufferAttribute(kv, 4)); g.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 3));
  g.setAttribute('aWig', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aKoi; attribute vec3 aBase; attribute float aWig; attribute float aFin; varying vec4 vKoi; varying vec3 vKBase, vKP; varying float vKFin;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vKP = position; vKoi = aKoi; vKBase = aBase; vKFin = aFin;
transformed.x += sin(position.z * 11.0 + aWig) * 0.05 * smoothstep(0.1, -0.36, position.z);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
varying vec4 vKoi; varying vec3 vKBase, vKP; varying float vKFin;
float kH(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float kN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kH(i), kH(i + vec3(1, 0, 0)), f.x), mix(kH(i + vec3(0, 1, 0)), kH(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(kH(i + vec3(0, 0, 1)), kH(i + vec3(1, 0, 1)), f.x), mix(kH(i + vec3(0, 1, 1)), kH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float back = smoothstep(-0.03, 0.02, vKP.y) * (1.0 - vKFin);
float nr = kN(vec3(vKP.z * 15.0, vKP.x * 10.0, vKoi.x)) * 0.75 + kN(vec3(vKP.z * 40.0, vKP.x * 30.0, vKoi.x + 3.0)) * 0.25;
float nb = kN(vec3(vKP.z * 30.0, vKP.x * 24.0, vKoi.x + 7.0));
float red = smoothstep(0.96 - vKoi.y, 1.0 - vKoi.y, nr) * back * step(0.01, vKoi.y);
float blk = smoothstep(0.97 - vKoi.z, 1.0 - vKoi.z, nb) * back * step(0.01, vKoi.z);
float tch = (1.0 - smoothstep(0.026, 0.034, length(vec2(vKP.x, vKP.z - 0.15)))) * vKoi.w * back;
vec3 kc = mix(vKBase, vec3(0.85, 0.2, 0.05), max(red, tch)); kc = mix(kc, vec3(0.035, 0.035, 0.045), blk);
kc = mix(kc, vec3(0.95, 0.93, 0.88), smoothstep(0.0, -0.05, vKP.y) * 0.55 * (1.0 - vKFin));   // pale belly
kc = mix(kc, mix(vKBase, vec3(1.0, 0.96, 0.9), 0.5), vKFin * 0.8);                             // fins, paler and see-through looking
diffuseColor.rgb *= kc;`);
  };
  m.customProgramCacheKey = () => 'koi';
  return new THREE.InstancedMesh(g, m, n);
}
