import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { loadTerrain } from './terrain';
import { buildIsland, type Island } from './island';
import { addGrass } from './grass';
import { buildVillage, bridgeY } from './village';
import { buildWater, waterDepthAt, ripple } from './water';
import { buildFlora } from './flora';
import { buildVillagers, CAST, type Talk } from './npcs';
import { createHud, type Marker } from './hud';
import { buildLife } from './life';
import { buildSunbeams } from './sunbeams';
import { buildBoards, loadWeek } from './boards';
import { buildBoat, type Helm, type Voyage } from './boat';
import { buildAnimals } from './animals';
import { createAudio, type Surface } from './audio';
import { buildStatue, RING } from './statue';
import { buildShrineDecor } from './shrine_decor';
import { buildFolk } from './folk';
import { decorTime } from './market';
import { buildCampfire } from './campfire';

export type { Talk };
/** onExit: the ronin fell into the clouds; the page ends the game and goes to the contact form (without it, he's set back at the gate) */
type Opts = { low: boolean; audio?: AudioContext; onLink: (href: string) => void; onExit?: () => void };
const STEP = 1 / 60;
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR', 'KeyE', 'KeyM', 'KeyJ', 'Enter', 'Escape', 'ShiftLeft', 'ShiftRight', 'KeyQ']);

export async function startGame(host: HTMLElement, { low, audio, onLink, onExit }: Opts) {
  const renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
  let dpr = Math.min(devicePixelRatio, low ? 1 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft was removed; three swaps it at first render, which recompiled shaders mid-game
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, host.clientWidth / host.clientHeight, 0.1, 6000);
  // misty spring dawn: the sun just over the clouds in the east-north-east, pink light, lavender mist
  const sunDir = new THREE.Vector3(-0.8, 0.075, 0.6).normalize();         // east-north-east (+x is west in this world)
  const sky = new Sky(); sky.scale.setScalar(20000);
  const su = sky.material.uniforms;
  su.turbidity.value = 9; su.rayleigh.value = 2.6; su.mieCoefficient.value = 0.008; su.mieDirectionalG.value = 0.82; su.sunPosition.value.copy(sunDir);
  // with the sun this low the sky model turns the zenith night-navy: looking up should still read as a pale dawn blue
  sky.material.fragmentShader = sky.material.fragmentShader.replace('#include <tonemapping_fragment>', `#include <tonemapping_fragment>
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.27, 0.42, 0.66), smoothstep(0.08, 0.8, direction.y) * 0.6);`);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(sky.clone());
  scene.environment = pmrem.fromScene(envScene, 0.04, 1, 40000).texture; scene.environmentIntensity = 1.0;   // far plane must reach the sky dome
  scene.fog = new THREE.FogExp2(0xe2d3d9, 0.0028);
  const sun = new THREE.DirectionalLight(0xffc0a0, 2.4);
  sun.castShadow = !low; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 260 });
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xbcc8ff, 0x7a6f5c, 1.35));

  const weekP = loadWeek();                                                         // the music board's weekly chart, fetched while the island loads
  const [terrain, I] = await Promise.all([loadTerrain(), fetch('/game/island.json').then((r) => r.json() as Promise<Island>)]);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }); world.timestep = STEP;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const uploadTextures = (root: THREE.Object3D) => root.traverse((o) => {
    for (const m of [(o as THREE.Mesh).material].flat()) if (m) for (const v of [...Object.values(m), m.userData.tex]) if (v instanceof THREE.Texture) renderer.initTexture(v);
  });
  const updateClouds = await buildIsland(scene, world, terrain, loader, low, I, sunDir);
  await buildVillage(scene, world, loader, terrain, I, low);
  const updateFire = buildCampfire(scene, terrain, I, low);                       // Tokubei's fire: flames, sparks, smoke, a glow on the ground
  const statue = await buildStatue(scene, world, loader, I, low);                 // the bronze Nataraja and its temple bell on the islet
  const decor = await buildShrineDecor(scene, world, loader, I, low, statue);    // Nandi, trishul, lamps, garlands, peepal, tulsi, path, prayer flags
  const updateWater = buildWater(scene, terrain, I);
  buildFlora(scene, world, terrain, I, low);
  const updateGrass = addGrass(scene, terrain, low);
  const sfx = audio ? createAudio(audio, { stream: I.stream, fire: I.props.firepit[0], chime: [I.spots.teahouse.x, I.spots.teahouse.z] }) : null;
  const life = buildLife(scene, terrain, I, low, sfx);
  const updateBeams = buildSunbeams(scene, terrain, I, sunDir, low);
  // villagers: their lines are voiced (a murmur where there's no clip), barks float over heads, and the shared moments move the ronin
  const npcs = await buildVillagers(scene, world, loader, terrain, I, low, {
    strike: (d) => sfx?.clang(d),
    line: (id, key, text) => { sfx?.speak(`${id}/${key}`).then((d) => { if (d > 0) { if (talk) hud.speaking(d); } else if (d === 0) sfx?.murmur(CAST.find((q) => q.id === id)!.pitch, text.length); }); },
    bark: (text, at) => hud.bark(text, at),
    moment: (m) => {
      if (m.at) { body.setTranslation(m.at, true); body.setNextKinematicTranslation(m.at); vy = 0; }
      if (m.sit && m.at) sitAt(m.at, m.face ?? faceYaw); else if (m.face !== undefined) faceYaw = m.face;
      if (m.act) oneShot = clock.elapsedTime + 1.4;
    },
    handbell: (d) => sfx?.handbell(d),                                            // Pandit Shankar's bell during the aarti
  }, statue.shrine);
  const folk = await buildFolk(scene, world, loader, terrain, I, low, sfx ?? undefined);           // children at play, a kite flyer, shoppers, the vendor, the farmer, the fisherman
  const boat = await buildBoat(scene, world, loader, terrain, I, low);
  const animals = await buildAnimals(scene, world, loader, terrain, I, low, sfx);
  const boards = buildBoards(scene, world, terrain, I, low, renderer.capabilities.getMaxAnisotropy(), npcs.list().find((v) => v.id === 'yuki'), await weekP);

  // ---------------------------------------------------------------- the ronin on foot (Rapier character controller)
  const g = await loader.loadAsync('/game/walker.glb');
  const root = g.scene;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = !low; o.frustumCulled = false; } });
  scene.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const acts = Object.fromEntries(g.animations.map((c) => [c.name, mixer.clipAction(c)]));
  for (const n of ['jump_start', 'jump_land', 'interact']) if (acts[n]) { acts[n].setLoop(THREE.LoopOnce, 1); acts[n].clampWhenFinished = true; }
  const spawn = new THREE.Vector3(I.spawn.x, terrain.heightAt(I.spawn.x, I.spawn.z) + 0.05, I.spawn.z);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z));
  const col = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(0, 0.86, 0), body);
  const cc = world.createCharacterController(0.02);
  cc.setUp({ x: 0, y: 1, z: 0 }); cc.enableAutostep(0.45, 0.2, true); cc.enableSnapToGround(0.5);
  cc.setMaxSlopeClimbAngle((48 * Math.PI) / 180); cc.setMinSlopeSlideAngle((55 * Math.PI) / 180);

  // input: only while the game element has focus, so the page never loses its keys
  const keys = new Set<string>(); let touch = { x: 0, y: 0 };
  let vy = 0, grounded = true, clip = 'idle', faceYaw = I.spawn.yaw;
  const setHint = (h: string | null, _sticky = false) => { if (h) hud.toast(h); };
  const respawn = (msg?: string) => {
    body.setTranslation(spawn, true); body.setNextKinematicTranslation(spawn); vy = 0; faceYaw = I.spawn.yaw; camYaw = faceYaw + Math.PI;
    if (msg) setHint(msg, true);
  };
  // on-screen layer: prompts and speech bubbles follow the characters; compass, map (M), journal (J)
  const touchUI = matchMedia('(pointer: coarse)').matches;
  const hud = createHud(host, I, { touch: touchUI, onAct: () => act(), onNext: () => act(), onLink: (href) => { talkClose(); onLink(href); }, onChoose: (i) => say(npcs.choose(i)) });
  // the journal remembers who you've met (per browser only; a convenience, never required)
  const KEY = 'aasish-world-journal';
  const met = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as string[]; } catch { return []; } })());
  // ...and where you were standing, so the next visit picks up there (cleared after a fall, so that one starts at the gate)
  const SPOT = KEY + '-spot';
  const loadSpot = () => { try { const v = JSON.parse(localStorage.getItem(SPOT) || 'null'); return Array.isArray(v) && v.length === 4 && v.every(Number.isFinite) ? (v as number[]) : null; } catch { return null; } };
  const saveSpot = (v: number[] | null) => { try { if (v) localStorage.setItem(SPOT, JSON.stringify(v.map((n) => +n.toFixed(2)))); else localStorage.removeItem(SPOT); } catch { /* private mode */ } };
  let spotT = 0;
  const saveMet = () => { try { localStorage.setItem(KEY, JSON.stringify([...met])); } catch { /* private mode: progress lasts this visit */ } };
  const refreshJournal = () => hud.journal(CAST.map((c) => ({ id: c.id, seal: c.seal, name: c.name, role: c.role, where: c.where, summary: c.summary, met: met.has(c.id), link: c.link, cta: c.cta })));
  refreshJournal();
  // talking: E / Enter / the Talk button starts a conversation and turns the page; Escape ends it
  let talk: Talk | null = null, talkAt: THREE.Vector3 | null = null;
  const say = (t: Talk | null) => { talk = t; hud.bubble(t, null); if (!t) { talkAt = null; sfx?.speak(null); } };   // the voice comes from the villagers' line hook
  const meet = (id: string) => {
    if (met.has(id)) return; met.add(id); saveMet(); refreshJournal();
    const c = CAST.find((q) => q.id === id)!; hud.toast(`Journal: met ${c.name}, ${c.role} (${met.size} of ${CAST.length})`);
    if (met.size === CAST.length) { try { if (!localStorage.getItem(KEY + '-thanks')) { localStorage.setItem(KEY + '-thanks', '1'); setTimeout(() => hud.thanks(), 1800); } } catch { setTimeout(() => hud.thanks(), 1800); } }
  };
  type Spot = { id: string; label: string; button: string; at: THREE.Vector3; radius: number; run: () => void };
  const spots: Spot[] = [];                                                       // everything E can act on (villagers, and later the bell, seats...)
  for (const v of npcs.list()) {                                                 // anchor and headAt are live: the spot walks with the villager
    const c = CAST.find((q) => q.id === v.id)!;
    spots.push({ id: v.id, label: `Talk to ${c.name}`, button: 'Talk', at: v.anchor, radius: 3.2, run: () => {
      const p = body.translation(); faceYaw = Math.atan2(v.anchor.x - p.x, v.anchor.z - p.z); talkAt = v.headAt;
      meet(v.id); say(npcs.start(v.id));
    } });
  }
  // sitting and the castle lookout take the camera for a scenic shot (drag turns it a full 360); moving or E brings you back
  let pose: { kind: 'sit' | 'look'; pivot: THREE.Vector3; dist: number; top: number } | null = null, oneShot = 0;
  let ringing: { at: number; started?: boolean; cam?: number } | null = null, camBack: number | null = null;
  // over the edge: a short fall into the clouds under a white fade, then the game hands over to the contact form
  let fellAt = 0;
  const fallUI = Object.assign(document.createElement('div'), { className: 'gw-fall', innerHTML: '<p>The clouds carry you down&hellip;<br>to Aasish&rsquo;s letterbox.</p>' });
  fallUI.setAttribute('aria-live', 'polite'); host.appendChild(fallUI);                                      // ringing the temple bell: at = when the hand took the clapper (-1: still stepping up)
  const posed = (kind: 'sit' | 'look', pivot: THREE.Vector3, back: THREE.Vector3, dist: number, top = 1.2) => {   // back: from the view toward the camera; top: highest pitch
    back.normalize(); camYaw = Math.atan2(back.x, back.z); camPitch = Math.asin(back.y); pose = { kind, pivot, dist, top };
  };
  const lift = (x: number, z: number, y?: number) => new THREE.Vector3(x, y ?? terrain.heightAt(x, z), z);
  const sitAt = (p: THREE.Vector3, yaw: number, up = 1.9, back = 2.6, top = 1.2) => {
    body.setTranslation(p, true); body.setNextKinematicTranslation(p); vy = 0; faceYaw = yaw;
    const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), r = new THREE.Vector3(f.z, 0, -f.x);
    const pivot = p.clone().add(new THREE.Vector3(0, 1.15, 0)), from = p.clone().addScaledVector(f, -back).addScaledVector(r, -back / 2).add(new THREE.Vector3(0, up, 0));
    posed('sit', pivot, from.clone().sub(pivot), from.distanceTo(pivot), top);
    hud.toast(touchUI ? 'Drag to look around · move to stand up' : 'Drag to look around · move or E to stand up');
  };
  const standUp = () => {
    if (!pose) return;
    if (pose.kind === 'sit') { const p = body.translation(), f = { x: Math.sin(faceYaw) * 0.7, z: Math.cos(faceYaw) * 0.7 }; const n = { x: p.x + f.x, y: p.y + 0.3, z: p.z + f.z }; body.setTranslation(n, true); body.setNextKinematicTranslation(n); }
    pose = null;
  };
  spots.push({ id: 'bell', label: 'Ring the bell', button: 'Ring', at: statue.bell, radius: 2.4,
    run: () => { ringing = { at: -1 }; } });                                     // he steps up under the bell, then reaches for the clapper (frame)
  I.props.bench.forEach(([x, z, yaw], i) => spots.push({ id: `bench${i}`, label: 'Sit and look', button: 'Sit', at: lift(x, z).add(new THREE.Vector3(0, 1.1, 0)), radius: 2.2,
    run: () => sitAt(lift(x, z), yaw) }));
  {
    const T = I.spots.teahouse, f = { x: Math.sin(T.yaw), z: Math.cos(T.yaw) }, x = T.x + f.x * 4.0, z = T.z + f.z * 4.0;
    spots.push({ id: 'veranda', label: 'Sit on the veranda', button: 'Sit', at: lift(x, z).add(new THREE.Vector3(0, 1.2, 0)), radius: 2.2, run: () => sitAt(lift(x, z, terrain.heightAt(T.x, T.z) + 0.2), T.yaw, 1.4, 2.2, 0.3) });   // low, under the eaves and their hanging blinds
    const P = I.spots.pond, [kx, kz, ky] = I.props.arched_bridge[0];                // feed them from the top of the red bridge
    spots.push({ id: 'koi', label: 'Feed the koi', button: 'Feed', at: new THREE.Vector3(kx, bridgeY(terrain, kx, kz, ky) + 1.5 + 1.1, kz), radius: 2.4,
      run: () => { const p = body.translation(); faceYaw = Math.atan2(P.x - p.x, P.z - p.z); oneShot = clock.elapsedTime + 1.2; life.feed(new THREE.Vector3(p.x, p.y, p.z)); } });
    const C = I.spots.castle, cf = { x: Math.sin(C.yaw), z: Math.cos(C.yaw) }, lx = C.x + cf.x * 8.5, lz = C.z + cf.z * 8.5;
    spots.push({ id: 'lookout', label: 'Look out from the castle', button: 'Look', at: lift(lx, lz).add(new THREE.Vector3(0, 1.4, 0)), radius: 3,
      run: () => { const from = new THREE.Vector3(C.x - cf.x * 4, C.y + 26, C.z - cf.z * 4); posed('look', from, from.clone().sub(new THREE.Vector3(-4, 4, -18)), 0); hud.toast(touchUI ? 'Drag to look around · move to come back' : 'Drag to look around · move or E to come back'); } });
  }
  for (const r of boards.reads) spots.push({ id: r.id, label: r.label, button: 'Read', at: r.at, radius: r.radius, run: () => hud.read(r.doc) });
  // the sky-boat: the first-visit arrival and the tour around the island carry the ronin on deck
  let ride: Voyage | null = null;
  const rideSpot: Spot = { id: 'ride', label: '', button: '', at: new THREE.Vector3(), radius: 99, run: () => endRide() };
  const startRide = (kind: Voyage) => {
    talkClose(); hud.close(); standUp(); ride = kind; boat.set(kind);
    rideSpot.label = kind === 'arrive' ? 'Skip' : 'Back to the pier'; rideSpot.button = kind === 'arrive' ? 'Skip' : 'Back';
    if (kind === 'arrive') { camYaw = Math.atan2(-28, 70) + 2.3; camPitch = 0.3; hud.toast(touchUI ? 'Tap to skip' : 'Press any key to skip'); }
    else hud.toast('All aboard. Drag to look around');
  };
  const endRide = () => {
    const was = ride; ride = null; boat.finish(); current = null; hud.prompt(null, null);
    const p = new THREE.Vector3(I.props.pier[0][0] + 0.2, boat.pierTop + 0.05, boat.dock.z + 1.5);
    body.setTranslation(p, true); body.setNextKinematicTranslation(p); vy = 0; faceYaw = 0; camYaw = Math.PI; camPitch = 0.25;
    if (was === 'arrive') { try { localStorage.setItem(KEY + '-arrived', '1'); } catch { /* private mode: it plays again next visit */ } hud.toast('Welcome to the floating village'); }
  };
  spots.push({ id: 'boat', label: 'Sail around the island', button: 'Sail', at: boat.boardAt, radius: 2.8, run: () => startRide('tour') });
  // sailing her by hand: E at the wheel (on deck, or from the pier while she's berthed) takes the helm; E or Escape lets go and
  // she hangs where she is, the deck free to walk; near the pier E docks instead, and she eases into her berth
  let helm = false, helmLift = 0, helmBoost = false, helmCool = false, helmTest: Partial<Helm> | null = null;
  const hin: Helm = { throttle: 0, steer: 0, lift: 0, boost: false }, onDeck = new THREE.Vector3();
  let helmUI: HTMLDivElement | null = null;
  if (touchUI) {                                                                  // rise / sink / boost, beside the act button (the joystick sails and steers)
    helmUI = Object.assign(document.createElement('div'), { className: 'g-helm', hidden: true });
    helmUI.innerHTML = '<button type="button" class="g-helm-up" aria-label="Rise">▲</button><button type="button" class="g-helm-down" aria-label="Sink">▼</button><button type="button" class="g-helm-boost" aria-label="Boost">»</button>';
    const hold = (sel: string, set: (on: boolean) => void) => {
      const b = helmUI!.querySelector(sel)!, off = () => { b.classList.remove('is-on'); set(false); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('is-on'); set(true); });
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    };
    hold('.g-helm-up', (on) => { helmLift = on ? 1 : 0; }); hold('.g-helm-down', (on) => { helmLift = on ? -1 : 0; }); hold('.g-helm-boost', (on) => { helmBoost = on; });
    host.appendChild(helmUI);
  }
  const takeHelm = () => {
    talkClose(); hud.close(); standUp(); helm = true; boat.set('pilot'); keys.clear(); current = null; hud.prompt(null, null); helmUI?.removeAttribute('hidden');
    camYaw = boat.yaw + Math.PI; camPitch = 0.3; lastLook = -10;
    hud.toast(touchUI ? 'Joystick: sail and steer · ▲ ▼ rise and sink · » boost · Let go to walk the deck' : 'W/S sail · A/D steer · Space up · Shift down · Q boost · E let go');
  };
  const letGo = () => {
    helm = false; boat.set('hold'); keys.clear(); helmLift = 0; helmBoost = false; current = null; hud.prompt(null, null); helmUI?.setAttribute('hidden', '');
    hud.toast('She holds here. Walk the deck, or take the wheel again');
  };
  const helmSpot: Spot = { id: 'helm', label: 'Take the helm', button: 'Helm', at: boat.wheelAt, radius: 2.8, run: () => takeHelm() };
  const letGoSpot: Spot = { id: 'letgo', label: 'Let go of the helm', button: 'Let go', at: boat.wheelAt, radius: 99, run: () => letGo() };
  const dockSpot: Spot = { id: 'dock', label: 'Dock at the pier', button: 'Dock', at: boat.wheelAt, radius: 99, run: () => { if (boat.dockIn()) hud.toast('Bringing her in'); } };
  spots.push(helmSpot);
  // the tame deer: walk up and bow; it bows back
  const bowSpot: Spot = { id: 'bow', label: 'Bow to the deer', button: 'Bow', at: new THREE.Vector3(), radius: 2.8, run: () => {
    const p = body.translation(), d = animals.bow(p.x, p.z); if (d) { faceYaw = Math.atan2(d.x - p.x, d.z - p.z); oneShot = clock.elapsedTime + 1.4; }
  } };
  let current: Spot | null = null;
  const act = () => { if (helm) return void (boat.mode === 'pilot' && (boat.dockable ? dockSpot : letGoSpot).run()); if (ride) return endRide(); if (talk) return say(npcs.next()); if (hud.open) return void hud.close(); if (pose) return standUp(); current?.run(); };
  const talkNext = act;
  const talkClose = () => { if (talk) { npcs.stop(); say(null); } };
  const markers: Marker[] = [
    ...npcs.list().map((v) => ({ id: v.id, glyph: CAST.find((q) => q.id === v.id)!.seal, label: CAST.find((q) => q.id === v.id)!.name, pos: new THREE.Vector3(v.x, v.y, v.z), villager: true })),
    ...([['pagoda', '塔', 'Pagoda'], ['castle', '城', 'Castle'], ['torii', '⛩', 'Torii gate'], ['teahouse', '茶', 'Tea house']] as const).map(([k, g, l]) => ({ id: k, glyph: g, label: l, pos: new THREE.Vector3(I.spots[k].x, 0, I.spots[k].z), villager: false })),
    { id: 'shrine', glyph: '像', label: 'Nataraja', pos: statue.statue.clone().setY(0), villager: false },
  ];
  const down = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest?.('button, a') && (e.code === 'Enter' || e.code === 'Space')) return;   // let Enter/Space press the focused button
    if (!GAME_KEYS.has(e.code)) return; e.preventDefault();
    if (e.repeat) return;
    if (ride === 'arrive' || (ride && e.code === 'Escape')) return endRide();          // any key skips the arrival
    if (helm) {                                                                  // at the wheel: sailing keys are held, Space and Shift lift rather than jump or sprint
      if (e.code === 'Escape') { if (hud.open) hud.close(); else if (boat.mode === 'pilot') letGo(); return; }
      if (e.code === 'KeyE' || e.code === 'Enter') return act();
      if (e.code === 'KeyM') return hud.toggle('map');
      if (e.code === 'KeyJ') return hud.toggle('journal');
      keys.add(e.code); return;
    }
    if (e.code === 'KeyE' || e.code === 'Enter') return act();
    if (e.code === 'Escape') { if (talk) return talkClose(); if (pose) return standUp(); hud.close(); return; }
    if (e.code === 'KeyM' && !talk) return hud.toggle('map');
    if (e.code === 'KeyJ' && !talk) return hud.toggle('journal');
    if (talk || ride) return;                                                    // no wandering off mid-sentence or overboard
    if (e.code === 'KeyR') respawn();
    if (e.code === 'Space' && grounded) { vy = 5.2; grounded = false; }
    keys.add(e.code);
  };
  const up = (e: KeyboardEvent) => { keys.delete(e.code); };
  const blur = () => keys.clear();
  host.addEventListener('keydown', down); host.addEventListener('keyup', up); host.addEventListener('blur', blur);

  // 360 look: drag anywhere (right half on touch, the left half is the joystick)
  let camYaw = faceYaw + Math.PI, camPitch = 0.25, lastLook = -10, dragging = false, px0 = 0, py0 = 0;
  const camDist = 4.6;
  const pd = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, a, .gw-bubble, .gw-sheet, .gw-sub')) return;
    if (ride === 'arrive') return endRide();
    if (e.pointerType === 'touch' && e.offsetX < host.clientWidth / 2) return;
    dragging = true; px0 = e.clientX; py0 = e.clientY; host.setPointerCapture(e.pointerId);
  };
  const pm = (e: PointerEvent) => {
    if (!dragging) return;
    camYaw -= (e.clientX - px0) * 0.006; camPitch = Math.min(pose?.top ?? 1.2, Math.max(-0.25, camPitch + (e.clientY - py0) * 0.004));
    px0 = e.clientX; py0 = e.clientY; lastLook = clock.elapsedTime;
  };
  const pu = () => { dragging = false; };
  host.addEventListener('pointerdown', pd); host.addEventListener('pointermove', pm); host.addEventListener('pointerup', pu); host.addEventListener('pointercancel', pu);

  let joystick: { destroy: () => void } | null = null, joyZone: HTMLDivElement | null = null;
  if (matchMedia('(pointer: coarse)').matches) {
    const nipple = (await import('nipplejs')).default;
    joyZone = Object.assign(document.createElement('div'), { className: 'g-joy' }); host.insertBefore(joyZone, renderer.domElement.nextSibling);   // under the HUD, so the bubble and Talk button get their taps
    const m = nipple.create({ zone: joyZone, mode: 'dynamic', color: 'white', size: 110 });
    m.on('move', (e) => { const v = e.data.vector; touch = { x: v.x, y: v.y }; });
    m.on('end', () => { touch = { x: 0, y: 0 }; });
    joystick = m;
  }

  // simulation + render loop (fixed physics step, orbit camera, adaptive resolution)
  let camOverride: [THREE.Vector3, THREE.Vector3] | null = null;   // testing aid: a fixed camera
  const clock = new THREE.Clock(); const frameLog = new Float32Array(120); let acc = 0, tick = 0, frames = 0, stepT = 0, rippleT = 0, airT = 0, windy = 0; let surface: Surface = 'stone';
  const vel = new THREE.Vector3(), goalV = new THREE.Vector3(), orbit = new THREE.Vector3(); let vAct = 0, lastX = spawn.x, lastZ = spawn.z;
  const prevP = new THREE.Vector3(), curP = new THREE.Vector3(), target = new THREE.Vector3(), camGoal = new THREE.Vector3(), look = new THREE.Vector3(), move = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  camera.position.copy(spawn).add(new THREE.Vector3(0, 2.5, -5));
  // reaching: turn a bone (in world space) so the next bone down the arm lines up with a target, by weight w
  const arm = ['upperarm_r', 'lowerarm_r', 'hand_r'].map((n) => root.getObjectByName(n)!), spine = ['spine_03', 'neck_01', 'head'].map((n) => root.getObjectByName(n)!), reachAt = new THREE.Vector3();
  const _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3();
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _p = new THREE.Quaternion(), _id = new THREE.Quaternion();
  const reach = (bone: THREE.Object3D, next: THREE.Object3D, at: THREE.Vector3, w: number) => {
    if (!bone || !next) return;
    bone.getWorldPosition(_a); next.getWorldPosition(_b);
    _r.setFromUnitVectors(_b.sub(_a).normalize(), _c.copy(at).sub(_a).normalize()); _q.slerpQuaternions(_id, _r, w);   // (slerpQuaternions copies its first argument in first: never pass it _q)
    bone.getWorldQuaternion(_p); _p.premultiply(_q);                              // the bone's new world turn
    bone.parent!.getWorldQuaternion(_q); bone.quaternion.copy(_q.invert().multiply(_p)); bone.updateMatrixWorld(true);
  };
  const sstep = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
  const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const playClip = (name: string, scale = 1) => {
    const a = acts[name]; if (!a) return; a.timeScale = scale;
    if (name === clip) return;
    a.reset().fadeIn(0.18).play(); acts[clip]?.fadeOut(0.18); clip = name;
  };
  const pathPts = I.paths.flatMap((p) => interpolate(p));
  // what the ronin walks on, for the footsteps: decks and bridges are wood, the stream and pond shallows water
  const ropePts = I.bridges.flatMap((b) => interpolate([[b.a[0], b.a[2]], [b.b[0], b.b[2]]]));
  const CS = I.spots.castle, FB = I.props.footbridge[0], AB = I.props.arched_bridge[0];
  const decks = [[(I.props.pier[0][0] + I.spots.pier.x) / 2, (I.props.pier[0][1] + I.spots.pier.z) / 2, 8.5], [FB[0], FB[1], 3], [AB[0], AB[1], 4], [I.spots.teahouse.x, I.spots.teahouse.z, 4.6]];
  const near = (pts: number[][], x: number, z: number) => { let d = Infinity; for (const p of pts) d = Math.min(d, (p[0] - x) ** 2 + (p[1] - z) ** 2); return Math.sqrt(d); };
  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05); acc += dt;
    const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
    const fb = Math.max(-1, Math.min(1, k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown') + touch.y));
    const lr = Math.max(-1, Math.min(1, k('KeyA', 'ArrowLeft') - k('KeyD', 'ArrowRight') - touch.x));
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    if (helm) {
      hin.throttle = fb; hin.steer = -lr; hin.lift = (keys.has('Space') ? 1 : 0) - (sprint ? 1 : 0) + helmLift; hin.boost = keys.has('KeyQ') || helmBoost;
      if (helmTest) Object.assign(hin, helmTest);
      boat.helm(hin);
      if (helmUI && helmCool === boat.boostReady) helmUI.classList.toggle('is-cool', (helmCool = !boat.boostReady));
    }
    // what the player wants to move along, relative to the camera
    const camF = new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw)), camL = new THREE.Vector3().crossVectors(Y, camF);
    move.copy(camF).multiplyScalar(fb).addScaledVector(camL, lr);
    if (pose && (fb !== 0 || lr !== 0)) standUp();
    const mag = talk || hud.open || pose || ride || helm || ringing || fellAt ? 0 : Math.min(1, move.length()); if (mag > 0.01) move.normalize();
    const bp = body.translation(), wade = ride || helm ? 0 : waterDepthAt(bp.x, bp.z);                 // in the shallows: down to ~55%
    const runSpeed = (mag < 0.5 ? 1.6 : sprint ? 6.4 : 4.2) * (1 - 0.45 * Math.min(1, wade / 0.3));
    goalV.copy(move).multiplyScalar(mag * runSpeed);                              // ease into and out of a stride, and round off turns
    if (mag === 0 && (talk || hud.open || pose || ride || helm)) vel.set(0, 0, 0); else vel.lerp(goalV, Math.min(1, dt * (goalV.lengthSq() >= vel.lengthSq() ? 7 : 10)));
    if (mag === 0 && vel.lengthSq() < 4e-4) vel.set(0, 0, 0);                         // the ease-out ends at a full stop, not a never-ending crawl
    if (ringing) {                                                                   // a few steps to stand under the bell, facing it; still while ringing
      const st = statue.ringStand, p = body.translation(), dx = st.x - p.x, dz = st.z - p.z, d = Math.hypot(dx, dz);
      if (ringing.at < 0 && d > 0.05 && d < 4) { vel.set(dx, 0, dz).multiplyScalar(Math.min(1.5, d * 4) / d); if (d > 0.4) faceYaw += wrapA(Math.atan2(dx, dz) - faceYaw) * Math.min(1, dt * 10); }
      else { vel.set(0, 0, 0); if (ringing.at < 0) { ringing.at = clock.elapsedTime + 0.35; } }   // the hand rises for 0.35 s before it closes on the clapper
      if (d < 0.4 || ringing.at > 0) faceYaw += wrapA(statue.bellYaw - faceYaw) * Math.min(1, dt * 8);
      if (ringing.at > 0 && clock.elapsedTime >= ringing.at && !ringing.started) { ringing.started = true; statue.ring((k) => { sfx?.ghanta(k); if (k === 0) life.gust(); }); }
      if (ringing.at > 0 && clock.elapsedTime > ringing.at + RING.end) { camBack = ringing.cam ?? null; ringing = null; }
    }
    if (boat.update(dt, clock.elapsedTime) && (ride || helm)) { helm = false; helmUI?.setAttribute('hidden', ''); endRide(); }   // a voyage ends, or she's berthed: back on the pier
    if (ride || helm) { const p = ride ? boat.deck(0.3, 1.9, 0, onDeck) : boat.helmStand(onDeck); body.setTranslation(p, true); body.setNextKinematicTranslation(p); faceYaw = boat.yaw; vy = 0; grounded = true; }
    else if (boat.mode === 'hold') {
      const b = body.translation();
      if (boat.aboard(b)) { const p = boat.carry(onDeck.set(b.x, b.y, b.z)); body.setTranslation(p, true); faceYaw += boat.turned; }
      else boat.finish();                                                        // nobody aboard any more (respawned): she's back at her berth
    }
    for (let n = 0; acc >= STEP && n < 3; n++, acc -= STEP) {
      prevP.copy(curP);
      if (!ride && !helm) {
        vy = grounded && vy <= 0 ? -1 : vy - 9.81 * STEP;
        cc.computeColliderMovement(col, { x: vel.x * STEP, y: vy * STEP, z: vel.z * STEP }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
        const m = cc.computedMovement(), p = body.translation();
        // standing still on a slope, the controller turns the small push down into the ground into a creep downhill: keep only its height
        const still = grounded && vel.x * vel.x + vel.z * vel.z < 1e-4;
        body.setNextKinematicTranslation({ x: p.x + (still ? 0 : m.x), y: p.y + m.y, z: p.z + (still ? 0 : m.z) });
        grounded = cc.computedGrounded();
      }
      world.step(); const t = body.translation(); curP.set(t.x, t.y, t.z);
    }
    if (acc > STEP) acc = 0;
    const wp = body.translation();
    if (wp.y < -9 && !fellAt && !ride && !helm) {                                 // below every bit of ground: he's gone over the edge
      saveSpot(null);
      if (onExit) { fellAt = clock.elapsedTime; talkClose(); hud.close(); keys.clear(); fallUI.classList.add('is-on'); }
      else respawn('The clouds carried you back to the gate');
    }
    if (fellAt > 0 && clock.elapsedTime - fellAt > 2.4) { fellAt = -1; setTimeout(() => onExit?.()); }   // (after this frame: the page disposes the game)
    // physics ticks at a steady 60 a second but frames don't land exactly on them (some get none, some two): drawing him
    // part-way between the last two ticks keeps his motion even. On the boat he follows her every frame instead; a jump
    // of more than 2 m (respawn, being placed) snaps rather than gliding across the map.
    if (curP.distanceToSquared(prevP) > 4) prevP.copy(curP);
    if (ride || helm || boat.mode === 'hold') root.position.set(wp.x, wp.y, wp.z); else root.position.lerpVectors(prevP, curP, acc / STEP);
    if (mag > 0.05) faceYaw += Math.atan2(Math.sin(Math.atan2(move.x, move.z) - faceYaw), Math.cos(Math.atan2(move.x, move.z) - faceYaw)) * Math.min(1, dt * 10);
    root.rotation.y = faceYaw;
    const raw = Math.min(9, Math.hypot(wp.x - lastX, wp.z - lastZ) / Math.max(dt, 1e-3)); lastX = wp.x; lastZ = wp.z;
    vAct += ((ride || helm ? 0 : raw) - vAct) * Math.min(1, dt * 10);
    const v = Math.min(vAct, Math.hypot(vel.x, vel.z) + 0.2);                        // the real ground speed: pushing into a wall stands still, no skating feet
    if (wade > 0.04 && grounded && !ride && !helm && (rippleT -= dt) <= 0) { ripple(wp.x, wp.z, v > 0.3 ? Math.min(1, 0.35 + v / 4) : 0.2); rippleT = v > 0.3 ? 0.3 : 1.6; }   // rings at the feet
    if (pose?.kind === 'sit') playClip('sit');
    else if (clock.elapsedTime < oneShot) playClip('interact');
    else if (!grounded) playClip('jump_loop');
    else playClip(v < 0.2 ? 'idle' : v < 2.5 ? 'walk' : v < 5 ? 'jog' : 'sprint', v < 0.2 ? 1 : v < 2.5 ? v / 1.4 : v < 5 ? v / 4.2 : v / 6.4);
    mixer.update(dt);
    if (ringing && ringing.at > 0) {                                                 // the right arm reaches up for the clapper's tongue and follows it
      const t = clock.elapsedTime - ringing.at, w = sstep(-0.35, 0.05, t) * (1 - sstep(RING.release, RING.release + 0.5, t));
      if (w > 0) {
        root.updateMatrixWorld(true); statue.grip(reachAt);
        reach(spine[0], spine[1], reachAt, 0.12 * w);                              // leans in a little
        reach(spine[1], spine[2], _e.copy(reachAt).setY(reachAt.y + 0.35), 0.45 * w);   // and looks up at the bell
        // two bones, elbow bent out and down: the shoulder-to-grip distance sets how far the elbow sits off that line
        arm[0].getWorldPosition(_a); arm[1].getWorldPosition(_b); arm[2].getWorldPosition(_c);
        const la = _a.distanceTo(_b), lb = _b.distanceTo(_c);
        _d.subVectors(reachAt, _a); const dist = Math.min(_d.length(), (la + lb) * 0.97); _d.normalize();
        const x = (la * la - lb * lb + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, la * la - x * x));
        _f.set(-Math.cos(faceYaw) * 0.45, -0.9, Math.sin(faceYaw) * 0.45); _f.addScaledVector(_d, -_f.dot(_d)).normalize();   // the pole: the elbow drops, a little out to his right
        _e.copy(_a).addScaledVector(_d, x).addScaledVector(_f, h);
        reach(arm[0], arm[1], _e, w); reach(arm[1], arm[2], _g.copy(_a).addScaledVector(_d, dist - 0.06), w);   // the wrist just short of the grip, so the hand closes on it
      }
    }
    if (grounded && v > 0.3) { if ((stepT -= dt) <= 0) { stepT = v < 2.5 ? 0.52 : v < 5 ? 0.36 : 0.29; sfx?.step(surface, v / 6.4); } } else stepT = 0.08;
    if (!grounded) airT += dt; else { if (airT > 0.3) sfx?.land(surface); airT = 0; }
    sfx?.update(dt, { x: wp.x, z: wp.z, fx: look.x - camera.position.x, fz: look.z - camera.position.z, wind: windy, ride: !!ride });
    if (helm || ride) sfx?.sail(boat.speed01, helm ? hin.steer : 0, boat.boosting, boat.lift); if (boat.bump) sfx?.bump(boat.bump);
    target.copy(root.position).setY(root.position.y + 1.55);
    if (helm) { const c = boat.centre, ahead = 2 + 6 * boat.speed01; target.set(c.x + Math.sin(boat.yaw) * ahead, c.y + 2.6, c.z + Math.cos(boat.yaw) * ahead); }   // her steady centre: the helmsman sways with every lean and pitch
    npcs.update(dt, root.position, !!ride || hud.open); folk.update(dt, root.position); animals.update(dt, clock.elapsedTime, root.position, v, camera.position);
    if (ride && clock.elapsedTime - lastLook > 2.5) {                               // on the boat the view settles behind and beside it
      const want = boat.yaw + 2.3; camYaw += Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw)) * Math.min(1, dt * 0.8); camPitch += (0.3 - camPitch) * Math.min(1, dt * 0.8);   // its outer side: the island shows across the deck
    }
    if (fellAt) camPitch += (1.05 - camPitch) * Math.min(1, dt * 1.5);              // falling: the view tips over to watch him drop into the clouds
    if (helm && clock.elapsedTime - lastLook > 1.5) {                              // at the helm the view swings back round behind her
      const want = boat.yaw + Math.PI; camYaw += Math.atan2(Math.sin(want - camYaw), Math.cos(want - camYaw)) * Math.min(1, dt * 2.2); camPitch += (0.28 + 0.06 * boat.speed01 - camPitch) * Math.min(1, dt * 1.5);
    }
    if (ringing && !dragging) {                                                       // ringing: the view eases round to his right, a little in front, so the raised arm, his face and the bell show together
      if (ringing.cam === undefined) ringing.cam = camYaw;
      camYaw += wrapA(statue.bellYaw - 1.2 - camYaw) * Math.min(1, dt * 2.5); camPitch += (0.18 - camPitch) * Math.min(1, dt * 2.5);
    } else if (camBack !== null && !dragging) { camYaw += wrapA(camBack - camYaw) * Math.min(1, dt * 2.5); if (Math.abs(wrapA(camBack - camYaw)) < 0.03) camBack = null; }   // ...then back behind him
    else if (dragging) camBack = null;
    camGoal.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch)).multiplyScalar(ride ? 13 : helm ? 12 + 8 * boat.speed01 + (boat.boosting ? 2 : 0) : camDist).add(target);
    camGoal.y = Math.max(camGoal.y, terrain.heightAt(camGoal.x, camGoal.z) + 0.6);
    if (pose) {                                                                      // sitting: orbit the ronin (framed off-centre); lookout: turn in place
      orbit.set(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
      if (pose.kind === 'sit') { target.copy(pose.pivot).add(goalV.set(orbit.z, 0, -orbit.x).normalize().multiplyScalar(0.8)); camGoal.copy(target).addScaledVector(orbit, pose.dist); camGoal.y = Math.max(camGoal.y, terrain.heightAt(camGoal.x, camGoal.z) + 0.6); }
      else { camGoal.copy(pose.pivot); target.copy(pose.pivot).addScaledVector(orbit, -30); }
    }
    if (ringing && !dragging) {                                                       // a set shot for the ringing, clear of the pillars and their garlands
      // (b: from him towards the bell, r: his right) from behind the bell and a little to his right, looking back through the
      // arch: his face, the raised arm and the bell above it (from the side a pillar is always in the way)
      const st = statue.ringStand, bx = Math.sin(statue.bellYaw), bz = Math.cos(statue.bellYaw), rx = -bz, rz = bx;
      camGoal.set(st.x + bx * 2.7 + rx * 1.4, wp.y + 1.45, st.z + bz * 2.7 + rz * 1.4);
      target.set(st.x + bx * 0.25, wp.y + 1.6, st.z + bz * 0.25);
    }
    if (talkAt) {                                                                // over the shoulder, framing the villager's face
      const d = new THREE.Vector3(wp.x - talkAt.x, 0, wp.z - talkAt.z).normalize();
      camGoal.set(wp.x, talkAt.y + 0.2, wp.z).addScaledVector(d, 2.2).add(new THREE.Vector3(d.z, 0, -d.x).multiplyScalar(1.05));
      target.copy(talkAt);
    }
    const from = talkAt ? new THREE.Vector3(wp.x, wp.y + 1.6, wp.z) : target;          // in a conversation, check the view from the ronin, not inside the villager's shop
    move.subVectors(camGoal, from); const want = move.length(); move.divideScalar(want);
    ray.origin = from; ray.dir = move;
    const hit = pose?.kind === 'look' || ride || helm ? null : world.castRay(ray, want, true, undefined, undefined, undefined, body);
    if (hit) camGoal.copy(from).addScaledVector(move, Math.max(talkAt ? 0.5 : 1.0, hit.timeOfImpact - 0.3));
    camera.position.lerp(camGoal, 1 - Math.exp(-dt * (pose && !dragging ? 1.6 : hit ? 20 : dragging ? 18 : helm ? 14 : 7)));   // at the helm the swing is already eased, so the camera sticks to it (a loose lerp at speed trailed and wobbled)
    if (look.distanceToSquared(target) > 100) look.copy(target);
    look.lerp(target, 1 - Math.exp(-dt * (pose && !dragging ? 1.6 : 12))); camera.lookAt(look);
    if (camOverride) { camera.position.copy(camOverride[0]); camera.lookAt(camOverride[1]); }
    const fov = 60 + (helm ? 9 * boat.speed01 + (boat.boosting ? 5 : 0) : 0);         // the view opens up at speed
    if (Math.abs(fov - camera.fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 2.5); camera.updateProjectionMatrix(); }
    sun.position.copy(target).addScaledVector(sunDir, 140); sun.target.position.copy(target);
    updateGrass(camera.position, clock.elapsedTime); updateClouds(clock.elapsedTime); updateWater(clock.elapsedTime); life.update(dt, clock.elapsedTime, root.position); statue.update(clock.elapsedTime); decor.update(clock.elapsedTime); decorTime.value = clock.elapsedTime; boards.update(clock.elapsedTime); updateFire(clock.elapsedTime); updateBeams(clock.elapsedTime);
    renderer.render(scene, camera);
    // what E would act on: the nearest thing in reach, roughly in front of you
    let best: Spot | null = null, bd = Infinity;
    if (ride) { rideSpot.at.set(wp.x, wp.y + 2.3, wp.z); best = rideSpot; }
    else if (helm) best = boat.mode !== 'pilot' ? null : boat.dockable ? dockSpot : letGoSpot;
    else if (!talk && !pose && !hud.open && !ringing && fellAt === 0) {
      const deer = animals.bowable(wp.x, wp.z, v); if (deer) bowSpot.at.copy(deer);
      for (const sp of deer ? [...spots, bowSpot] : spots) {
        if (sp.id === 'boat' && boat.mode !== 'docked') continue;                  // the tour leaves from the berth
        const dx = sp.at.x - wp.x, dz = sp.at.z - wp.z, d = Math.hypot(dx, dz);
        if (d > sp.radius || Math.abs(sp.at.y - wp.y) > 4) continue;
        const ahead = (dx * Math.sin(faceYaw) + dz * Math.cos(faceYaw)) / Math.max(d, 0.01);
        const score = d - ahead * 1.2; if (score < bd) { bd = score; best = sp; }
      }
    }
    if (best !== current) { current = best; hud.prompt(best ? best.label : null, best ? best.at : null, best?.button); }
    hud.update(dt, camera, camYaw + Math.PI, root.position, markers.map((m) => (m.villager ? { ...m, met: met.has(m.id) } : m)));
    tick += dt;
    if (tick > 0.2) {
      tick = 0;
      const lifted = wp.y - terrain.heightAt(wp.x, wp.z) > 0.15;                     // standing on something built over the ground
      surface = ride || helm || boat.aboard(wp) || (lifted && (decks.some(([x, z, r]) => (wp.x - x) ** 2 + (wp.z - z) ** 2 < r * r) || near(ropePts, wp.x, wp.z) < 2.2)) ? 'wood'
        : !lifted && waterDepthAt(wp.x, wp.z) > 0.03 ? 'water'
        : lifted || near(pathPts, wp.x, wp.z) < 2.4 || Math.hypot(wp.x - CS.x, wp.z - CS.z) < I.stairs.terrace ? 'stone' : 'grass';
      if ((spotT += 1) >= 15 && grounded && !ride && !helm && !pose && !ringing && !fellAt && boat.mode !== 'hold') { spotT = 0; saveSpot([wp.x, wp.y, wp.z, faceYaw]); }   // every 3 s on solid ground
      windy = Math.min(1, Math.max(0, (wp.y - 6) / 16, 1 - near(I.rim, wp.x, wp.z) / 14));

    }
    // sharpness steps down only when frames are slow most of the time: the median of 2 s, so a one-off hitch (a GC pause, a
    // tab switch) doesn't blur the picture for good
    frameLog[frames++] = dt;
    if (frames === 120) { if (frameLog.sort()[60] > 0.019 && dpr > 0.75) renderer.setPixelRatio((dpr = Math.max(0.75, dpr - 0.25))); frames = 0; }
  };
  // warm-up while the loading screen is still up: every shader (shadow casters too) and every texture goes to the GPU
  // now, so nothing compiles or uploads mid-game
  // Things that are hidden or cast no shadow right now (far folk and villagers, the farm, props shown only during a clip)
  // would otherwise compile their shadow shader the first time you walk up to them: a ~30 ms hitch. So for the warm-up
  // everything is shown and every lit mesh casts, then each goes back to how it was.
  const held: [THREE.Object3D, boolean, boolean][] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh, lit = m.isMesh && !(m.material as THREE.Material & { isShaderMaterial?: boolean }).isShaderMaterial;
    held.push([o, o.visible, m.castShadow]); o.visible = true; if (lit && !low) m.castShadow = true;
  });
  await renderer.compileAsync(scene, camera);
  uploadTextures(scene);
  const sc = sun.shadow.camera, box = { left: sc.left, right: sc.right, top: sc.top, bottom: sc.bottom, far: sc.far };
  Object.assign(sc, { left: -400, right: 400, top: 400, bottom: -400, far: 1200 }); sc.updateProjectionMatrix();
  sun.position.copy(sunDir).multiplyScalar(500); sun.target.position.set(0, 0, 0); renderer.render(scene, camera);
  Object.assign(sc, box); sc.updateProjectionMatrix();
  for (const [o, v, c] of held) { o.visible = v; o.castShadow = c; }
  let first = true; try { first = !localStorage.getItem(KEY + '-arrived'); } catch { /* private mode: arrive every visit */ }
  const back = first ? null : loadSpot();
  // still on the island (a later update could have moved the ground): within reach of the terrain's height there
  if (back && back[1] > terrain.heightAt(back[0], back[2]) - 1 && back[1] < terrain.heightAt(back[0], back[2]) + 8) {
    const p = { x: back[0], y: back[1] + 0.05, z: back[2] }; body.setTranslation(p, true); body.setNextKinematicTranslation(p); faceYaw = back[3]; camYaw = faceYaw + Math.PI;
  }
  if (first) startRide('arrive');
  const ro = new ResizeObserver(() => { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); });
  ro.observe(host);

  return {
    setActive(on: boolean) { clock.getDelta(); renderer.setAnimationLoop(on ? frame : null); if (!on) keys.clear(); if (audio) (on ? audio.resume() : audio.suspend()).catch(() => {}); },
    setMuted: (m: boolean) => sfx?.setMuted(m), setVolume: (v: number) => sfx?.setVolume(v),
    talkNext, talkClose,
    villagers: () => npcs.list(),
    spots: () => spots.map((sp) => ({ id: sp.id, at: sp.at.toArray().map((n) => +n.toFixed(2)) })),
    pose: () => pose?.kind ?? null,
    animals: () => animals.list(), ride: () => ride, sail: (k: Voyage | null) => (k ? startRide(k) : endRide()),
    /** testing aid: take the helm (true), let go (false), or hold an input at the helm until the next call (null clears it) */
    helm(x: boolean | Partial<Helm> | null) { if (x === true) { if (ride) endRide(); if (!helm) takeHelm(); } else if (x === false) { helmTest = null; if (helm) letGo(); } else helmTest = x; },
    /** testing aid: the boat's state; dock her (at the helm, near the pier); or put her somewhere, stopped */
    boat: () => ({ ...boat.debug(), helm, aboard: boat.aboard(body.translation()), fov: +camera.fov.toFixed(1) }),
    dock: () => helm && boat.dockIn(),
    boatAt: (x: number, y: number, z: number, yaw = 0) => boat.put(x, y, z, yaw),
    reads: () => boards.reads.map((r) => ({ id: r.id, at: r.at.toArray(), face: r.face.toArray() })),
    scene,
    /** testing aid: compiled shader programs, to catch anything compiling mid-game */
    programs: () => renderer.info.programs?.map((q) => `${q.name} ${q.cacheKey.slice(0, 300)}`),
    /** testing aid: put the ronin at a point, facing a heading, the camera at a pitch */
    place(x: number, z: number, yaw: number, pitch = 0.2, y?: number) {
      if (ride) endRide(); if (helm) letGo(); talkClose(); pose = null;
      const p = { x, y: (y ?? terrain.heightAt(x, z)) + 0.3, z }; body.setTranslation(p, true); body.setNextKinematicTranslation(p); vy = 0;
      faceYaw = yaw; camYaw = yaw + Math.PI; camPitch = pitch; lastLook = clock.elapsedTime;
    },
    /** testing aid: what's under a screen point (0–1 across and down) */
    pick(px: number, py: number) {
      const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), camera);
      const h = rc.intersectObjects(scene.children, true)[0]; if (!h) return null;
      const m = h.object as THREE.Mesh, mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material | undefined;
      return { name: m.name, parent: m.parent?.name, type: m.type, material: mat?.name, instance: h.instanceId, point: h.point.toArray().map((n) => +n.toFixed(2)), dist: +h.distance.toFixed(2) };
    },
    /** testing aid: look from a point at a point (null to hand the camera back) */
    view(from: number[] | null, to: number[] = [0, 0, 0]) { camOverride = from ? [new THREE.Vector3(...from), new THREE.Vector3(...to)] : null; },
    /** testing aid: the scene's top-level pieces (index, kind, triangles), and hide/show one by index to weigh its cost */
    layers: () => scene.children.map((o, i) => { let t = 0; o.traverse((m) => { const g = (m as THREE.Mesh).geometry; if (g) t += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3 * ((m as THREE.InstancedMesh).count ?? 1); }); return `${i}:${o.type}:${o.name || ((o as THREE.Mesh).material as THREE.Material)?.type || ''}:${Math.round(t)}`; }),
    toggle: (i: number) => { const o = scene.children[i]; if (o) o.visible = !o.visible; return o?.visible; },
    drawn: () => root.position.toArray(),
    probe: (x: number, y: number) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(x, y), camera); const h = r.intersectObjects(scene.children, true)[0]; return h ? { type: h.object.type, inst: h.instanceId, col: ((h.object as THREE.Mesh).material as THREE.MeshStandardMaterial)?.color?.getHexString(), verts: (h.object as THREE.Mesh).geometry?.attributes.position.count, name: h.object.name, mat: (h.object as THREE.Mesh & { material: THREE.Material }).material?.name, parent: h.object.parent?.name, at: h.point.toArray().map((n) => +n.toFixed(1)), cam: camera.position.toArray().map((n) => +n.toFixed(1)) } : null; },
    stats: () => { const p = body.translation(); return { dpr, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, pos: [p.x, p.y, p.z].map((n) => +n.toFixed(2)), grounded }; },
    dispose() {
      renderer.setAnimationLoop(null); ro.disconnect(); joystick?.destroy(); joyZone?.remove(); helmUI?.remove();
      host.removeEventListener('pointerdown', pd); host.removeEventListener('pointermove', pm); host.removeEventListener('pointerup', pu); host.removeEventListener('pointercancel', pu);
      host.removeEventListener('keydown', down); host.removeEventListener('keyup', up); host.removeEventListener('blur', blur);
      hud.dispose(); fallUI.remove(); renderer.dispose(); pmrem.dispose(); world.free(); renderer.domElement.remove(); audio?.close();
    },
  };
}

/** points every `step` m along a polyline (for "am I on the path" checks) */
function interpolate(p: [number, number][], step = 2) {
  const out: [number, number][] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}
