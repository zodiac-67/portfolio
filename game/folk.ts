import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Island } from './island';
import { insideEdge, type Terrain } from './terrain';
import { marketStalls } from './market';
import { buildFarm, FARM, inGarden } from './farm';

// Background folk (not talkable): three children playing tag round the square who break off now and then to spin a top
// and bounce a temari by the house on its west side, a girl flying a kite on the meadow with three friends (a second kite,
// a boy running out under them, a little one sitting in the grass clapping), a shopper with a basket going from stall to
// stall, the vendor at the first stall, the farmer Gonbei at his round on the farm (farm.ts: hoeing, carrying water on his
// shoulder pole and ladling it over the rows, picking into a basket, a rest on the stump) and an old man fishing from the
// koi pond's bank. The kite friends are clones of the children's rigs (SkeletonUtils), their clothes dyed other colours
// in the shader by folk.glb's `_dye` mask (no new meshes). folk.glb (folk_build.py): one skinned mesh per person on one shared atlas
// material (one draw each), one clip set keyed on the farmer's rig and played on every rig by bone name (rotations carry
// over; the pelvis move is scaled to each one's hip height). Their props ride on free bones the code places (kite, top,
// ball, float, the farmer's basket and shoulder pole) or on hand bones it shrinks away while unused (hoe, ladle); the kite
// strings and the fishing line are one LineSegments. Far and unseen folk animate
// rarely or not at all; only those within 15 m cast shadows; a phone gets two children and the vendor.

const WALK = 1.32, RUN = 7.89;                                                     // planted-foot ground speed per m of hip at timeScale 1 (folk_build.py)
const LOW_SET = new Set(['kenta', 'oharu', 'kichibei']);
type Folk = {
  id: string; root: THREE.Group; mesh: THREE.SkinnedMesh; mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction>; cur: THREE.AnimationAction | null;
  hip: number; x: number; z: number; yaw: number; drawn: number; acc: number; k: number; shade: boolean; side: number;
  over: THREE.Object3D[]; saved: THREE.Quaternion[];                              // neck, head, right arm: laid over the clip, put back before each mixer step
  look: number; wave: number; lastWave: number; near: boolean; hand: THREE.Object3D | null; point: boolean; lookAt: THREE.Vector3 | null;
  prop: THREE.Object3D | null; q0: THREE.Quaternion; tip: THREE.Object3D | null;
};
/** a clone's clothes dyed: the `aDye` cloth takes the tint, keeping its weave's light and dark (one shared program) */
function dyed(base: THREE.MeshStandardMaterial, tint: number) {
  const m = base.clone(), u = { value: new THREE.Color(tint) };
  m.onBeforeCompile = (s) => {
    s.uniforms.uDye = u;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aDye; varying float vDye;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDye = aDye;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uDye; varying float vDye;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uDye * (0.3 + 1.3 * dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), vDye);');
  };
  m.customProgramCacheKey = () => 'folk-dye'; return m;
}
const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _a = new THREE.Quaternion(), _m = new THREE.Matrix4();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** turn a bone about a world axis (the parent's turn taken out, so it reads the same whatever the pose) */
function turnW(b: THREE.Object3D, axis: THREE.Vector3, ang: number) {
  b.parent!.getWorldQuaternion(_pq); _q.setFromAxisAngle(axis, ang); _a.copy(_pq).invert().multiply(_q).multiply(_pq); b.quaternion.premultiply(_a);
}

/** sounds: optional (audio.ts), giggles when someone's tagged and the vendor's call */
export async function buildFolk(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, t: Terrain, I: Island, low: boolean, sounds?: { giggle?: (d: number) => void; call?: (d: number) => void }) {
  const none = { update(_dt: number, _p: THREE.Vector3) {} };
  const g = await loader.loadAsync('/game/folk.glb').catch(() => null); if (!g) return none;
  // the clips are keyed on the farmer's bones; the loader made every repeated bone name unique (pelvis_1...): take each
  // track back to its plain bone name, then give every rig its plain names, so one clip drives anyone
  const ref = g.scene.getObjectByName('folk_gonbei')!, plain = new Map<string, string>();
  ref.traverse((o) => plain.set(o.name, (o.userData.name as string) ?? o.name));
  for (const c of g.animations) for (const tr of c.tracks) { const i = tr.name.indexOf('.'); tr.name = (plain.get(tr.name.slice(0, i)) ?? tr.name.slice(0, i)) + tr.name.slice(i); }
  const hipOf = (arm: THREE.Object3D) => (arm.getObjectByName('pelvis') as THREE.Object3D).position.length();
  const arms = g.scene.children.filter((o) => o.name.startsWith('folk_'));
  arms.forEach((a) => a.traverse((o) => { if (o.userData.name) o.name = o.userData.name; }));
  const hipR = hipOf(ref), folk: Record<string, Folk> = {}, fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  let k = 0;
  const make = (id: string, arm: THREE.Object3D, tint?: number) => {
    const root = new THREE.Group(); root.add(arm); scene.add(root);
    const mesh = arm.children.find((o) => (o as THREE.SkinnedMesh).isSkinnedMesh) as THREE.SkinnedMesh, ga = mesh.geometry;
    if (ga.attributes._dye) { ga.setAttribute('aDye', ga.attributes._dye); ga.deleteAttribute('_dye'); }
    if (tint === undefined) { const mat = mesh.material as THREE.MeshStandardMaterial; mat.side = THREE.DoubleSide; mat.roughness = 0.85; mat.metalness = 0; mat.vertexColors = false; }
    else mesh.material = dyed(mesh.material as THREE.MeshStandardMaterial, tint);
    mesh.receiveShadow = !low; mesh.castShadow = false;
    // a fixed sphere round the figure (and its rod), so the unseen are skipped; the kites and the farmer's things go too far for one
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), id === 'mohei' ? 3.2 : 1.6); mesh.frustumCulled = !['suzu', 'kiku', 'gonbei'].includes(id);
    const hip = hipOf(arm), s = hip / hipR, mixer = new THREE.AnimationMixer(root);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const c of g.animations) {
      const tracks = c.tracks.map((tr) => {
        if (tr.name !== 'pelvis.position' || Math.abs(s - 1) < 1e-3) return tr;
        const cl = tr.clone(); for (let i = 0; i < cl.values.length; i++) cl.values[i] *= s; return cl;   // a child's hips ride lower
      });
      acts[c.name] = mixer.clipAction(new THREE.AnimationClip(c.name, c.duration, tracks));
    }
    const b = (n: string) => arm.getObjectByName(n) ?? null, over = ['neck_01', 'head', 'upperarm_r', 'lowerarm_r'].map(b) as THREE.Object3D[];
    const f: Folk = {
      id, root, mesh, mixer, acts, cur: null, hip, x: 0, z: 0, yaw: 0, drawn: -9, acc: 0, k: k++, shade: false, side: 0,
      over, saved: over.map((o) => o.quaternion.clone()), look: 0, wave: 0, lastWave: -99, near: false, hand: b('hand_r'), point: false, lookAt: null,
      prop: b('prop'), q0: b('prop')?.quaternion.clone() ?? new THREE.Quaternion(), tip: b('tip'),
    };
    mesh.onBeforeRender = () => { f.drawn = frame; };
    return (folk[id] = f);
  };
  const src: Record<string, THREE.Object3D> = {};
  for (const arm of arms) { const id = arm.name.slice(5); src[id] = arm; if (!low || LOW_SET.has(id)) make(id, arm); }
  // the kite friends (not on a phone): a girl with a second kite, a boy who runs out under them, a little one in the grass
  if (!low && src.suzu) { make('kiku', cloneRig(src.suzu), 0x8a2f4a); make('taro', cloneRig(src.sanpei), 0x2f5a3a); make('mii', cloneRig(src.oharu), 0xd09a2a); }
  let frame = 0, now = 0;
  const play = (f: Folk, name: string, scale = 1, fade = 0.3, once = false) => {
    const a = f.acts[name]; if (!a) return; a.timeScale = scale;
    if (f.cur === a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once; a.fadeIn(fade).play();
    f.cur?.fadeOut(fade); f.cur = a;
  };
  const put = (f: Folk) => { f.root.position.set(f.x, t.heightAt(f.x, f.z), f.z); f.root.rotation.y = f.yaw; };
  const face = (f: Folk, yaw: number, dt: number, rate = 8) => { f.yaw += wrap(yaw - f.yaw) * (1 - Math.exp(-dt * rate)); };
  /** a free bone (kite, top, ball, float) to a world point and turn; s scales it (0: put away) */
  const setProp = (f: Folk, at: THREE.Vector3, q: THREE.Quaternion | null, s = 1, p = f.prop!, q0 = f.q0) => {
    p.parent!.updateWorldMatrix(true, false); p.position.copy(at); p.parent!.worldToLocal(p.position);
    p.parent!.getWorldQuaternion(_pq); p.quaternion.copy(_pq.invert()); if (q) p.quaternion.multiply(q); p.quaternion.multiply(q0); p.scale.setScalar(Math.max(s, 1e-3));
  };
  /** walk or run toward a point, stepping round the ronin; true on arrival */
  let player = new THREE.Vector3();
  const goTo = (f: Folk, tx: number, tz: number, v: number, dt: number, clip?: string) => {
    const dx = tx - f.x, dz = tz - f.z, d = Math.hypot(dx, dz); if (d < 0.08) return true;
    let ux = dx / d, uz = dz / d; const px = player.x - f.x, pz = player.z - f.z, pd = Math.hypot(px, pz);
    if (pd < 1.8 && px * ux + pz * uz > 0) { const sd = px * uz - pz * ux > 0 ? 1 : -1, w = (1.8 - pd) / 1.8 * 1.6; ux += uz * sd * w; uz -= ux * sd * w; const n = Math.hypot(ux, uz); ux /= n; uz /= n; }   // step aside, away from his side
    const step = Math.min(d, v * dt); f.x += ux * step; f.z += uz * step; face(f, Math.atan2(ux, uz), dt);
    play(f, clip ?? (v > 2 ? 'run' : 'walk'), v / ((v > 2 ? RUN : WALK) * f.hip), 0.25); return false;
  };
  const glance = (f: Folk, pd: number) => pd < 7 && Math.abs(wrap(Math.atan2(player.x - f.x, player.z - f.z) - f.yaw)) < 1.9;

  // ---------------------------------------------------------------- the children: tag round the square, play by the house
  const SQ = I.spots.square, C = { x: SQ.x - 1.5, z: SQ.z - 2.5 }, RX = 3.2, RZ = 2.6, N = 72;   // west of the market corner, clear of the sakura and Yuki
  const loop: number[] = [], cum: number[] = [0];
  for (let i = 0; i <= N; i++) { const a = (2 * Math.PI * i) / N; loop.push(C.x + RX * Math.cos(a), C.z + RZ * Math.sin(a)); if (i) cum.push(cum[i - 1] + Math.hypot(loop[i * 2] - loop[i * 2 - 2], loop[i * 2 + 1] - loop[i * 2 - 1])); }
  const L = cum[N], onLoop = (s: number, out: number[]) => {
    s = ((s % L) + L) % L; let i = 0; while (cum[i + 1] < s) i++;
    const u = (s - cum[i]) / (cum[i + 1] - cum[i]), x0 = loop[i * 2], z0 = loop[i * 2 + 1], x1 = loop[i * 2 + 2], z1 = loop[i * 2 + 3], tl = Math.hypot(x1 - x0, z1 - z0);
    out[0] = x0 + (x1 - x0) * u; out[1] = z0 + (z1 - z0) * u; out[2] = (x1 - x0) / tl; out[3] = (z1 - z0) / tl;   // point, then the way round
  };
  const PLAY: Record<string, [number, number, number]> = {                          // by the west house, off its door path: x, z, facing
    oharu: [SQ.x - 6.6, SQ.z - 1.2, Math.PI / 2], kenta: [SQ.x - 7.2, SQ.z - 2.6, 1.0], sanpei: [SQ.x - 6.0, SQ.z - 3.4, -0.4] };
  const kids = ['kenta', 'oharu', 'sanpei'].map((id) => folk[id]).filter(Boolean);
  const K = kids.map((f, i) => ({ f, s: (L * i) / kids.length, it: i === 0, pause: 0, mode: 'tag' as 'tag' | 'go' | 'play' | 'back', pt: [0, 0, 0, 0] }));
  let phase = 'tag', phaseT = rand(35, 50), topT = 0, topLife = 0;
  const top = new THREE.Vector3();
  K.forEach((c) => { onLoop(c.s, c.pt); c.f.x = c.pt[0]; c.f.z = c.pt[1]; });
  function kidsUpdate(dt: number) {
    if (!K.length) return;
    if ((phaseT -= dt) <= 0) {
      if (phase === 'tag') { phase = 'play'; phaseT = rand(28, 40); K.forEach((c) => (c.mode = 'go')); }
      else { phase = 'tag'; phaseT = rand(35, 50); K.forEach((c) => (c.mode = 'back')); }
    }
    for (const c of K) {
      const f = c.f;
      if (c.mode === 'tag') {
        let v = c.it ? 3.4 : 2.9 + 0.35 * Math.sin(now * 0.7 + f.k * 2);
        for (const o of K) if (o !== c && !o.it && !c.it && o.mode === 'tag' && ((o.s - c.s) % L + L) % L < 0.9) v = Math.min(v, 2.6);   // don't run up a friend's heels
        if (c.pause > 0) { c.pause -= dt; v = 0; }
        c.s += v * dt; onLoop(c.s, c.pt);
        // the loop's outward normal is (tz, -tx): step out or in round the ronin, then back onto the loop
        const nx = c.pt[3], nz = -c.pt[2], px = player.x - c.pt[0], pz = player.z - c.pt[1], pd = Math.hypot(px, pz);
        const want = pd < 1.7 ? THREE.MathUtils.clamp(-(px * nx + pz * nz >= 0 ? 1 : -1) * (1.7 - pd) * 1.2, -1.3, 1.3) : 0;
        f.side += (want - f.side) * (1 - Math.exp(-dt * 5));
        f.x = c.pt[0] + nx * f.side; f.z = c.pt[1] + nz * f.side; face(f, Math.atan2(c.pt[2], c.pt[3]), dt, 12);
        if (v > 0) play(f, 'run', v / (RUN * f.hip), 0.2); else play(f, 'idle', 1, 0.2);
        if (c.it && c.pause <= 0) for (const o of K) if (o !== c && o.mode === 'tag' && ((o.s - c.s) % L + L) % L < 0.7) { c.it = false; o.it = true; o.pause = 1.4; sounds?.giggle?.(Math.hypot(player.x - f.x, player.z - f.z)); break; }   // tagged! a giggle; counts, then gives chase
      } else if (c.mode === 'go' || c.mode === 'back') {
        let tx: number, tz: number;
        if (c.mode === 'go') [tx, tz] = PLAY[f.id] ?? [f.x, f.z]; else { onLoop(c.s, c.pt); tx = c.pt[0]; tz = c.pt[1]; }
        if (goTo(f, tx, tz, 2.6, dt)) { c.mode = c.mode === 'go' ? 'play' : 'tag'; if (c.mode === 'play') { f.side = 0; if (f.id === 'kenta') topT = 0.1; } }
      } else {                                                                     // playing: temari, the top, and a friend crouched to watch it
        const p = PLAY[f.id]; if (p) face(f, p[2], dt, 4);
        if (f.id === 'oharu') play(f, 'bounce', 1, 0.3);
        else if (f.id === 'kenta') { if (f.cur !== f.acts.give || !f.cur.isRunning()) play(f, 'crouch', 1, 0.4); }
        else play(f, 'crouch', 1, 0.4);
      }
      put(f);
    }
    // the top: thrown from Kenta's hand, spins upright, wobbles as it slows, falls over; then he throws it again
    const kn = folk.kenta, kc = K.find((c) => c.f === kn);
    if (kn?.prop && kc) {
      if (kc.mode === 'play') {
        if (topT > 0 && (topT -= dt) <= 0) { play(kn, 'give', 1, 0.2, true); topLife = -0.8; }   // a throw; it lands 0.8 s on
        if (topLife < 0 && (topLife += dt) >= 0) { topLife = 0.001; top.set(kn.x + Math.sin(kn.yaw) * 0.75, 0, kn.z + Math.cos(kn.yaw) * 0.75); top.y = t.heightAt(top.x, top.z); }
        if (topLife > 0) {
          topLife += dt; const tilt = Math.min(1.35, 0.03 + 0.012 * topLife * topLife), spin = topLife < 9 ? now * (40 - 3 * topLife) : 0;
          _q.setFromAxisAngle(_v.set(Math.cos(topLife * 4), 0, Math.sin(topLife * 4)), topLife < 9 ? tilt * (0.3 + 0.7 * Math.min(1, topLife / 9)) : 1.35).multiply(_a.setFromAxisAngle(UP, spin));
          setProp(kn, top, _q); if (topLife > 11) { topLife = 0; topT = rand(1, 2.5); }
        } else setProp(kn, _w.set(kn.x, t.heightAt(kn.x, kn.z) + 0.6, kn.z), null, 0);
      } else { topLife = 0; setProp(kn, _w.set(kn.x, t.heightAt(kn.x, kn.z) + 0.6, kn.z), null, 0); }
    }
    const oh = folk.oharu, oc = K.find((c) => c.f === oh);
    if (oh?.prop && oh.hand && oc) {                                                 // the temari bounces under her right hand (in step with the clip)
      if (oc.mode === 'play' && oh.cur === oh.acts.bounce) {
        oh.hand.getWorldPosition(_v); const g0 = t.heightAt(_v.x, _v.z) + 0.075, ph = (oh.cur.time % (2 / 3)) / (2 / 3);
        _v.y = g0 + Math.max(0, _v.y - 0.09 - g0) * Math.abs(Math.sin(Math.PI * ph)); setProp(oh, _v, null);
      } else setProp(oh, _w.set(oh.x, t.heightAt(oh.x, oh.z) + 0.6, oh.z), null, 0);
    }
  }

  // ---------------------------------------------------------------- the kites on the meadow, and Suzu's friends
  const suzu = folk.suzu, kiku = folk.kiku, taro = folk.taro, mii = folk.mii, M = I.spots.meadow, wind = new THREE.Vector3(-1, 0, -0.35).normalize();
  const across = new THREE.Vector3(-wind.z, 0, wind.x), WY = Math.atan2(wind.x, wind.z);
  type Flyer = { f: Folk; x: number; z: number; len: number; ph: number; s: number; kite: THREE.Vector3; swoop: number; spot: THREE.Vector3 };
  const flyers: Flyer[] = [];
  const fly = (f: Folk | undefined, x: number, z: number, len: number, ph: number, s: number) => {
    if (!f) return; f.x = x; f.z = z; f.yaw = WY; put(f); play(f, 'kite'); f.mixer.update(ph);
    flyers.push({ f, x, z, len, ph, s, kite: new THREE.Vector3(), swoop: 0, spot: new THREE.Vector3(x, 0, z) });
  };
  fly(suzu, M.x - 8, M.z - 10, 20, 0, 1); fly(kiku, M.x - 8 + across.x * 3.4, M.z - 10 + across.z * 3.4, 15, 2.1, 0.8);   // Kiku's kite is smaller, on a shorter line
  /** a kite on its line: bobbing and drifting across the wind; a show-off dive and sweep while `swoop` runs down */
  function kitePos(k: Flyer) {
    const u = k.swoop > 0 ? 1 - k.swoop / 4 : 0, dive = Math.sin(Math.PI * u), sweep = Math.sin(2 * Math.PI * u), g = t.heightAt(k.x, k.z);
    const e = 0.62 + 0.08 * Math.sin(now * 0.5 + k.ph) + 0.04 * Math.sin(now * 1.3 + k.ph) - 0.3 * dive, sw = 2.5 * Math.sin(now * 0.31 + k.ph) + Math.sin(now * 0.9 + k.ph) + 4 * sweep;
    k.kite.set(k.x + wind.x * k.len * Math.cos(e) - wind.z * sw, g + 1.2 + k.len * Math.sin(e), k.z + wind.z * k.len * Math.cos(e) + wind.x * sw);
    _v.set(k.x, g + 1.1, k.z); _m.lookAt(_v, k.kite, UP); _q.setFromRotationMatrix(_m).multiply(_a.setFromAxisAngle(_f.set(0, 0, 1), 0.25 * Math.sin(now * 1.7 + k.ph) + 0.8 * sweep));   // its face to her, rocking
    setProp(k.f, k.kite, _q, k.s);
  }
  // Taro waits between the two girls and runs out under a kite now and then; Mii sits behind them in the grass
  const TARO = new THREE.Vector3(M.x - 8 - wind.x * 1.6 + across.x * 1.7, 0, M.z - 10 - wind.z * 1.6 + across.z * 1.7), runTo = new THREE.Vector3();
  if (taro) { taro.x = TARO.x; taro.z = TARO.z; taro.yaw = WY; put(taro); play(taro, 'idle'); }
  if (mii) {
    mii.x = M.x - 8 - wind.x * 3.4 + across.x * 1.0; mii.z = M.z - 10 - wind.z * 3.4 + across.z * 1.0; mii.yaw = WY; put(mii); play(mii, 'sitg');
    if (mii.prop) setProp(mii, _v.set(mii.x, t.heightAt(mii.x, mii.z) + 0.3, mii.z), null, 0);   // her temari put away
  }
  let showT = rand(6, 10), turn = 0, lookT = 0, clapT = 0, runT = rand(6, 9), run: 'stand' | 'out' | 'watch' | 'back' = 'stand';
  const cheer = (f: Folk) => sounds?.giggle?.(Math.hypot(player.x - f.x, player.z - f.z));
  const runUnder = (k: Flyer) => {                                                     // out along the wind toward the kite, never near the edge
    for (let d = 7; d >= 2; d -= 0.5) { runTo.set(k.x + wind.x * d + across.x * rand(-1.5, 1.5), 0, k.z + wind.z * d); if (insideEdge(I.outline, runTo.x * 1.12, runTo.z * 1.12)) break; }
    run = 'out';
  };
  function friendsUpdate(dt: number) {
    for (const k of flyers) {
      if (k.swoop > 0 && (k.swoop -= dt) <= 0) { k.swoop = 0; const o = flyers.find((x) => x !== k); if (o) { k.f.lookAt = o.spot; lookT = 2.5; } cheer(k.f); }   // and a grin at the other
      kitePos(k);
    }
    if (flyers.length > 1 && (showT -= dt) <= 0) {                                  // taking turns: one shows off a dive and a sweep, the others watch
      const a = flyers[turn], b = flyers[1 - turn]; a.swoop = 4; turn = 1 - turn; showT = rand(12, 18); b.f.lookAt = a.spot; lookT = 4;
      if (mii) { clapT = 3; play(mii, 'clap', 1, 0.3); cheer(mii); }
      if (taro && run === 'stand') runUnder(a);
    }
    if (lookT > 0 && (lookT -= dt) <= 0) for (const k of flyers) k.f.lookAt = null;
    if (mii) {
      if (clapT > 0 && (clapT -= dt) <= 0) play(mii, 'sitg', 1, 0.4);
      if (mii.wave <= 0 && Math.random() < dt / 10) { mii.wave = 1.8; mii.point = true; }   // pointing up at a kite
    }
    if (!taro) return;
    if (run === 'stand') {
      face(taro, Math.atan2((suzu?.x ?? taro.x) - taro.x, (suzu?.z ?? taro.z + 1) - taro.z), dt, 3); play(taro, runT % 7 < 3 ? 'talk' : 'idle', 1, 0.4);
      if ((runT -= dt) <= 0 && flyers.length) runUnder(flyers[0]);
    } else if (run === 'out') { if (goTo(taro, runTo.x, runTo.z, 3.2, dt)) { run = 'watch'; runT = rand(2, 3.5); taro.wave = 1.8; taro.point = true; } }
    else if (run === 'watch') { face(taro, WY, dt, 4); play(taro, 'idle', 1, 0.3); if ((runT -= dt) <= 0) run = 'back'; }
    else if (goTo(taro, TARO.x, TARO.z, 3.0, dt)) { run = 'stand'; runT = rand(10, 16); cheer(taro); }
    put(taro);
  }

  // ---------------------------------------------------------------- the market: the vendor, and a shopper doing her round
  const stalls = marketStalls(I, t), ven = folk.kichibei, shop = folk.okane;
  if (ven && stalls[0]) {
    ven.x = stalls[0].vendor.x; ven.z = stalls[0].vendor.z; ven.yaw = stalls[0].vendor.yaw; put(ven); play(ven, 'idle');
    world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.28).setTranslation(ven.x, t.heightAt(ven.x, ven.z) + 0.85, ven.z), fixed);
  }
  const stops = stalls.map((s) => [s.x + Math.sin(s.yaw) * 1.3, s.z + Math.cos(s.yaw) * 1.3, s.yaw + Math.PI]);   // before each counter, facing it
  stops.push([SQ.x - 0.2, SQ.z + 3.6, Math.atan2(I.spots.sakura.x - SQ.x, I.spots.sakura.z - SQ.z)]);   // a pause under the blossom
  let si = 0, stayT = 3, venT = rand(5, 9);
  if (shop && stops.length) { shop.x = stops[0][0]; shop.z = stops[0][1]; shop.yaw = stops[0][2]; put(shop); }
  function marketUpdate(dt: number) {
    if (ven && (venT -= dt) <= 0) { const talk = ven.cur !== ven.acts.talk && Math.random() < 0.6; play(ven, talk ? 'talk' : 'idle', 1, 0.5); if (talk) sounds?.call?.(Math.hypot(player.x - ven.x, player.z - ven.z)); venT = talk ? rand(4, 6) : rand(5, 10); }
    if (!shop || !stops.length) return;
    const s = stops[si];
    if (stayT > 0) { stayT -= dt; face(shop, s[2], dt, 4); if (shop.cur === shop.acts.walk || !shop.cur) play(shop, Math.random() < 0.5 ? 'talk' : 'idle', 1, 0.4); if (stayT <= 0) si = (si + 1) % stops.length; }
    else if (goTo(shop, s[0], s[1], 1.1, dt)) stayT = rand(5, 9);
    put(shop);
  }

  // ---------------------------------------------------------------- the farmer's round on the farm (farm.ts)
  // hoe a pass along the bare row; fetch the shoulder pole from the rain barrel, stand the pails in the hoed row and ladle
  // water over the rows (twice); take the basket from the shed, crouch to pick daikon into it (twice), carry it back; rest
  // on the stump; again. He walks every move (through the garden's gate, along its west end); the pole, basket, hoe and
  // ladle are on him only while he uses them (folk_build.py builds the pour, pick, carry and sit clips with them).
  const farm = buildFarm(scene, world, t, low), farmer = folk.gonbei, Fm = FARM, HALF = Math.PI / 2;
  const fb = (n: string) => farmer?.root.getObjectByName(n) ?? null;
  const pole = fb('pole'), hoeB = fb('hoe'), ladleB = fb('ladle'), shoulder = fb('upperarm_r'), handL = fb('hand_l'), poleQ0 = pole?.quaternion.clone() ?? new THREE.Quaternion();
  const SEAT = 0.268;                                                                // the sit clip's pelvis is this far behind his feet's spot, at the stump's top (folk_build.py)
  const HZ = Fm.rows[0], X0 = Fm.bed.x0 + 0.5, X1 = Fm.bed.x1 - 0.5, PZ = HZ + 0.25;   // the bare row he hoes and waters from; picking, he crouches at its edge facing the daikon
  const barrel: [number, number] = [Fm.poleRest.x + 0.55, Fm.poleRest.z], shelf: [number, number] = [Fm.basketRest.x + 0.6, Fm.basketRest.z];
  const ys = Math.atan2(Fm.paddy.x - Fm.stump.x, Fm.paddy.z - Fm.stump.z), seat: [number, number] = [Fm.stump.x + Math.sin(ys) * SEAT, Fm.stump.z + Math.cos(ys) * SEAT];
  let poleOn = false, poleAt = [Fm.poleRest.x, Fm.poleRest.z, 0];                    // on his shoulder, or stood on its pails (x, z, yaw)
  let basketAt: number[] | null = [Fm.basketRest.x, Fm.basketRest.z, -HALF], tool: 'hoe' | 'ladle' | null = null;   // the basket on the ground, or (null) in his left hand
  /** a spot in his frame (his right is -x, forward +z) */
  const local = (lx: number, lz: number, yaw: number) => [farmer!.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), farmer!.z - lx * Math.sin(yaw) + lz * Math.cos(yaw), yaw];
  const route = (a: number[], b: number[]) => {                                      // into and out of the garden by its gate, along its west end
    const ia = inGarden(a[0], a[1]), ib = inGarden(b[0], b[1]), W = Fm.walkX;
    if (!ia && !ib) return [b]; if (!ia) return [Fm.gateOut, Fm.gateIn, [W, b[1]], b]; if (!ib) return [[W, a[1]], Fm.gateIn, Fm.gateOut, b];
    return Math.abs(a[1] - b[1]) < 0.15 ? [b] : [[W, a[1]], [W, b[1]], b];
  };
  type Step = { to?: number[]; yaw?: number; clip?: string; dur?: number; on?: () => void; mid?: () => void; hoe?: boolean };
  const lift = () => { poleOn = true; }, take = () => { basketAt = null; };
  const setDown = () => { poleOn = false; poleAt = local(-0.32, -0.25, cur?.yaw ?? farmer!.yaw); };   // the near pail at his right front, where the pour clip dips
  const putBasket = () => { basketAt = local(-0.42, 0.2, cur?.yaw ?? farmer!.yaw); };              // at his right, where the pick clip drops
  const water = (x: number): Step[] => [{ to: [x, HZ], yaw: -HALF, clip: 'give', dur: 1.4, mid: setDown }, { clip: 'pour', dur: 9, on: () => (tool = 'ladle') },
    { clip: 'give', dur: 1.4, on: () => (tool = null), mid: lift }];
  const pick = (x: number): Step[] => [{ to: [x, PZ], yaw: 0, clip: 'give', dur: 1.2, mid: putBasket }, { clip: 'pick', dur: 7.1 }, { clip: 'give', dur: 1.2, mid: take }];
  const cycle = (): Step[] => [
    { to: [X0, HZ], hoe: true, on: () => { tool = 'hoe'; hx = X0; } },
    { to: barrel, yaw: -HALF, clip: 'give', dur: 1.6, on: () => (tool = null), mid: lift }, ...water(-18.6), ...water(-21.4),
    { to: barrel, yaw: -HALF, clip: 'give', dur: 1.6, mid: () => { poleOn = false; poleAt = [Fm.poleRest.x, Fm.poleRest.z, 0]; } },
    { to: shelf, yaw: -HALF, clip: 'give', dur: 1.6, mid: take }, ...pick(-22.6), ...pick(-20.2),
    { to: shelf, yaw: -HALF, clip: 'give', dur: 1.4, mid: () => { basketAt = [Fm.basketRest.x, Fm.basketRest.z, -HALF]; } },
    { to: seat, yaw: ys, clip: 'sit', dur: rand(10, 16) },
  ];
  let queue: Step[] = [], cur: Step | null = null, path: number[][] = [], st = 0, midDone = false, hx = X0, chopT = rand(4, 6), restT = 0;
  if (farmer) { farmer.x = X0; farmer.z = HZ; farmer.yaw = HALF; put(farmer); play(farmer, 'hoe'); }
  function farmProps() {
    const f = farmer!; hoeB?.scale.setScalar(tool === 'hoe' ? 1 : 1e-3); ladleB?.scale.setScalar(tool === 'ladle' ? 1 : 1e-3);
    if (pole) {
      if (poleOn && shoulder) { shoulder.getWorldPosition(_v); _v.x += Math.cos(f.yaw) * 0.03; _v.y += 0.08; _v.z -= Math.sin(f.yaw) * 0.03; _q.setFromAxisAngle(UP, f.yaw); }   // on the top of his right shoulder
      else { _v.set(poleAt[0], t.heightAt(poleAt[0], poleAt[1]) + 0.92, poleAt[1]); _q.setFromAxisAngle(UP, poleAt[2]); }
      setProp(f, _v, _q, 1, pole, poleQ0);
    }
    if (f.prop) {
      if (basketAt) { _v.set(basketAt[0], t.heightAt(basketAt[0], basketAt[1]), basketAt[1]); _q.setFromAxisAngle(UP, basketAt[2]); }
      else if (handL) { handL.getWorldPosition(_v); _v.y -= 0.42; _q.setFromAxisAngle(UP, f.yaw); }   // hung from his left hand by its hoop
      setProp(f, _v, _q);
    }
  }
  function farmUpdate(dt: number) {
    farm.update(now, player);
    const f = farmer; if (!f) return;
    if (!cur) { if (!queue.length) queue = cycle(); cur = queue.shift()!; cur.on?.(); path = cur.to ? route([f.x, f.z], cur.to) : []; st = 0; midDone = false; }
    if (path.length) { if (goTo(f, path[0][0], path[0][1], 0.85, dt, poleOn ? 'carry' : undefined)) path.shift(); }
    else if (cur.hoe) {                                                             // three or four strokes, then a step along; a straighten-up now and then
      if (Math.hypot(hx - f.x, HZ - f.z) > 0.08) goTo(f, hx, HZ, 0.7, dt);
      else {
        face(f, HALF, dt, 3);
        if (restT > 0) { restT -= dt; play(f, 'idle', 1, 0.5); }
        else { play(f, 'hoe', 1, 0.4); if ((chopT -= dt) <= 0) { chopT = 1.6 * (3 + Math.floor(Math.random() * 2)); hx += 0.6; if (Math.random() < 0.2) restT = rand(3, 5); if (hx > X1) cur = null; } }
      }
    } else {
      if (cur.yaw !== undefined) face(f, cur.yaw, dt, 5);
      if (cur.clip) play(f, cur.clip, 1, 0.35);
      st += dt; if (!midDone && st >= (cur.dur ?? 0) * 0.5) { midDone = true; cur.mid?.(); }
      if (st >= (cur.dur ?? 0)) cur = null;
    }
    put(f); farmProps();
  }

  // ---------------------------------------------------------------- the old man fishing from the koi pond's bank
  const fisher = folk.mohei, P0 = I.spots.pond, flt = new THREE.Vector3();
  let biteT = rand(10, 20), bite = 0;
  if (fisher) {
    const ax = -0.84, az = 0.54; let r = 0;                                         // toward the quiet north-east bank: out from the middle to the water's edge
    const depth = (x: number, z: number) => { const w = t.waterAt(x, z); return w === w ? w - t.heightAt(x, z) : 0; };
    while (r < 14 && depth(P0.x + ax * r, P0.z + az * r) > 0.02) r += 0.1;
    fisher.x = P0.x + ax * (r + 0.55); fisher.z = P0.z + az * (r + 0.55); fisher.yaw = Math.atan2(-ax, -az); put(fisher); play(fisher, 'fish');
    let fr = 2.9; while (fr > 1.2 && depth(fisher.x - ax * fr, fisher.z - az * fr) < 0.15) fr -= 0.2;
    flt.set(fisher.x - ax * fr, 0, fisher.z - az * fr); flt.y = t.waterAt(flt.x, flt.z);
    if (flt.y !== flt.y) flt.y = t.heightAt(flt.x, flt.z);
    world.createCollider(RAPIER.ColliderDesc.capsule(0.4, 0.32).setTranslation(fisher.x, t.heightAt(fisher.x, fisher.z) + 0.7, fisher.z), fixed);
  }
  const fy = flt.y;
  function fishUpdate(dt: number) {
    if (!fisher?.prop) return;
    if ((biteT -= dt) <= 0) { bite = 1.6; biteT = rand(12, 25); }                   // a nibble: the float dips, he lifts the rod
    bite = Math.max(0, bite - dt);
    flt.y = fy + 0.012 * Math.sin(now * 2.2) - (bite > 1.0 ? 0.05 : 0); setProp(fisher, flt, null);
  }

  // ---------------------------------------------------------------- the kite string and the fishing line: one draw
  const lineN = flyers.length * 12 + (fisher ? 4 : 0), linePos = new Float32Array(lineN * 6), lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0xe8e2d4, transparent: true, opacity: 0.75 })); lines.frustumCulled = false;
  if (lineN) scene.add(lines);
  const strand = (o: number, n: number, a: THREE.Vector3, b: THREE.Vector3, sag: number) => {
    for (let i = 0; i < n; i++) for (let e = 0; e < 2; e++) {
      const u = (i + e) / n, j = (o + i * 2 + e) * 3;
      linePos[j] = a.x + (b.x - a.x) * u; linePos[j + 1] = a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u); linePos[j + 2] = a.z + (b.z - a.z) * u;
    }
  };

  const all = Object.values(folk);
  return {
    update(dt: number, playerPos: THREE.Vector3) {
      frame++; now += dt; player = playerPos;
      kidsUpdate(dt); friendsUpdate(dt); marketUpdate(dt); farmUpdate(dt); fishUpdate(dt);
      for (const f of all) {
        const pd = Math.hypot(player.x - f.x, player.z - f.z);
        if (!low && (pd < 15) !== f.shade) { f.shade = pd < 15; f.mesh.castShadow = f.shade; }
        // animation: every frame up close, less often further off, not at all while out of sight (props still move)
        const every = pd < 16 ? 1 : pd < 30 ? 2 : pd < 60 ? 4 : 8; f.acc += dt;
        if ((frame + f.k) % every || (frame - f.drawn > 2 && pd > 6)) continue;
        f.over.forEach((b, i) => b?.quaternion.copy(f.saved[i]));
        f.mixer.update(f.acc); f.acc = 0;
        f.over.forEach((b, i) => b && f.saved[i].copy(b.quaternion));
        if (pd > 12 && !f.lookAt) continue;
        // a glance at the ronin as he passes, and a wave from the idle ones the first time he comes close
        const idle = f.cur === f.acts.idle || f.cur === f.acts.talk || f.cur === f.acts.crouch || f.cur === f.acts.kite || f.cur === f.acts.sitg;
        const near = pd < 4.5 && idle; if (near && !f.near && now - f.lastWave > 40 && Math.random() < 0.7) { f.wave = 1.8; f.point = false; f.lastWave = now; }
        f.near = near;
        const want = f.lookAt ? THREE.MathUtils.clamp(wrap(Math.atan2(f.lookAt.x - f.x, f.lookAt.z - f.z) - f.yaw), -1.1, 1.1)   // a friend
          : glance(f, pd) ? THREE.MathUtils.clamp(wrap(Math.atan2(player.x - f.x, player.z - f.z) - f.yaw), -1.1, 1.1) : 0;
        f.look += (want - f.look) * Math.min(1, dt * every * 4);
        if (Math.abs(f.look) > 0.01 && f.over[0] && f.over[1]) { turnW(f.over[0], UP, f.look * 0.4); turnW(f.over[1], UP, f.look * 0.6); }
        if (f.wave > 0 && f.over[2] && f.over[3]) {
          f.wave -= dt * every; const w = Math.min(1, f.wave * 3, (1.8 - f.wave) * 4);
          _f.set(Math.sin(f.yaw), 0, Math.cos(f.yaw)); turnW(f.over[2], _f, -2.3 * w); turnW(f.over[3], _f, (f.point ? 0.15 : -0.3 + 0.45 * Math.sin(now * 11)) * w);   // a wave, or a point up at a kite
        }
      }
      if (lineN) {
        flyers.forEach((k, i) => { if (k.f.tip) { k.f.tip.getWorldPosition(_v); strand(i * 12, 12, _v, k.kite, 0.05 * _v.distanceTo(k.kite)); } });
        if (fisher?.tip) { fisher.tip.getWorldPosition(_w); strand(flyers.length * 12, 4, _w, flt, 0.12); }
        lineGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
