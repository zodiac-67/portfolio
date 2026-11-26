import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Island } from './island';
import { insideEdge, type Terrain } from './terrain';
import { toFloat } from './prefab';

// Wildlife: sika deer grazing the east meadow (tame like the deer of Nara: walk up slowly, press E and one bows back),
// a fox at the jungle edge, rabbits in the grass, two cranes wading in the koi pond and a heron by the stream, and
// butterflies over the flowers. Anything shy bolts if you run at it; the birds fly a loop over the island and come back.
// In the village: hens and a rooster pecking about the smithy yard and between the houses (they scatter when you walk
// through), a calico cat asleep on the tea house deck (wakes and stretches if you come right up, then curls up again), and
// a village dog doing the rounds of the street: it sniffs, naps in the sun, and now and then trots over to tag along.

type Sfx = { deer: (d: number) => void; crane: (d: number) => void; bolt: (d: number, hooves: boolean) => void; flutter: () => void;
  cluck?: (d: number, alarm?: boolean) => void; crow?: (d: number) => void; meow?: (d: number) => void; bark?: (d: number) => void } | null;
type Kind = 'deer' | 'stag' | 'fox' | 'rabbit' | 'crane' | 'heron';
/** walk/run speeds (m/s); bolt if you come closer than `scared` moving faster than `nerve`, or closer than `startle` at any
 * pace. The deer are used to people: only a sprint (Shift) sends them off, so you can jog up and bow */
const SPEC: Record<Kind, { walk: number; run: number; scared: number; startle: number; nerve: number; bird?: boolean }> = {
  deer: { walk: 0.8, run: 6.5, scared: 8, startle: 1.2, nerve: 5 }, stag: { walk: 0.8, run: 6.5, scared: 8, startle: 1.2, nerve: 5 },
  fox: { walk: 1.1, run: 6, scared: 11, startle: 7, nerve: 3.2 }, rabbit: { walk: 0.9, run: 4.2, scared: 6, startle: 3, nerve: 3.2 },
  crane: { walk: 0.3, run: 0, scared: 8, startle: 3.8, nerve: 3.2, bird: true }, heron: { walk: 0.25, run: 0, scared: 9, startle: 4.5, nerve: 3.2, bird: true },
};
type Animal = {
  kind: Kind; root: THREE.Object3D; mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction>; clip: string;
  x: number; z: number; y: number; yaw: number; home: [number, number, number]; goal: [number, number]; state: string; t: number;
  wings?: THREE.Object3D; body?: RAPIER.RigidBody; fly?: { c: [number, number]; r: number; a: number; dir: number; up: number; land: [number, number]; t: number };
};

export async function buildAnimals(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, t: Terrain, I: Island, low: boolean, sfx: Sfx) {
  let sd = 31; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const kinds: Kind[] = ['deer', 'stag', 'fox', 'rabbit', 'crane', 'heron'];
  const villageSrc = Promise.all(['chicken', 'cat', 'dog'].map((k) => loader.loadAsync(`/game/animals_${k}.glb`)));
  const src = Object.fromEntries(await Promise.all(kinds.map(async (k) => [k, await loader.loadAsync(`/game/${k}.glb`)] as const)));
  const coat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const S = I.spots, P = S.pond, pondY = P.y + 0.95;
  // where each lives: [x, z, radius]
  const st = I.stream, side = (a: number[], b: number[], u: number, off: number): [number, number, number] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [a[0] + dx * u + (dz / l) * off, a[1] + dz * u - (dx / l) * off, 0.5];
  };
  const herons = [side(st[2], st[3], 0.55, 1.3), side(st[2], st[3], 0.82, 1.3), side(st[1], st[2], 0.45, 1.3)];
  const homes: [Kind, [number, number, number]][] = [
    ['deer', [S.meadow.x - 4, S.meadow.z + 2, 11]], ['deer', [S.meadow.x - 4, S.meadow.z + 2, 11]], ['deer', [S.meadow.x - 4, S.meadow.z + 2, 11]], ['stag', [S.meadow.x - 4, S.meadow.z + 2, 11]],
    ['fox', [(S.bamboo.x + S.forest.x) / 2 - 8, (S.bamboo.z + S.forest.z) / 2, 7]],
    ['rabbit', [S.meadow.x - 2, S.meadow.z, 12]], ['rabbit', [S.meadow.x - 2, S.meadow.z, 12]], ['rabbit', [S.meadow.x - 2, S.meadow.z, 12]],
    ['rabbit', [S.meadow.x - 8, S.meadow.z + 10, 5]], ['rabbit', [S.meadow.x - 8, S.meadow.z + 10, 5]],
    ['crane', [P.x, P.z, 0]], ['crane', [P.x, P.z, 0]], ['heron', herons[0]],
  ];
  // cranes keep to the shallow margin of the pond (an elliptical band), everything else to a circle
  const inHome = (k: Kind, h: [number, number, number]): [number, number] => {
    if (k === 'crane') { const a = r() * Math.PI * 2, pd = 4.9 + r() * 0.7; return [P.x + Math.cos(a) * pd * 1.35, P.z + Math.sin(a) * pd]; }
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * h[2]; return [h[0] + Math.cos(a) * d, h[1] + Math.sin(a) * d];
  };
  const animals: Animal[] = [];
  for (const [kind, home] of homes) {
    if (low && kind === 'rabbit' && animals.filter((a) => a.kind === 'rabbit').length >= 3) continue;
    const g = src[kind], root = cloneSkinned(g.scene);
    root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = coat; m.castShadow = !low && kind !== 'rabbit'; m.receiveShadow = true; m.frustumCulled = false; } });
    const mixer = new THREE.AnimationMixer(root), acts = Object.fromEntries(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
    if (acts.bow) { acts.bow.setLoop(THREE.LoopOnce, 1); acts.bow.clampWhenFinished = true; }
    const [x, z] = inHome(kind, home), a: Animal = { kind, root, mixer, acts, clip: '', x, z, y: t.heightAt(x, z), yaw: r() * 6.28, home, goal: [x, z], state: 'graze', t: r() * 6, wings: root.getObjectByName('wings') };
    if (a.wings) a.wings.visible = false;
    if (kind === 'deer' || kind === 'stag') a.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, a.y + 0.9, z));
    if (a.body) world.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.32), a.body);
    acts[a.state]?.play(); a.clip = a.state; mixer.update(r() * 3);                     // not all in step
    scene.add(root); animals.push(a);
  }
  const play = (a: Animal, name: string, speed = 1) => {
    const n = a.acts[name] ? name : 'idle', act = a.acts[n]; act.timeScale = speed;
    if (n === a.clip) return; act.reset().fadeIn(0.25).play(); a.acts[a.clip]?.fadeOut(0.25); a.clip = n;
  };
  const turn = (a: Animal, to: number, dt: number, rate = 4) => { a.yaw += Math.atan2(Math.sin(to - a.yaw), Math.cos(to - a.yaw)) * Math.min(1, dt * rate); };
  /** a step along (dx, dz) that keeps well inside the island and out of the pond */
  const safe = (a: Animal, dx: number, dz: number) => {
    for (let k = 0; k < 6; k++) {
      const nx = a.x + dx * 6, nz = a.z + dz * 6, wet = ((nx - P.x) / 10.5) ** 2 + ((nz - P.z) / 8) ** 2 < 1;
      if (insideEdge(I.outline, nx * 1.12, nz * 1.12) && t.heightAt(nx, nz) > -5 && (a.kind === 'crane' || !wet)) return [dx, dz];
      const c = Math.cos(0.8), s = Math.sin(0.8); [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    }
    const l = Math.hypot(a.x, a.z) || 1; return [-a.x / l, -a.z / l];                  // head for the middle
  };
  const startle = (a: Animal, px: number, pz: number, dist: number) => {
    if (SPEC[a.kind].bird) {
      const c: [number, number] = a.kind === 'crane' ? [P.x, P.z] : [0, 0], land = a.kind === 'crane' ? inHome('crane', a.home) : (() => { const h = herons[Math.floor(r() * herons.length)]; return [h[0], h[1]] as [number, number]; })();
      a.state = 'fly'; a.t = 0; a.fly = { c, r: a.kind === 'crane' ? 34 + r() * 10 : 26, a: Math.atan2(a.z - c[1], a.x - c[0]), dir: r() < 0.5 ? 1 : -1, up: 0, land, t: 14 + r() * 6 };
      if (a.wings) a.wings.visible = true; sfx?.flutter(); if (a.kind === 'crane') sfx?.crane(dist);
      return;
    }
    a.state = 'flee'; a.t = 2 + r() * 1.5; const d = Math.hypot(a.x - px, a.z - pz) || 1; a.goal = [(a.x - px) / d, (a.z - pz) / d];
    sfx?.bolt(dist, a.kind === 'deer' || a.kind === 'stag');
  };

  // butterflies: two wing quads that flap in the vertex shader, wandering Lissajous loops over flowers
  const NB = low ? 12 : 24, wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.03, 0.07, 0, 0.05, 0.06, 0, -0.03, 0, 0, -0.02, 0, 0, 0.03, -0.07, 0, 0.05, -0.06, 0, -0.03, 0, 0, -0.02], 3));
  wing.setAttribute('normal', new THREE.Float32BufferAttribute(Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  wing.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
  const flapT = { value: 0 }, bfMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  bfMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = flapT;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.7, fl = 0.25 + 1.0 * sin(uTime * 17.0 + ph);
  if (abs(position.x) > 0.001) { float s = sign(position.x), w = abs(position.x); transformed.x = s * w * cos(fl); transformed.y = w * sin(fl); }`);
  };
  const bfs = new THREE.InstancedMesh(wing, bfMat, NB); bfs.frustumCulled = false;
  const tint = [0xf6f2e4, 0xf2d34f, 0xf08a2a, 0x9ab8e8, 0xf6f2e4];
  const flowers: [number, number][] = [[S.meadow.x, S.meadow.z], [S.meadow.x - 8, S.meadow.z + 8], [S.sakura.x, S.sakura.z], [P.x + 5, P.z + 4], [S.square.x + 4, S.square.z - 5], [S.meadow.x + 6, S.meadow.z - 6]];
  const bf = Array.from({ length: NB }, (_, i) => ({ c: flowers[i % flowers.length], f: [0.3 + r() * 0.3, 0.25 + r() * 0.3, 0.7 + r() * 0.6], ph: r() * 6.28, rad: 2 + r() * 4 }));
  bf.forEach((_, i) => bfs.setColorAt(i, new THREE.Color(tint[i % tint.length])));
  scene.add(bfs);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
  const village = villageCritters(scene, world, t, I, low, sfx, await villageSrc, coat, flapT, r);

  let lastCall = 0;
  return {
    /** the tame deer nearest the player, if one is close enough to bow to (its head, for the prompt) */
    bowable(px: number, pz: number, speed: number) {
      if (speed > SPEC.deer.nerve) return null;
      let best: Animal | null = null, bd = 2.8;
      for (const a of animals) if ((a.kind === 'deer' || a.kind === 'stag') && a.state !== 'flee' && a.state !== 'bow') { const d = Math.hypot(a.x - px, a.z - pz); if (d < bd) { bd = d; best = a; } }
      return best && new THREE.Vector3(best.x, best.y + (best.kind === 'stag' ? 1.55 : 1.45), best.z);
    },
    /** the nearest deer turns to you and bows; returns its position so the ronin can face it */
    bow(px: number, pz: number) {
      let best: Animal | null = null, bd = 3;
      for (const a of animals) if (a.kind === 'deer' || a.kind === 'stag') { const d = Math.hypot(a.x - px, a.z - pz); if (d < bd) { bd = d; best = a; } }
      if (!best) return null;
      best.state = 'bow'; best.t = 2.2; best.yaw = Math.atan2(px - best.x, pz - best.z); best.acts.bow.reset(); play(best, 'bow'); sfx?.deer(bd);
      return new THREE.Vector3(best.x, best.y, best.z);
    },
    update(dt: number, time: number, player: THREE.Vector3, speed: number, cam: THREE.Vector3) {
      for (const a of animals) {
        const sp = SPEC[a.kind], dx = player.x - a.x, dz = player.z - a.z, dist = Math.hypot(dx, dz);
        a.t -= dt;
        if (a.state === 'fly') {
          const f = a.fly!; f.t -= dt; f.up += dt;
          const rising = Math.min(1, f.up / 3), landing = f.t < 0;
          if (!landing) {                                                         // climb out and circle
            f.a += f.dir * dt * 0.38; const tx = f.c[0] + Math.cos(f.a) * f.r, tz = f.c[1] + Math.sin(f.a) * f.r;
            const hx = tx - a.x, hz = tz - a.z, hl = Math.hypot(hx, hz) || 1, v = 9 * (0.4 + 0.6 * rising);
            a.x += (hx / hl) * v * dt; a.z += (hz / hl) * v * dt; a.y += ((Math.max(t.heightAt(a.x, a.z), pondY) + 16 * rising) - a.y) * Math.min(1, dt * 0.8);
            turn(a, Math.atan2(hx, hz), dt, 2.5); play(a, 'fly', 1);
          } else {                                                                // glide down to the landing spot
            const hx = f.land[0] - a.x, hz = f.land[1] - a.z, hl = Math.hypot(hx, hz), gy = t.heightAt(f.land[0], f.land[1]);
            const v = Math.min(8, 1.2 + hl * 0.5); a.x += (hx / (hl || 1)) * v * dt; a.z += (hz / (hl || 1)) * v * dt;
            a.y += (gy + Math.min(14, hl * 0.35) - a.y) * Math.min(1, dt * 1.5); turn(a, Math.atan2(hx, hz), dt, 3); play(a, 'fly', hl > 6 ? 1 : 0.5);
            if (hl < 0.4) { a.state = 'idle'; a.t = 4; a.y = gy; if (a.wings) a.wings.visible = false; if (a.kind === 'heron') a.home = [f.land[0], f.land[1], 0.5]; }
          }
        } else {
          if (a.state !== 'flee' && ((speed > sp.nerve && dist < sp.scared) || dist < sp.startle)) startle(a, player.x, player.z, dist);
          if (a.state === 'flee') {
            const [fx, fz] = safe(a, a.goal[0], a.goal[1]); a.goal = [fx, fz];
            a.x += fx * sp.run * dt; a.z += fz * sp.run * dt; turn(a, Math.atan2(fx, fz), dt, 6); play(a, 'run', 1);
            if (a.t < 0) { a.state = (a.kind === 'deer' || a.kind === 'stag' || a.kind === 'rabbit') ? 'alert' : 'walk'; a.t = 2 + r() * 2; a.goal = inHome(a.kind, a.home); }
          } else if (a.state === 'bow') {
            play(a, 'bow'); if (a.t < 0) { a.state = 'alert'; a.t = 3; }
          } else if ((a.kind === 'deer' || a.kind === 'stag') && dist < 7 && a.state !== 'walk') {
            a.state = 'alert'; a.t = Math.max(a.t, 1.5); turn(a, Math.atan2(dx, dz), dt, 2); play(a, 'alert');   // curious: watches you come
          } else if (a.state === 'walk') {
            const hx = a.goal[0] - a.x, hz = a.goal[1] - a.z, hl = Math.hypot(hx, hz);
            if (hl < 0.3) { a.state = r() < 0.6 ? 'graze' : 'idle'; a.t = 3 + r() * 6; }
            else { const [fx, fz] = sp.bird ? [hx / hl, hz / hl] : safe(a, hx / hl, hz / hl); a.x += fx * sp.walk * dt; a.z += fz * sp.walk * dt; turn(a, Math.atan2(fx, fz), dt, 3); play(a, 'walk', a.kind === 'rabbit' ? 0.8 : 1); }
          } else {
            play(a, a.state === 'alert' ? 'alert' : a.state === 'graze' ? 'graze' : 'idle');
            if (a.t < 0) {
              if (r() < 0.55) { a.state = 'walk'; a.goal = inHome(a.kind, a.home); }
              else { a.state = r() < 0.6 ? 'graze' : 'idle'; a.t = 3 + r() * 6; }
            }
          }
          a.y = t.heightAt(a.x, a.z);
        }
        a.root.position.set(a.x, a.y, a.z); a.root.rotation.y = a.yaw;
        if (a.body) a.body.setNextKinematicTranslation({ x: a.x, y: a.y + 0.9, z: a.z });
        if (cam.distanceToSquared(a.root.position) < 90 * 90) a.mixer.update(dt);           // far ones hold their pose
      }
      // now and then the deer call across the meadow, or the cranes trumpet
      if (time - lastCall > 18 + Math.random() * 20) {
        lastCall = time; const a = animals[Math.floor(Math.random() * animals.length)], d = Math.hypot(player.x - a.x, player.z - a.z);
        if (d < 60) { if (a.kind === 'deer' || a.kind === 'stag') sfx?.deer(d); else if (a.kind === 'crane') sfx?.crane(d); }
      }
      // butterflies
      flapT.value = time;
      bf.forEach((b, i) => {
        const tt = time * 0.6 + b.ph, x = b.c[0] + Math.sin(tt * b.f[0] * 2) * b.rad, z = b.c[1] + Math.cos(tt * b.f[1] * 2 + b.ph) * b.rad;
        const vx = Math.cos(tt * b.f[0] * 2) * b.f[0], vz = -Math.sin(tt * b.f[1] * 2 + b.ph) * b.f[1], y = t.heightAt(x, z) + 0.6 + 0.35 * Math.sin(tt * b.f[2] * 3);
        bfs.setMatrixAt(i, m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(0, Math.atan2(vx, vz), 0)), one));
      });
      bfs.instanceMatrix.needsUpdate = true;
      village.update(dt, player, speed, cam);
    },
    /** testing aid */
    list: () => [...animals.map((a) => ({ kind: a.kind as string, state: a.state, pos: [a.x, a.y, a.z].map((n) => +n.toFixed(2)) })), ...village.list()],
  };
}

// ---------------------------------------------------------------- village critters
type Gltf = Awaited<ReturnType<GLTFLoader['loadAsync']>>;
/** an animal with clips that stays in the village (the cat, the dog) */
type Pet = { root: THREE.Object3D; mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction>; clip: string; x: number; z: number; y: number; yaw: number; state: string; t: number };
/** a hen or the rooster: one instance of the flock's mesh, its parts posed in the vertex shader from these numbers */
type Hen = {
  rooster: boolean; x: number; z: number; yaw: number; home: [number, number, number]; goal: [number, number]; state: 'peck' | 'walk' | 'flee' | 'crow'; t: number;
  phase: number; walk: number; peck: number; flap: number; look: number; lookTo: number; hop: number; pecks: number; pt: number; pause: number; s: number;
};
const AROUND = [0, 0.6, -0.6, 1.2, -1.2];                                            // headings tried when the way ahead is blocked
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** the chicken parts' pivots in glTF space (animals_build.py chicken(): Blender (x, y, z) -> (x, z, -y)) */
const CHICK_POSE = `
uniform float uTime; attribute vec2 aPart; attribute vec4 aAnim; attribute vec4 aLook; attribute vec3 aTint;
vec3 rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
vec3 rotZ(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }`;
const CHICK_VERTS = `vec3 objectNormal = vec3(normal); vec3 posed = position;
  { // aPart: x part (0 body, 1 head, 2/3 legs, 4/5 wings), y flag (2 = the rooster's only); aAnim: stride phase, stride, peck, flap; aLook: head turn, rooster, flap phase
    const vec3 HIP = vec3(0.0, 0.135, -0.02), NECK = vec3(0.0, 0.25, 0.06), SH = vec3(0.07, 0.245, 0.02);
    float part = aPart.x;
    if (aPart.y > 1.5 && aLook.y < 0.5) posed = vec3(0.0, 0.2, 0.0);                      // a hen: no comb, cape or sickles
    else if (part > 1.5 && part < 3.5) {                                                  // legs swing from the hip
      float a = sin(aAnim.x + (part > 2.5 ? 3.14159 : 0.0)) * 0.55 * aAnim.y; posed = rotX(posed - HIP, a) + HIP; objectNormal = rotX(objectNormal, a);
    } else {
      if (part > 0.5 && part < 1.5) {                                                     // the head: pecks, turns, bobs as she walks
        float a = aAnim.z * 1.4 + sin(aAnim.x * 2.0) * 0.12 * aAnim.y, b = aLook.x;
        posed = rotY(rotX(posed - NECK, a), b) + NECK; objectNormal = rotY(rotX(objectNormal, a), b);
      }
      if (part > 3.5) {                                                                   // wings beat outwards
        float sd = part < 4.5 ? 1.0 : -1.0, c = sd * aAnim.w * (0.35 + 0.9 * (0.5 + 0.5 * sin(uTime * 30.0 + aLook.z))); vec3 p = SH * vec3(sd, 1.0, 1.0);
        posed = rotZ(posed - p, c) + p; objectNormal = rotZ(objectNormal, c);
      }
      float bp = max(aAnim.z, 0.0) * 0.7; posed = rotX(posed - HIP, bp) + HIP; objectNormal = rotX(objectNormal, bp);   // she tips forward to peck
    }
  }`;

/** Hens and a rooster (one instanced mesh), the tea house cat and the village dog (a skinned mesh each). */
function villageCritters(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, low: boolean, sfx: Sfx, [chickG, catG, dogG]: Gltf[],
  coat: THREE.Material, uTime: { value: number }, r: () => number) {
  const loc = (s: { x: number; z: number; yaw: number }, ax: number, az: number): [number, number] => {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); return [s.x + ax * c + az * sn, s.z - ax * sn + az * c];   // a spot's frame, as npcs.ts
  };
  // where they may step: dry, well inside the edge, and not inside anything solid (houses, the deck, fences, trees, props)
  const FLAGS = RAPIER.QueryFilterFlags.ONLY_FIXED | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, qp = { x: 0, y: 0, z: 0 };
  const notGround = (c: RAPIER.Collider) => c.shapeType() !== RAPIER.ShapeType.HeightField;
  let hit = false; const onHit = () => { hit = true; return false; };
  const clear = (x: number, z: number) => {
    const g = t.heightAt(x, z), w = t.waterAt(x, z);
    if ((w === w && w > g + 0.03) || !insideEdge(I.outline, x * 1.08, z * 1.08)) return false;
    hit = false; qp.x = x; qp.y = g + 0.3; qp.z = z; world.intersectionsWithPoint(qp, onHit, FLAGS, undefined, undefined, undefined, notGround); return !hit;
  };
  /** a step along heading (hx, hz), sliding round whatever is in the way; false if boxed in */
  const step = (a: { x: number; z: number; yaw: number }, hx: number, hz: number, v: number, dt: number, rate = 6) => {
    for (const k of AROUND) {
      const c = Math.cos(k), s = Math.sin(k), dx = hx * c - hz * s, dz = hx * s + hz * c, nx = a.x + dx * v * dt, nz = a.z + dz * v * dt;
      if (clear(nx + dx * 0.3, nz + dz * 0.3)) { a.x = nx; a.z = nz; a.yaw += wrap(Math.atan2(dx, dz) - a.yaw) * Math.min(1, dt * rate); return true; }
    }
    return false;
  };
  const near = (x: number, z: number, cam: THREE.Vector3, d: number) => (cam.x - x) ** 2 + (cam.z - z) ** 2 < d * d;

  // ---- the flock: three hens and the rooster about the smithy yard, one more hen in the lane between two houses
  const src = chickG.scene.getObjectByProperty('isMesh', true) as THREE.Mesh; src.updateWorldMatrix(true, false);
  const geo = toFloat(src.geometry.clone()).applyMatrix4(src.matrixWorld), uv = geo.getAttribute('uv'), part = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) { part[i * 2] = Math.floor(uv.getX(i) * 16); part[i * 2 + 1] = Math.floor((1 - uv.getY(i)) * 4); }   // see tag() in animals_build.py
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 2)); geo.deleteAttribute('uv');
  const yard: [number, number, number] = [...loc(I.spots.smithy, -5, -1.5), 3], H = I.houses;
  const lane: [number, number, number] = [(H[0][0] + H[1][0]) / 2, (H[0][1] + H[1][1]) / 2, 2.5];
  const birds: [boolean, [number, number, number], number][] = [[true, yard, 0xa8441c], [false, yard, 0xfffaf0], [false, yard, 0x9a5c2e], [false, lane, 0xe0ad66]];
  if (low) birds.splice(2, 1);
  const N = birds.length, aAnim = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4), aLook = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aTint = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  geo.setAttribute('aAnim', aAnim); geo.setAttribute('aLook', aLook); geo.setAttribute('aTint', aTint);
  const henMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  henMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + CHICK_POSE)
      .replace('#include <beginnormal_vertex>', CHICK_VERTS).replace('#include <begin_vertex>', 'vec3 transformed = posed;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n  vColor.rgb *= mix(vec3(1.0), aTint, step(0.5, aPart.y) * step(aPart.y, 1.5));');   // plumage takes the bird's colour
  };
  const flock = new THREE.InstancedMesh(geo, henMat, N); flock.name = 'hens'; flock.frustumCulled = false; flock.receiveShadow = true; scene.add(flock);
  const col = new THREE.Color(), pickIn = (h: [number, number, number]): [number, number] | null => {
    for (let k = 0; k < 6; k++) { const a = r() * 6.283, d = Math.sqrt(r()) * h[2], x = h[0] + Math.cos(a) * d, z = h[1] + Math.sin(a) * d; if (clear(x, z)) return [x, z]; }
    return null;
  };
  const hens: Hen[] = birds.map(([rooster, home, tint], i) => {
    col.setHex(tint); aTint.setXYZ(i, col.r, col.g, col.b); aLook.setXYZW(i, 0, rooster ? 1 : 0, r() * 6.28, 0);
    const a = r() * 6.283, d = r() * home[2] * 0.7, x = home[0] + Math.cos(a) * d, z = home[1] + Math.sin(a) * d;
    return { rooster, x, z, yaw: r() * 6.28, home, goal: [x, z], state: 'peck', t: 1 + r() * 4, phase: 0, walk: 0, peck: 0, flap: 0, look: 0, lookTo: 0, hop: 0, pecks: 0, pt: 0, pause: r(), s: rooster ? 1.15 : 0.95 + r() * 0.08 };
  });
  aTint.needsUpdate = true;

  // ---- the cat, curled up asleep on the tea house deck before the shoji, clear of the door, the benches and the veranda seat
  const pet = (g: Gltf, x: number, z: number, y: number, yaw: number, state: string, name: string): Pet => {
    const root = g.scene; root.name = name;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh; if (!m.isMesh) return;
      m.material = coat; m.castShadow = !low; m.receiveShadow = true;
      if (m.isSkinnedMesh) m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 1.0);   // cull by a sphere round the animal, not its rest pose
    });
    const mixer = new THREE.AnimationMixer(root), acts = Object.fromEntries(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
    for (const n of ['wake', 'settle', 'lie_down']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; }
    acts[state].play(); mixer.update(r() * 4); scene.add(root);
    return { root, mixer, acts, clip: state, x, z, y, yaw, state, t: 0 };
  };
  const play = (p: Pet, name: string, speed = 1, fade = 0.3) => {
    const act = p.acts[name]; act.timeScale = speed; if (name === p.clip) return;
    act.reset().fadeIn(fade).play(); p.acts[p.clip].fadeOut(fade); p.clip = name;
  };
  const once = (p: Pet, name: string, state: string, fade = 0.25) => { play(p, name, 1, fade); p.state = state; p.t = p.acts[name].getClip().duration; };
  const tea = I.spots.teahouse, [kx, kz] = loc(tea, 0.55, 2.3);
  const cat = pet(catG, kx, kz, tea.y + 0.64, tea.yaw + 2.4, 'sleep', 'cat');               // the deck's top: village_build.py teahouse(), prefab at the spot's y
  let catAway = 0;

  // ---- the dog: a round of the main street (path 0) between the houses, a nap on the grass in the sun on the way
  const P0 = I.paths[0], along = (a: number[], b: number[], u: number, off: number): [number, number] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [a[0] + dx * u + (dz / l) * off, a[1] + dz * u - (dx / l) * off];
  };
  const route = [along(P0[3], P0[4], 0.25, 0.7), along(P0[3], P0[4], 0.6, 3), along(P0[3], P0[4], 1, 1.6), along(P0[4], P0[5], 0.55, 0.9)], NAP = 1;
  const dog = pet(dogG, route[0][0], route[0][1], t.heightAt(route[0][0], route[0][1]), 0, 'idle', 'dog');
  dog.state = 'look'; dog.t = 2;
  let wp = 1, dir = 1, cool = 20, stuck = 0, flapped = 0, clock = 0, dtNow = 0;
  const run = (hx: number, hz: number, v: number) => {
    if (step(dog, hx, hz, v, dtNow, 5)) { stuck = 0; play(dog, v > 2.5 ? 'run' : 'walk', v > 2.5 ? 1 : v / 1.5, 0.2); return true; }
    stuck += dtNow; play(dog, 'idle'); return false;
  };
  const nextStop = () => { if (wp + dir < 0 || wp + dir >= route.length) dir = -dir; wp += dir; dog.state = 'go'; };

  return {
    update(dt: number, player: THREE.Vector3, speed: number, cam: THREE.Vector3) {
      clock += dt; dtNow = dt;
      // the flock
      if (near(hens[0].x, hens[0].z, cam, 70) || near(hens[N - 1].x, hens[N - 1].z, cam, 70)) {
        flock.visible = true;
        for (let i = 0; i < N; i++) {
          const h = hens[i], dx = h.x - player.x, dz = h.z - player.z, d = Math.hypot(dx, dz);
          h.t -= dt;
          if (h.state !== 'flee' && (d < 1.7 || (d < 4.5 && speed > 4.5))) {                // scatter, wings going
            const a = Math.atan2(dx, dz) + (r() - 0.5) * 1.4; h.goal = [Math.sin(a), Math.cos(a)]; h.state = 'flee'; h.t = 0.6 + r() * 0.5;
            if (clock - flapped > 1.2 && d < 20) { flapped = clock; sfx?.flutter(); sfx?.cluck?.(d, true); }
          }
          if (h.state === 'peck' && d < 14 && r() < dt * 0.05) sfx?.cluck?.(d);   // now and then, pecking about
          let walk = 0, flap = 0, peck = 0;
          if (h.state === 'flee') {
            if (!step(h, h.goal[0], h.goal[1], 2.3, dt, 12)) h.goal = [-h.goal[1], h.goal[0]];
            h.phase += dt * 30; walk = 1; flap = 1; h.hop = Math.abs(Math.sin(h.phase * 0.5)) * 0.1;
            if (h.t < 0) { h.state = 'peck'; h.t = 1.5 + r() * 2; h.hop = 0; }
          } else if (h.state === 'walk') {
            const hx = h.goal[0] - h.x, hz = h.goal[1] - h.z, hl = Math.hypot(hx, hz);
            if (hl < 0.15 || h.t < 0 || !step(h, hx / hl, hz / hl, 0.4, dt)) { h.state = 'peck'; h.t = 2 + r() * 4; }
            h.phase += dt * 18; walk = 1;
          } else if (h.state === 'crow') {                                              // the rooster throws his head back
            peck = -0.55 * Math.min(1, (1.8 - h.t) * 4, h.t * 3); flap = h.t > 1.2 ? 0.4 : 0;
            if (h.t < 0) { h.state = 'peck'; h.t = 2 + r() * 3; }
          } else {                                                                       // pecking: a few quick jabs, then a look round
            if (h.pecks > 0) { h.pt += dt / 0.28; peck = Math.sin(Math.PI * Math.min(1, h.pt)); if (h.pt >= 1) { h.pt = 0; h.pecks--; } }
            else if ((h.pause -= dt) < 0) { h.pecks = 1 + Math.floor(r() * 3); h.pause = 0.5 + r() * 1.8; h.lookTo = (r() - 0.5) * 1.4; }
            else if (r() < dt * 1.5) h.lookTo = (r() - 0.5) * 1.6;
            if (h.t < 0) {
              const g = r() < 0.65 ? pickIn(h.home) : null;
              if (g) { h.state = 'walk'; h.goal = g; h.t = 8; } else if (h.rooster && r() < 0.25) { h.state = 'crow'; h.t = 1.8; sfx?.crow?.(d); } else h.t = 1 + r() * 3;
            }
          }
          if (h.pecks > 0 && h.state !== 'peck') h.pecks = 0;
          h.walk += (walk - h.walk) * Math.min(1, dt * 8); h.flap += (flap - h.flap) * Math.min(1, dt * 10); h.peck += (peck - h.peck) * Math.min(1, dt * 25);
          h.look += (h.lookTo * (h.pecks > 0 ? 0 : 1) - h.look) * Math.min(1, dt * 18);   // a chicken's head snaps round
          aAnim.setXYZW(i, h.phase, h.walk, h.peck, h.flap); aLook.setX(i, h.look);
          flock.setMatrixAt(i, M4.compose(V3.set(h.x, t.heightAt(h.x, h.z) + h.hop, h.z), Q.setFromAxisAngle(UP, h.yaw), SC.setScalar(h.s)));
        }
        aAnim.needsUpdate = aLook.needsUpdate = flock.instanceMatrix.needsUpdate = true;
      } else flock.visible = false;

      // the cat: asleep until you come right up; wakes, stretches and sits watching you; curls up again once you've gone
      const cd = Math.hypot(player.x - cat.x, player.z - cat.z);
      cat.t -= dt;
      if (cat.state === 'sleep') { if (cd < 1.6) { once(cat, 'wake', 'wake'); sfx?.meow?.(cd); } }   // (sitting on the veranda beside her, 1.8 m off, lets her sleep)
      else if (cat.state === 'wake' || cat.state === 'settle') { if (cat.t < 0) { play(cat, cat.state === 'wake' ? 'sit' : 'sleep', 1, 0.2); cat.state = cat.state === 'wake' ? 'sit' : 'sleep'; } }
      else {                                                                             // sitting up
        if (cd < 6) cat.yaw += wrap(Math.atan2(player.x - cat.x, player.z - cat.z) - cat.yaw) * Math.min(1, dt * 1.5);
        catAway = cd > 4.5 ? catAway + dt : 0; if (catAway > 6) { catAway = 0; once(cat, 'settle', 'settle'); }
      }
      cat.root.position.set(cat.x, cat.y, cat.z); cat.root.rotation.y = cat.yaw;
      if (near(cat.x, cat.z, cam, 45)) cat.mixer.update(dt);

      // the dog
      const D = dog, dd = Math.hypot(player.x - D.x, player.z - D.z), toP = Math.atan2(player.x - D.x, player.z - D.z);
      D.t -= dt; cool -= dt;
      const friend = D.state === 'greet' || D.state === 'wag' || D.state === 'follow';
      if (!friend && cool < 0 && dd < 9 && r() < dt * (D.state === 'lie' ? 0.15 : 0.5)) { D.state = 'greet'; D.t = 14 + r() * 10; stuck = 0; sfx?.bark?.(dd); }   // it spots you, woofs and trots over
      if (friend && (D.t < 0 || dd > 16 || stuck > 2)) {                                 // loses interest: back to its round
        cool = 40 + r() * 30; let b = 1e9; route.forEach(([x, z], k) => { const e = Math.hypot(x - D.x, z - D.z); if (e < b) { b = e; wp = k; } }); D.state = 'go';
      }
      if (D.state === 'go') {
        const [gx, gz] = route[wp], hx = gx - D.x, hz = gz - D.z, hl = Math.hypot(hx, hz);
        if (hl < 0.4) {
          if (wp === NAP && r() < 0.75) once(D, 'lie_down', 'down', 0.25);
          else { D.state = r() < 0.6 ? 'sniff' : 'look'; D.t = 2.5 + r() * 3; }
        } else if (!run(hx / hl, hz / hl, 1.5) && stuck > 2) { stuck = 0; nextStop(); }   // something in the way: on to the next stop
      } else if (D.state === 'down') { if (D.t < 0) { play(D, 'lie', 1, 0.2); D.state = 'lie'; D.t = 15 + r() * 20; } }
      else if (D.state === 'lie') { if (D.t < 0) { play(D, 'idle', 1, 0.7); D.state = 'look'; D.t = 1.5; } }
      else if (D.state === 'sniff' || D.state === 'look') { play(D, D.state === 'sniff' ? 'graze' : 'idle'); if (D.t < 0) nextStop(); }
      else if (D.state === 'greet') {
        if (dd < 1.5) { D.state = 'wag'; stuck = 0; } else run((player.x - D.x) / dd, (player.z - D.z) / dd, dd > 5 ? 4.3 : 1.6);
      } else {                                                                           // wagging at your feet, then tagging along
        if (dd > 2.6) { D.state = 'follow'; run((player.x - D.x) / dd, (player.z - D.z) / dd, dd > 5 || speed > 3 ? 4.3 : 1.6); }
        else { D.state = 'wag'; D.yaw += wrap(toP - D.yaw) * Math.min(1, dt * 4); play(D, dd < 2 ? 'wag' : 'idle'); }
      }
      D.y = t.heightAt(D.x, D.z); D.root.position.set(D.x, D.y, D.z); D.root.rotation.y = D.yaw;
      if (near(D.x, D.z, cam, 70)) D.mixer.update(dt);
    },
    list: () => [...hens.map((h) => ({ kind: h.rooster ? 'rooster' : 'hen', state: h.state, pos: [h.x, t.heightAt(h.x, h.z), h.z] })), { kind: 'cat', state: cat.state, pos: [cat.x, cat.y, cat.z] },
      { kind: 'dog', state: dog.state, pos: [dog.x, dog.y, dog.z] }].map((a) => ({ ...a, pos: a.pos.map((n) => +n.toFixed(2)) })),
  };
}
const UP = new THREE.Vector3(0, 1, 0), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V3 = new THREE.Vector3(), SC = new THREE.Vector3();
