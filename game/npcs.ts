import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Island } from './island';
import type { Terrain } from './terrain';
import type { Bubble, Choice } from './hud';
import { DIALOGUE, type Script } from './dialogue';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** a page of a conversation, ready for the HUD (index/total kept so older callers still find the last page) */
export type Talk = Bubble & { id: string; index: number; total: number };
/** what the ronin does in a shared moment (start.ts): stand or sit at `at` facing `face`, play the interact clip on `act` */
export type MomentCue = { id: string; step: number; at?: THREE.Vector3; face?: number; sit?: boolean; act?: boolean };
/** strike: a hammer on the anvil (distance to you); line: a line was said, for its voice ("greet0", "topic-tools-2",
 * "bye1", "bark3", "moment0", "react-wave", "react-bow"; text to murmur when there's no recording); bark: a call as you pass,
 * floated over their head; moment: the ronin's part in a shared moment */
export type Hooks = {
  strike: (dist: number) => void; line?: (id: string, key: string, text: string) => void;
  bark?: (text: string, at: THREE.Vector3, pitch: number) => void; moment?: (m: MomentCue) => void;
  /** the pandit's hand bell swung once during the aarti (distance to you) */
  handbell?: (dist: number) => void;
};
export type Spot4 = { x: number; z: number; yaw: number; y: number };
/** the shrine (statue.ts): the pandit's mat (facing the statue), where he stands for the aarti, the lingam's top */
export type Shrine = { priestSpot: Spot4; aartiSpot: Spot4; lingam: THREE.Vector3 };
type Gesture = 'nod' | 'bow' | 'wave' | 'stretch' | 'namaste';
/** one stop on a villager's little round, in the spot's frame like `at`: which way they face there (0 = the spot's
 * front), what they do (a clip, or 'hammer' / 'sweep' laid over the idle), for how long, `once` = play it once then
 * idle, `via: 'sweep'` = sweeping as she walks there. The pandit's stops are 'sit' (cross-legged on his mat, telling
 * beads), 'aarti' and 'offer' (his own clips); they are placed from the Shrine, not the spot frame */
type Stop = { at: [number, number]; face: number; do: string; t: [number, number]; once?: boolean; via?: string };
type Villager = {
  id: string; name: string; role: string; seal: string; spot: string; at: [number, number]; pitch: number; work: string; overlay: 'hammer' | 'none';
  /** a tint over the body texture (the free character kit has few skin tones) */
  skin?: number;
  hair?: number; link?: string; cta?: string; seated?: boolean; where: string; summary: string; bark: string;
  route?: Stop[]; greet: Gesture[]; hand?: 'l' | 'r';
};

// The villagers. Every fact they tell comes from the site (their words live in dialogue.ts); names are invented. `at`
// is an offset in the spot's own frame (x right, z forward), so they stand at their workplace whichever way it faces.
// Standing villagers make small rounds near their post; the seated ones stay put.
export const CAST: Villager[] = [
  { id: 'genzo', name: 'Genzo', role: 'the blacksmith', seal: '鍛', spot: 'smithy', at: [0.8, -0.9], pitch: 0.8, work: 'idle', overlay: 'hammer', hair: 0x9a958d,
    where: 'At the smithy by the stream', summary: 'Aasish\'s sixteen tools, from TypeScript to Vitest, each one kept sharp.', bark: 'Mind the sparks!',
    link: '#work', cta: 'See what he built with them', greet: ['nod', 'wave'], hand: 'l',
    route: [{ at: [0.8, -0.9], face: 0, do: 'hammer', t: [7, 11] },                     // at the anvil
      { at: [-0.2, -1.2], face: -1.57, do: 'work', once: true, t: [2.4, 3.2] },           // a bar from the coals
      { at: [0.8, -0.9], face: 0, do: 'hammer', t: [7, 11] },
      { at: [1.0, -1.35], face: 1.57, do: 'work', once: true, t: [2, 2.8] }] },            // quench it in the trough
  { id: 'hana', name: 'Hana', role: 'the courier', seal: '便', spot: 'post', at: [0.6, 2.05], pitch: 1.35, work: 'idle', overlay: 'none', hair: 0x2a2420,
    where: 'At the post station by the pier', summary: 'Hitmen drafts email replies in the right tone, and never sends without you.', bark: 'Morning! Busy, busy.',
    link: '/work/hitmen', cta: 'Read the Hitmen case study', greet: ['wave', 'bow'], hand: 'r',
    route: [{ at: [0.6, 2.05], face: 0, do: 'idle', t: [6, 10] },                        // out front of the counter
      { at: [0.1, 1.95], face: Math.PI, do: 'work', once: true, t: [2.4, 3.2] },          // the next bundle off the counter
      { at: [1.3, 4.6], face: 0.9, do: 'give', once: true, t: [2.6, 3.4] }] },            // handed on down the pier path
  { id: 'sora', name: 'Sora', role: 'the inventor', seal: '匠', spot: 'workshop', at: [0, -0.6], pitch: 1.1, work: 'work', overlay: 'none', hair: 0x3a2c24,
    where: 'At her workshop below the pagoda', summary: 'Nova OS, built solo in three weeks: your keys, your approval, your memory. And agents tested before they ship.', bark: 'Careful, the gears are turning.',
    link: '/work/nova-os', cta: 'Read the Nova OS case study', greet: ['nod', 'wave'], hand: 'r',
    route: [{ at: [0, -0.6], face: 0, do: 'work', t: [8, 12] },                          // kneeling at her machine
      { at: [-1.35, -1.2], face: -1.57, do: 'give', once: true, t: [2.6, 3.4] },          // a gear on the wall rack
      { at: [0, -0.6], face: 0, do: 'work', t: [8, 12] },
      { at: [1.3, -0.5], face: 0.3, do: 'idle', t: [3, 5] }] },                            // a step back to look at it
  { id: 'daisuke', name: 'Daisuke', role: 'the castle guard', seal: '守', spot: 'gate', at: [2.7, 2.1], pitch: 0.9, work: 'work', overlay: 'none', hair: 0x221e1c,
    where: 'At the castle gate', summary: 'Security first: trained in ethical hacking at Coventry University, built in from the first stone.', bark: 'Keep to the path, traveller.',
    greet: ['nod', 'bow'],
    // (his patrol keeps ~1.6 m off the wall face and the posts: walking along it, his raised torch arm swings toward the wall)
    route: [{ at: [2.7, 2.1], face: 0, do: 'work', t: [9, 14] },                         // on guard beside the gate
      { at: [5.0, 2.2], face: 0.35, do: 'work', t: [3, 5] },                                // along the wall
      { at: [2.7, 2.1], face: 0, do: 'work', t: [8, 12] },
      { at: [0.6, 2.6], face: -0.2, do: 'work', t: [3, 5] }] },                             // before the gateway, looking down the path
  { id: 'yuki', name: 'Yuki', role: 'the biwa player', seal: '琶', spot: 'sakura', at: [-2.4, -1.6], pitch: 1.25, work: 'idle', overlay: 'none', hair: 0x241e1c, seated: true,
    where: 'Under the sakura tree', summary: 'On repeat: “Still Got the Blues” by Gary Moore and “Dogs” by Pink Floyd.', bark: 'Listen... the wind is in tune today.', greet: ['nod'] },
  { id: 'tokubei', name: 'Tokubei', role: 'the storyteller', seal: '語', spot: 'storyteller', at: [0, 0], pitch: 0.95, work: 'talk', overlay: 'none', hair: 0x6a625c, seated: true,
    where: 'By the fire at the jungle\'s edge', summary: 'Worlds he loves: Elden Ring, Arkham Knight, Red Dead Redemption.', bark: 'Come, sit! I have a tale for you.', greet: ['wave', 'nod'], hand: 'r' },
  { id: 'ochiyo', name: 'Ochiyo', role: 'the tea house keeper', seal: '茶', spot: 'teahouse', at: [-1.2, 5.3], pitch: 1.15, work: 'idle', overlay: 'none', hair: 0x302620,
    where: 'At the tea house by the koi pond', summary: 'If something eats your week, tell Aasish. He\'ll write back with what an agent could take off your hands.', bark: 'The tea is warm, traveller.',
    link: 'contact', cta: 'Write to Aasish', greet: ['bow', 'wave'], hand: 'l',
    route: [{ at: [-1.2, 5.3], face: 0, do: 'idle', t: [5, 8] },
      { at: [-1.9, 4.85], face: 1.57, do: 'sweep', t: [3, 4.5] },                         // sweeping along the front of the deck
      { at: [1.3, 4.75], face: 1.57, do: 'sweep', t: [2, 3], via: 'sweep' }] },
  { id: 'shankar', name: 'Pandit Shankar', role: 'the temple priest', seal: 'ॐ', spot: 'shrine', at: [0, 0], pitch: 0.8, work: 'sit', overlay: 'none', skin: 0x958882,
    where: 'Before the stone Nataraja on the little islet', summary: 'The mountains: high passes, wildlife, and the Himalaya above all.', bark: 'Come, the lamp is lit. Sit a while.', greet: ['namaste'],
    route: [{ at: [0, 0], face: 0, do: 'sit', t: [16, 24] },                              // chanting on his mat, beads in hand
      { at: [0, 0], face: 0, do: 'aarti', t: [8, 11] },                                     // the lamp circled before the statue, the bell rung
      { at: [0, 0], face: 0, do: 'offer', once: true, t: [5.4, 5.8] }] },                   // marigolds and water on the lingam
];

// the shared moments, in the spot's frame: where the ronin stands or sits, where the villager steps to, the anvil top
const MOMENT: Record<string, { kind: 'anvil' | 'tea' | 'letter'; link?: string; cta?: string }> = {
  genzo: { kind: 'anvil' }, ochiyo: { kind: 'tea' }, hana: { kind: 'letter', link: 'contact', cta: 'Open the letter' },
};
// the UAL walk: how far the planted foot travels per second, per metre of hip height, at the 30 fps the clips were
// baked at (measured in Blender): ground speed = WALK * hip * timeScale keeps the feet from sliding
const WALK = 1.255;

type StopW = { x: number; z: number; face: number; do: string; t: [number, number]; once?: boolean; via?: string; y?: number };
type Look = { y: number; p: number; w: number; ey: number; ep: number };
/** the bones the layered motion turns; `all` and `clip` remember what the clip set, see update() */
type Bones = { s1: THREE.Object3D; s2: THREE.Object3D; s3: THREE.Object3D; neck: THREE.Object3D; head: THREE.Object3D; ua: THREE.Object3D[]; la: THREE.Object3D[]; eyes: THREE.Object3D[]; eyeRest: THREE.Quaternion[]; all: THREE.Object3D[]; clip: THREE.Quaternion[] };
type Force = StopW & { then?: () => void; there?: boolean };
type Live = {
  v: Villager; s: Script; root: THREE.Object3D; mixer: THREE.AnimationMixer; acts: Record<string, THREE.AnimationAction>; cur: THREE.AnimationAction | null;
  B: Bones | null; arm?: THREE.Object3D[]; body: RAPIER.RigidBody | null; spot: { x: number; z: number; yaw: number }; hip: number; headH: number;
  x: number; y: number; z: number; yaw: number; home: number; anchor: THREE.Vector3; headAt: THREE.Vector3; barkAt: THREE.Vector3;
  stops: StopW[]; si: number; mode: 'stay' | 'go'; T: number; onceT: number; spd: number; vary: number; held: boolean; resume: number;
  force: Force | null; look: Look; glance: { y: number; p: number } | null; glanceT: number; g: { kind: Gesture; t: number; dur: number; k: number } | null;
  idleT: number; sw: number; away: boolean; reactT: number; barkT: number; barkGap: number; lastBark: number; talkT: number; heard: Set<string>; acc: number; k: number; t: number; sparkT: number; cupT: number; tool: THREE.Object3D[]; casters: THREE.Object3D[]; shade: boolean;
  pj: Record<string, THREE.Object3D>; flame: THREE.MeshStandardMaterial | null; bellK: number;   // the pandit's puja things
};

/** something to sit on, suited to each seated villager (top 0.42 m, where the sitting pose rests): a little bench with
 * a red felt cloth under the sakura, a log by the storyteller's fire; for the pandit a woven asana mat on the ground */
function seat(id: string, low: boolean) {
  const g = new THREE.Group(), mat = (c: number, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.z = rz; mesh.castShadow = !low; mesh.receiveShadow = true; g.add(mesh);
  };
  if (id === 'tokubei') {                                                         // a log, bark on the sides and cut rings on the ends
    add(new THREE.CylinderGeometry(0.2, 0.215, 0.95, 12), [mat(0x4d3a30, 1), mat(0xb08a5a, 0.9), mat(0xb08a5a, 0.9)], 0, 0.21, 0, Math.PI / 2);
  } else if (id === 'shankar') {                                                   // a maroon mat with a saffron field
    add(new THREE.BoxGeometry(0.95, 0.02, 0.75), mat(0x6a1a1a, 0.95), 0, 0.01, 0); add(new THREE.BoxGeometry(0.8, 0.022, 0.6), mat(0xc77a1e, 0.95), 0, 0.012, 0);
  } else {                                                                         // a little bench with a red felt cloth
    const wood = mat(0x6b4a32);
    add(new THREE.BoxGeometry(0.72, 0.05, 0.4), wood, 0, 0.375, 0);
    for (const x of [-0.3, 0.3]) for (const z of [-0.15, 0.15]) add(new THREE.BoxGeometry(0.05, 0.35, 0.05), wood, x, 0.175, z);
    const felt = mat(0xb3241e, 0.95); add(new THREE.BoxGeometry(0.68, 0.02, 0.43), felt, 0, 0.41, 0); add(new THREE.BoxGeometry(0.68, 0.1, 0.012), felt, 0, 0.36, 0.215);
  }
  return g;
}

// ---------------------------------------------------------------- cloth: woven patterns, stitched hems, soft folds
// Each garment keeps its colour from the GLB and gets a small tile drawn here (R: the motif, G: the weave), laid on
// triplanar from the bind pose so the pattern moves with the cloth, plus drape folds (shading and a bump) and, from the
// `_hem` distance npc_build.py bakes in, a folded hem with a running stitch. One shader for every garment.
// [pattern, tiles per metre, motif colour, folds 0-1.5, hem width (0..1 of 10 cm, 0 = none)]
type Weave = [string, number, number, number, number];
const CLOTH: Record<string, Weave> = {
  Genzo_top: ['sashiko', 8, 0xa9a49a, 0.8, 0.28], Genzo_pants: ['plain', 30, 0, 1.1, 0.2], Genzo_apron: ['leather', 5, 0, 0.4, 0.2], Genzo_obi: ['hishi', 22, 0x1e1710, 0, 0],
  Hana_top: ['yagasuri', 7, 0x4a5b8e, 0.8, 0.25], Hana_pants: ['kasuri', 14, 0x5a6a94, 1.1, 0.2], Hana_obi: ['hishi', 22, 0xa88c5a, 0, 0],
  Sora_top: ['kikko', 10, 0x84936a, 0.9, 0.25], Sora_pants: ['plain', 30, 0, 1.1, 0.2], Sora_apron: ['canvas', 18, 0, 0.5, 0.22], Sora_obi: ['hishi', 22, 0x2a1d12, 0, 0],
  Daisuke_top: ['plain', 30, 0, 0.7, 0.25], Daisuke_pants: ['shima', 7, 0x34343c, 1.3, 0.2], Daisuke_armor: ['lamellar', 9, 0x8c6a2c, 0, 0], Daisuke_armor_cord: ['plain', 40, 0, 0, 0], Daisuke_obi: ['hishi', 22, 0x0b1430, 0, 0],
  Yuki_top: ['seigaiha', 5, 0xc0606a, 0.9, 0.25], Yuki_pants: ['plain', 30, 0, 1.4, 0.2], Yuki_obi: ['hishi', 20, 0x8a2a1a, 0, 0],
  Tokubei_top: ['shima', 16, 0x5a3c22, 0.8, 0.22], Tokubei_haori: ['koshi', 7, 0x4e4034, 0.9, 0.3], Tokubei_pants: ['plain', 30, 0, 1.2, 0.2], Tokubei_obi: ['hishi', 22, 0x4a3a28, 0, 0],
  Ochiyo_top: ['asanoha', 6, 0x5d6c9c, 0.9, 0.25], Ochiyo_pants: ['plain', 30, 0, 1.2, 0.2], Ochiyo_apron: ['canvas', 22, 0, 0.6, 0.25], Ochiyo_headscarf: ['mame', 14, 0x2c3c6c, 0.4, 0.2], Ochiyo_obi: ['hishi', 22, 0xe0b080, 0, 0],
  Shankar_dhoti: ['plain', 30, 0, 1.2, 0.25], Shankar_waist: ['plain', 30, 0, 0.3, 0], Shankar_angavastram: ['plain', 30, 0, 0.5, 0.4], Shankar_janeu: ['plain', 40, 0, 0, 0],
  tabi: ['plain', 40, 0, 0.2, 0.15], collar: ['plain', 40, 0, 0, 0], headband: ['plain', 40, 0, 0, 0], hat: ['straw', 14, 0, 0, 0], broom_head: ['straw', 10, 0, 0, 0],
};
const tiles = new Map<string, THREE.Texture>();
/** a 128 px tile: the motif (white on black) into red, the weave (grey around mid) into green */
function tile(kind: string) {
  const old = tiles.get(kind); if (old) return old;
  const S = 128, cv = (f: (c: CanvasRenderingContext2D) => void, bg: string) => { const e = document.createElement('canvas'); e.width = e.height = S; const c = e.getContext('2d')!; c.fillStyle = bg; c.fillRect(0, 0, S, S); f(c); return c.getImageData(0, 0, S, S).data; };
  let k = kind.length * 977; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
  const line = (c: CanvasRenderingContext2D, pts: number[][], w: number) => { c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
  const motif = cv((c) => {                                                       // each drawn past the edges, so the tile repeats seamlessly
    c.strokeStyle = c.fillStyle = '#fff'; c.lineCap = 'round';
    {
      if (kind === 'sashiko') { c.setLineDash([7, 5]); for (let i = 0; i < 4; i++) { line(c, [[i * 32 + 16, 0], [i * 32 + 16, S]], 2.4); line(c, [[0, i * 32 + 16], [S, i * 32 + 16]], 2.4); } c.setLineDash([]); }
      if (kind === 'yagasuri') for (let i = 0; i < 4; i++) for (let j = -1; j < 5; j++) {   // arrow fletching, every other column flipped
        const x = i * 32, y = j * 32 + (i % 2) * 16; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 16, y + 11); c.lineTo(x + 32, y); c.lineTo(x + 32, y + 15); c.lineTo(x + 16, y + 26); c.lineTo(x, y + 15); c.closePath(); if (i % 2 === 0) c.fill(); else { c.lineWidth = 2; c.stroke(); }
      }
      if (kind === 'kikko') for (let j = -1; j < 6; j++) for (let i = -1; i < 5; i++) {      // tortoiseshell hexagons, a little tall
        const cx = i * 32 + (j % 2 ? 16 : 0), cy = j * 32; line(c, [0, 1, 2, 3, 4, 5, 6].map((q) => [cx + Math.sin(q * Math.PI / 3) * 18.5, cy + Math.cos(q * Math.PI / 3) * 21.3]), 2);
      }
      if (kind === 'seigaiha') for (let j = 0; j < 10; j++) for (let i = -1; i < 5; i++) {    // overlapping waves, each row over the one above
        const x = i * 32 + (j % 2 ? 16 : 0), y = j * 16; c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, 16, Math.PI, 0); c.fill();
        for (const rr of [15, 10.5, 6]) { c.beginPath(); c.arc(x, y, rr, Math.PI, 0); c.lineWidth = 1.2; c.stroke(); }
      }
      if (kind === 'asanoha') {                                                    // hemp leaf: a triangle grid and the spokes to each centre
        const a = 32, h = S / 4, P = (i: number, j: number) => [i * a + (j % 2 ? a / 2 : 0), j * h];
        for (let j = -1; j < 5; j++) for (let i = -1; i < 5; i++) {
          const A = P(i, j), B = P(i + 1, j), C = [A[0] + a / 2, (j + 1) * h], D = [C[0] + a, C[1]];
          for (const t of [[A, B, C], [B, C, D]]) { const m = [(t[0][0] + t[1][0] + t[2][0]) / 3, (t[0][1] + t[1][1] + t[2][1]) / 3]; line(c, [t[0], t[1], t[2], t[0]], 1.4); for (const q of t) line(c, [q, m], 1.1); }
        }
      }
      if (kind === 'mame') for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(i * 32 + (j % 2) * 16 + 8, j * 32 + 8, 5.5, 0, 6.283); c.fill(); }
      if (kind === 'koshi') for (let i = 0; i < 4; i++) { c.fillRect(i * 32, 0, 5, S); c.fillRect(0, i * 32, S, 5); c.fillRect(i * 32 + 16, 0, 1.5, S); c.fillRect(0, i * 32 + 16, S, 1.5); }
      if (kind === 'shima') for (let i = 0; i < 8; i++) c.fillRect(i * 16, 0, i % 2 ? 2 : 5, S);
      if (kind === 'kasuri') for (let i = 0; i < 26; i++) c.fillRect(r() * (S - 4), r() * (S - 11), 2 + r() * 2, 5 + r() * 6);
      if (kind === 'hishi') for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const x = i * 32 + 16, y = j * 32 + 16; line(c, [[x, y - 14], [x + 14, y], [x, y + 14], [x - 14, y], [x, y - 14]], 1.8); c.fillRect(x - 3, y - 3, 6, 6); }
      if (kind === 'lamellar') for (let j = 0; j < 8; j++) { c.fillRect(0, j * 16 + 13, S, 3); for (let i = 0; i < 16; i++) c.fillRect(i * 8 + (j % 2) * 4, j * 16, 1.2, 13); }
      if (kind === 'kesa') { for (const y of [0, 52, 86]) c.fillRect(0, y, S, 3); for (const [x, y0, y1] of [[0, 0, 52], [70, 0, 52], [40, 52, 86], [100, 52, 86], [20, 86, 128], [84, 86, 128]]) c.fillRect(x, y0, 3, y1 - y0); }
    }
  }, '#000');
  const weave = cv((c) => {
    if (kind === 'leather') { for (let i = 0; i < 260; i++) { const g = 108 + r() * 40; c.fillStyle = `rgb(${g},${g},${g})`; c.beginPath(); c.arc(r() * S, r() * S, 2 + r() * 7, 0, 6.283); c.fill(); } return; }
    if (kind === 'straw') { for (let i = -S; i < S * 2; i += 6) { c.strokeStyle = (i / 6) % 2 ? '#9a9a9a' : '#5c5c5c'; line(c, [[i, 0], [i + S, S]], 3.4); } return; }
    if (kind === 'kesa') { for (const [x, y, w, h] of [[0, 0, 70, 52], [70, 0, 58, 52], [0, 52, 40, 34], [40, 52, 60, 34], [100, 52, 28, 34], [0, 86, 20, 42], [20, 86, 64, 42], [84, 86, 44, 42]]) { const g = 104 + r() * 48; c.fillStyle = `rgb(${g},${g},${g})`; c.fillRect(x, y, w, h); } }
    const step = kind === 'canvas' ? 4 : 2;                                         // over-under threads, then a little slub
    for (let y = 0; y < S; y += step) for (let x = 0; x < S; x += step) { const g = ((x + y) / step) % 2 ? 152 : 104; c.fillStyle = `rgba(${g},${g},${g},.5)`; c.fillRect(x, y, step, step); }
    for (let i = 0; i < 40; i++) { const g = 100 + r() * 56; c.fillStyle = `rgba(${g},${g},${g},.35)`; c.fillRect(r() * S, r() * S, 1 + r() * 10, 1); }
  }, '#808080');
  const px = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { px[i * 4] = motif[i * 4]; px[i * 4 + 1] = weave[i * 4 + 1]; px[i * 4 + 3] = 255; }
  const tex = new THREE.DataTexture(px, S, S); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 4; tex.needsUpdate = true; tiles.set(kind, tex);
  return tex;
}
const CLOTH_VS = `attribute float clothHem;
varying vec3 vCP; varying vec3 vCN; varying float vHem;`;
const CLOTH_FS = `uniform sampler2D uTile; uniform float uScale, uFold, uHem; uniform vec3 uC2;
varying vec3 vCP; varying vec3 vCN; varying float vHem;
float clothH;
vec3 clothBump(vec3 p, vec3 n, float h, float fd) {
  vec3 sx = dFdx(p), sy = dFdy(p), r1 = cross(sy, n), r2 = cross(n, sx); float det = dot(sx, r1) * fd;
  return normalize(abs(det) * n - sign(det) * (dFdx(h) * r1 + dFdy(h) * r2));
}`;
/** turn a garment's plain material into woven cloth (by its name from npc_build.py) */
function dress(m: THREE.MeshStandardMaterial, geo: THREE.BufferGeometry) {
  const key = m.name.replace(/_mat$/, ''), w = CLOTH[key] ?? CLOTH[key.replace(/^[A-Za-z]+_/, '')]; if (!w) return;
  const hem = geo.getAttribute('_hem'); if (hem) { geo.setAttribute('clothHem', hem); geo.deleteAttribute('_hem'); }
  const u = { uTile: { value: tile(w[0]) }, uScale: { value: w[1] }, uC2: { value: new THREE.Color(w[2]) }, uFold: { value: w[3] }, uHem: { value: hem ? w[4] : 0 } };
  if (w[0] === 'plain' || w[0] === 'canvas' || w[0] === 'leather' || w[0] === 'straw') u.uC2.value.copy(m.color);   // weave only
  m.userData.tex = u.uTile.value;                                                 // start.ts uploads it during the warm-up
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${CLOTH_VS}`).replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = position; vCN = normal; vHem = clothHem;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${CLOTH_FS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 bw = pow(abs(normalize(vCN)), vec3(4.0)); bw /= bw.x + bw.y + bw.z; vec3 q = vCP * uScale;
  vec4 tl = texture2D(uTile, q.zy) * bw.x + texture2D(uTile, q.xz) * bw.y + texture2D(uTile, q.xy) * bw.z;
  vec3 cloth0 = diffuseColor.rgb; diffuseColor.rgb = mix(cloth0, uC2, tl.r) * (0.8 + 0.4 * tl.g);
  float fold = sin(vCP.x * 23.0 + sin(vCP.z * 17.0 + vCP.y * 3.0) * 1.7 + vCP.y * 2.0) * 0.5 + sin(vCP.z * 29.0 - vCP.x * 9.0 + vCP.y * 4.0) * 0.5;
  diffuseColor.rgb *= 1.0 - uFold * 0.16 * (0.5 - 0.5 * fold); clothH = fold * 0.0035 * uFold;
  if (uHem > 0.0) {                                    // the hem: a folded band, a touch darker, and a running stitch
    float band = 1.0 - smoothstep(uHem * 0.8, uHem, vHem), st = 1.0 - smoothstep(0.018, 0.04, abs(vHem - uHem * 0.55));
    float dash = smoothstep(0.38, 0.48, fract((vCP.x + vCP.y + vCP.z) * 46.0)) * clamp(1.6 - fwidth(vHem) * 30.0, 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - 0.16 * band), mix(cloth0, vec3(0.62, 0.58, 0.5), 0.45), st * dash * 0.7); clothH += band * 0.0012;
  }`)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = clothBump(-vViewPosition, normal, clothH, faceDirection);');
  };
  m.customProgramCacheKey = () => 'villager-cloth';
}

// ---------------------------------------------------------------- bones, turned after the clip has posed them
const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _a = new THREE.Quaternion(), _b = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(), FWD = new THREE.Vector3(), hp = new THREE.Vector3();
/** turn a bone about its own pivot by angles in the villager's frame, whatever the bone's own axes: yaw about up, pitch
 * about the body's side axis (+ leans or looks down, - swings an arm forward), roll about its forward axis (+ tips toward
 * the body's left: + raises the left arm sideways, - the right) */
function turn(b: THREE.Object3D, yaw: number, pitch: number, roll: number, facing: number) {
  SIDE.set(Math.cos(facing), 0, -Math.sin(facing)); FWD.set(Math.sin(facing), 0, Math.cos(facing));
  _rq.setFromAxisAngle(UP, yaw).multiply(_a.setFromAxisAngle(SIDE, pitch)).multiply(_b.setFromAxisAngle(FWD, roll));
  b.parent!.getWorldQuaternion(_pq); _a.copy(_pq).invert().multiply(_rq).multiply(_pq); b.quaternion.premultiply(_a);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (x: number) => { const e = Math.max(0, Math.min(1, x)); return e * e * (3 - 2 * e); };
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Load whichever villagers have been built, place them at their posts; returns the per-frame update and talk helpers. */
/** shrine: where Pandit Shankar keeps his round before the Nataraja (statue.ts; a bare Spot4 is taken as his mat) */
export async function buildVillagers(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, t: Terrain, I: Island, low: boolean, on: Hooks | ((dist: number) => void),
  shrine?: Shrine | Spot4) {
  const hooks: Hooks = typeof on === 'function' ? { strike: on } : on;
  const live: Live[] = [], fixed = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const local = (s: { x: number; z: number; yaw: number }, [ax, az]: [number, number]) => { const c = Math.cos(s.yaw), sn = Math.sin(s.yaw); return { x: s.x + ax * c + az * sn, z: s.z - ax * sn + az * c }; };
  // the pandit's three places: his mat, the aarti spot, and before the lingam (0.55 m off it, on the aarti side, facing it)
  const sh = I.props.shrine[0], S4 = shrine && 'priestSpot' in shrine ? shrine : null;
  const priest: Spot4 = S4?.priestSpot ?? (shrine as Spot4 | undefined) ?? { ...local({ x: sh[0], z: sh[1], yaw: sh[2] }, [0, 2.3]), yaw: sh[2], y: I.islets[0].y + 0.75 };
  const aarti: Spot4 = S4?.aartiSpot ?? { x: priest.x + Math.sin(priest.yaw) * 1.2, z: priest.z + Math.cos(priest.yaw) * 1.2, yaw: priest.yaw, y: priest.y };
  const lingam = S4?.lingam ?? new THREE.Vector3(aarti.x + Math.sin(aarti.yaw) * 1.1, aarti.y + 0.45, aarti.z + Math.cos(aarti.yaw) * 1.1);
  const od = Math.hypot(aarti.x - lingam.x, aarti.z - lingam.z) || 1, ox = lingam.x + ((aarti.x - lingam.x) / od) * 0.55, oz = lingam.z + ((aarti.z - lingam.z) / od) * 0.55;
  const round: StopW[] = [{ x: priest.x, z: priest.z, y: priest.y, face: priest.yaw, do: 'sit', t: [16, 24] }, { x: aarti.x, z: aarti.z, y: aarti.y, face: aarti.yaw, do: 'aarti', t: [8, 11] },
    { x: ox, z: oz, y: aarti.y, face: Math.atan2(lingam.x - ox, lingam.z - oz), do: 'offer', once: true, t: [5.4, 5.8] }];
  await Promise.all(CAST.map(async (v, idx) => {
    const g = await loader.loadAsync(`/game/npc_${v.id}.glb`).catch(() => null); if (!g) return;
    const s = v.spot === 'shrine' ? priest : I.spots[v.spot];
    const { x, z } = v.spot === 'shrine' ? priest : local(s, v.at), y = v.spot === 'shrine' ? priest.y : t.heightAt(x, z);
    const root = g.scene; root.position.set(x, y, z); root.rotation.y = s.yaw; root.updateMatrixWorld(true);
    const ball = new THREE.Vector3(x, y + 0.95, z), inv = new THREE.Matrix4(), tool: THREE.Object3D[] = [], casters: THREE.Object3D[] = [], pj: Record<string, THREE.Object3D> = {};
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh; if (!m.isMesh) return;
      m.castShadow = !low; casters.push(m);
      const mat = m.material as THREE.MeshStandardMaterial;
      const strands = /short|long|bob|braid|ponytail|afro|eyebrow|eyelash|high-poly/i.test(mat.name);
      if (strands) { mat.alphaTest = 0.5; mat.transparent = false; mat.side = THREE.DoubleSide; mat.depthWrite = true; }   // hair cards are cut-outs, not shells
      if (v.hair && /short|long|bob|braid|ponytail|afro/i.test(mat.name)) mat.color.setHex(v.hair);
      if (v.skin && /\.body$/.test(mat.name)) mat.color.setHex(v.skin);              // a warm medium-brown for Pandit Shankar
      dress(mat, m.geometry);
      if (/^broom/.test(mat.name)) tool.push(m);
      if (/^pj_/.test(m.name)) { pj[m.name] = m; m.visible = false; m.castShadow = false; }   // the pandit's lamp, bell, lota... shown in their own clips
      // a fixed sphere round the whole figure, in this piece's own space, so villagers out of view are skipped
      // (each piece keeps its own skeleton: their skins' inverse bind matrices differ, so they can't share one)
      if (m.isSkinnedMesh) m.boundingSphere = new THREE.Sphere(ball.clone().applyMatrix4(inv.copy(m.matrixWorld).invert()), 1.8);
    });
    scene.add(root);
    const mixer = new THREE.AnimationMixer(root), clips = Object.fromEntries(g.animations.map((a) => [a.name, a]));
    const arm = /^(clavicle_r|upperarm_r|lowerarm_r|hand_r|[a-z]+_0\d_r)\./;
    if (v.id === 'daisuke' && clips.walk && clips.work)                              // on patrol the spear arm keeps its guard pose
      clips.walk = new THREE.AnimationClip('walk', clips.walk.duration, [...clips.walk.tracks.filter((q) => !arm.test(q.name)), ...clips.work.tracks.filter((q) => arm.test(q.name))]);
    const acts = Object.fromEntries(Object.entries(clips).map(([k, a]) => [k, mixer.clipAction(a)]));
    const bone = (n: string) => root.getObjectByName(n) ?? null, need = ['spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r'].map(bone);
    const eyes = ['eye_l', 'eye_r'].map(bone).filter((b): b is THREE.Object3D => !!b);
    const all = [...need, ...eyes] as THREE.Object3D[];
    const B: Bones | null = need.every(Boolean) ? { s1: need[0]!, s2: need[1]!, s3: need[2]!, neck: need[3]!, head: need[4]!, ua: [need[5]!, need[6]!], la: [need[7]!, need[8]!], eyes, eyeRest: eyes.map((e) => e.quaternion.clone()), all, clip: all.map((b) => b.quaternion.clone()) } : null;
    const pelvis = bone('pelvis'), hip = pelvis ? pelvis.getWorldPosition(new THREE.Vector3()).y - y : 0.9;
    const walker = !!v.route && !v.seated;
    const body = walker ? world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y, z)) : null;
    world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3).setTranslation(body ? 0 : x, (body ? 0 : y) + 0.86, body ? 0 : z), body ?? fixed);
    if (v.seated) { const st = seat(v.id, low); st.position.set(0, 0, -0.12); root.add(st); }   // something to sit on, under the hips
    if (v.id === 'shankar') { const st = seat(v.id, low); st.position.set(priest.x, priest.y, priest.z); st.rotation.y = priest.yaw; scene.add(st); }   // his mat stays put
    const headH = v.seated ? 1.15 : 1.55, stops = v.spot === 'shrine' ? round : (v.route ?? [{ at: v.at, face: 0, do: v.work, t: [9e9, 9e9] as [number, number] }]).map((q) => ({ ...q, ...local(s, q.at), face: s.yaw + q.face }));
    const n: Live = {
      v, s: DIALOGUE[v.id] ?? fallback(v), root, mixer, acts, cur: null, B, arm: v.overlay === 'hammer' ? [bone('upperarm_r')!, bone('lowerarm_r')!] : undefined, body, spot: s, hip, headH,
      x, y, z, yaw: s.yaw, home: s.yaw, anchor: new THREE.Vector3(x, y + headH + 0.35, z), headAt: new THREE.Vector3(x, y + headH, z), barkAt: new THREE.Vector3(x, y + headH + 0.45, z),
      stops, si: 0, mode: 'stay', T: rand(0.2, 1) * stops[0].t[1], onceT: 0, spd: 0, vary: rand(4, 9), held: false, resume: 0, force: null,
      look: { y: 0, p: 0, w: 0, ey: 0, ep: 0 }, glance: null, glanceT: rand(3, 8), g: null, idleT: rand(15, 40), sw: 0, away: true, reactT: -99, barkT: -99, barkGap: rand(45, 70), lastBark: -1,
      talkT: 0, heard: new Set(), acc: 0, k: idx, t: Math.random() * 3, sparkT: 0, cupT: 0, tool, casters: casters.filter((m) => m.castShadow), shade: !low,
      pj, flame: (pj.pj_flame as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial ?? null, bellK: -1,
    };
    task(n, stops[0]); live.push(n);
  }));

  // ---------------------------------------------------------------- props for the shared moments: sparks off the anvil, a cup of tea
  const N = 30, sparkPos = new Float32Array(N * 3), sparkVel = new Float32Array(N * 3), sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3)); sparkGeo.setDrawRange(0, 0);
  const sparkMat = new THREE.PointsMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(2), size: 0.045, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);   // always in the scene (drawn empty), so its shader compiles at the warm-up
  let sparkLife = 0;
  const burst = (p: THREE.Vector3) => {
    for (let i = 0; i < N; i++) { sparkPos.set([p.x, p.y, p.z], i * 3); sparkVel.set([rand(-1.3, 1.3), rand(1.2, 3.2), rand(-1.3, 1.3)], i * 3); }
    sparkLife = 0.75; sparkGeo.setDrawRange(0, N);
  };
  const cup = new THREE.Group(); cup.visible = false; scene.add(cup);
  { const clay = new THREE.MeshStandardMaterial({ color: 0x8d9a7a, roughness: 0.45 }), tea = new THREE.MeshStandardMaterial({ color: 0x6b7a2a, roughness: 0.2 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.029, 0.065, 14, 1, true), clay); c.position.y = 0.0325;
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.035, 14).rotateX(-Math.PI / 2), tea); top.position.y = 0.055;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 14), clay); foot.position.y = 0.003;
    (c.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide; cup.add(c, top, foot); }

  // the pandit's offering: marigolds left on the lingam (they stay), a thin pour of water from the lota while he tips it
  const marigolds = new THREE.Mesh(mergeBalls(lingam), new THREE.MeshStandardMaterial({ color: 0xf08c14, roughness: 0.8 })); marigolds.visible = false;
  const pour = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.011, 1, 6, 1, true).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0xbfe0f0, roughness: 0.05, transparent: true, opacity: 0.55 }));
  pour.visible = false; if (live.some((n) => n.v.id === 'shankar')) scene.add(marigolds, pour);

  // ---------------------------------------------------------------- what they do: clips, rounds, gestures, looks
  function play(n: Live, name: string, once = false, fade = 0.3) {
    const a = n.acts[name] ?? n.acts.idle; if (!a) return 0;
    if (a === n.cur && !once) return 0;
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
    if (a === n.cur) a.reset(); else { a.reset().setEffectiveTimeScale(1).fadeIn(fade).play(); n.cur?.fadeOut(fade); n.cur = a; }
    return a.getClip().duration;
  }
  /** the pandit on his mat sits through talk and greetings; everyone else stands */
  const onMat = (n: Live) => n.v.spot === 'shrine' && n.mode === 'stay' && n.stops[n.si].do === 'sit';
  const rest = (n: Live) => (onMat(n) ? 'sit' : 'idle');
  function task(n: Live, st: StopW) {
    n.onceT = 0;
    if (st.do === 'sit' || st.do === 'aarti') play(n, st.do, false, st.do === 'sit' ? 0.9 : 0.6);   // down onto the mat slowly
    else if (st.do === 'hammer' || st.do === 'sweep') play(n, 'idle');
    else if (st.once) n.onceT = play(n, st.do, true) - 0.3;                       // then idle until it's time to move on
    else play(n, st.do === 'idle' && Math.random() < 0.5 ? 'idle2' : st.do);
  }
  function gesture(n: Live, kind: Gesture, k = 1) {
    if (n.g || !n.B) return;
    if (n.acts.namaste && kind !== 'nod') {                                         // the pandit answers with a namaste, seated or standing
      if (n.onceT <= 0) n.onceT = play(n, onMat(n) ? 'sitnamaste' : 'namaste', true, 0.35) - 0.35;
      return;
    }
    if (kind === 'namaste') kind = 'bow';
    n.g = { kind, t: 0, dur: { nod: 1.0, bow: 1.8, wave: 2.0, stretch: 3.0 }[kind], k };
  }
  /** the layered motion, after the clip: head and eyes toward what they look at, then any gesture */
  function layer(n: Live, dt: number, target: THREE.Vector3 | null) {
    const B = n.B!, L = n.look, f = n.yaw;
    let wy = 0, wp = 0, ww = 0, ey = 0;
    if (target && n.g?.kind !== 'bow') {
      B.head.getWorldPosition(hp);
      const dx = target.x - hp.x, dy = target.y - hp.y, dz = target.z - hp.z, c = Math.cos(f), s = Math.sin(f), lx = dx * c - dz * s, lz = dx * s + dz * c, a = Math.atan2(lx, lz);
      if (Math.abs(a) < 2.1) { wy = THREE.MathUtils.clamp(a, -1.15, 1.15); ey = THREE.MathUtils.clamp(a, -1.5, 1.5); wp = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(lx, lz)), -0.45, 0.35); ww = 1; }
    } else if (n.glance && !n.g) { wy = ey = n.glance.y; wp = n.glance.p; ww = 1; }
    const k = 1 - Math.exp(-dt * 4.5), ke = 1 - Math.exp(-dt * 14);
    L.y += (wy - L.y) * k; L.p += (wp - L.p) * k; L.w += (ww - L.w) * (1 - Math.exp(-dt * 3)); L.ey += (ey - L.ey) * ke; L.ep += (wp - L.ep) * ke;
    B.eyes.forEach((e, i) => e.quaternion.copy(B.eyeRest[i]));
    if (L.w > 0.01) {
      const y = L.y * L.w, p = L.p * L.w;
      turn(B.neck, y * 0.4, -p * 0.4, 0, f); turn(B.head, y * 0.6, -p * 0.6, 0, f);
      const ry = THREE.MathUtils.clamp((L.ey - L.y) * L.w, -0.38, 0.38), rp = THREE.MathUtils.clamp((L.ep - L.p) * L.w, -0.2, 0.2);   // the eyes lead, the head catches up
      for (const e of B.eyes) turn(e, ry, -rp, 0, f);
    }
    const g = n.g; if (!g) return;
    g.t += dt; if (g.t >= g.dur) { n.g = null; return; }
    const e = ease(Math.min(g.t / 0.4, (g.dur - g.t) / 0.5)) * g.k, sit = n.v.seated ? 0.55 : 1;
    if (g.kind === 'nod') { const a = 0.2 * g.k * Math.abs(Math.sin(2 * Math.PI * g.t / g.dur)) * (1 - 0.4 * g.t / g.dur); turn(B.neck, 0, a * 0.45, 0, f); turn(B.head, 0, a * 0.55, 0, f); }
    else if (g.kind === 'bow') ([[B.s1, 0.24], [B.s2, 0.2], [B.s3, 0.14], [B.neck, 0.12], [B.head, 0.1]] as const).forEach(([b, a]) => turn(b, 0, a * e * sit, 0, f));
    else if (g.kind === 'wave') {
      const l = n.v.hand === 'l', s = l ? 1 : -1, ua = B.ua[l ? 0 : 1], la = B.la[l ? 0 : 1];
      turn(ua, 0, -0.45 * e, 0, f); turn(ua, 0, 0, s * 1.75 * e, f); turn(la, 0, 0, s * e * (1.0 + 0.32 * Math.sin(g.t * 14)), f);   // up beside the head, the forearm swinging
    } else {                                                                          // a seated stretch: both arms up, a lean back
      B.ua.forEach((ua, i) => { turn(ua, 0, -0.5 * e, 0, f); turn(ua, 0, 0, (i ? -2.5 : 2.5) * e, f); });
      turn(B.s3, 0, -0.18 * e, 0, f); turn(B.head, 0, -0.22 * e, 0, f);
    }
  }
  /** the pandit's things follow his clips: japa beads on the mat; plate, lamp and bell in the aarti (the bell rung on
   * each swing of the baked shake, every 0.25 s); lota and flowers in the offering, the flowers set down at 1.6 s and the
   * water running 2.75-3.9 s while the lota is tipped. The flame flickers (emissive only, no light). */
  const _w = new THREE.Vector3(), _v = new THREE.Vector3();
  function puja(n: Live, pd: number) {
    const c = n.cur, A = n.acts, at = c?.time ?? 0, P = n.pj, show = (k: string, on: boolean) => { if (P[k]) P[k].visible = on; };
    show('pj_japa', c === A.sit); for (const k of ['pj_plate', 'pj_flame', 'pj_bell']) show(k, c === A.aarti);
    show('pj_lota', c === A.offer); show('pj_flowers', c === A.offer && at < 1.6);
    n.flame!.emissiveIntensity = 2.4 + 0.6 * Math.sin(now * 23) + 0.4 * Math.sin(now * 37 + 1);
    if (c === A.aarti) { const k = Math.floor((at - 0.125) / 0.25); if (k !== n.bellK) { n.bellK = k; hooks.handbell?.(pd); } }
    if (c === A.offer && at > 1.6) marigolds.visible = true;
    const hand = n.root.getObjectByName('hand_r');
    pour.visible = c === A.offer && at > 2.75 && at < 3.9 && !!hand && pd < 40;
    if (pour.visible) {                                                             // from the lota's mouth, just ahead of the hand, down onto the lingam
      hand!.getWorldPosition(_w).add(_v.set(Math.sin(n.yaw) * 0.07, 0.02, Math.cos(n.yaw) * 0.07));
      _v.copy(lingam).sub(_w); pour.position.copy(_w); pour.scale.set(1, _v.length(), 1); pour.quaternion.setFromUnitVectors(DOWN, _v.normalize());
    }
  }
  const shout = (n: Live, text: string, key: string) => { hooks.bark?.(text, n.barkAt, n.v.pitch); hooks.line?.(n.v.id, key, text); };
  /** while a line is spoken: talking hands (either way round), sometimes an offering gesture or a nod */
  function speak(n: Live, text: string) {
    n.talkT = Math.min(7, Math.max(1.2, text.length * 0.055));
    if ((n.force && !n.force.there) || n.onceT > 0) return;                     // still walking over, or handing something across
    if (onMat(n)) { if (Math.random() < 0.35) gesture(n, 'nod', 0.6); return; }   // talks from his mat, beads still in hand
    if (!n.v.seated && Math.random() < 0.22 && phase === 'topic') n.onceT = play(n, 'give', true) - 0.3;
    else play(n, Math.random() < 0.5 ? 'talk' : 'talk2');
    if (Math.random() < 0.35) gesture(n, 'nod', 0.6);
  }

  // ---------------------------------------------------------------- conversations: a greeting, topic choices, goodbye
  let talking: Live | null = null, phase: 'greet' | 'topic' | 'moment' | 'bye' = 'greet', topic = 0, line = 0, pick = 0, now = 0, frame = 0, lastCall = -99;
  const menu = (n: Live): Choice[] => [
    ...n.s.topics.map((q) => ({ label: q.ask, done: n.heard.has(q.id) })),
    ...(n.s.moment ? [{ label: n.s.moment.label, done: n.heard.has('moment') }] : []), { label: 'Goodbye', bye: true },
  ];
  const view = (): Talk | null => {
    const n = talking; if (!n) return null;
    const v = n.v, s = n.s, m = menu(n), first = m.findIndex((c) => !c.done && !c.bye), hot = first < 0 ? m.length - 1 : first;   // E: the next unheard topic, then Goodbye
    let text = '', link: string | undefined, cta: string | undefined, choices: Choice[] | undefined = m;
    if (phase === 'greet') text = s.greet[pick];
    else if (phase === 'bye') { text = s.bye[pick]; choices = undefined; }
    else {
      const tp = phase === 'topic' ? s.topics[topic] : null, lines = tp ? tp.lines : s.moment!.lines, end = line >= lines.length - 1;
      text = lines[line]; if (!end) choices = undefined;
      else { const lc = tp ?? MOMENT[v.id]; link = lc?.link; cta = lc?.cta; }
    }
    return { id: v.id, name: v.name, role: v.role, seal: v.seal, line: text, last: phase === 'bye', link, cta, choices, hot: choices ? hot : undefined, index: 0, total: phase === 'bye' ? 1 : 2 };
  };
  const show = (key: string) => { const t = view(); if (t && talking) { hooks.line?.(talking.v.id, key, t.line); speak(talking, t.line); } return t; };
  /** the ronin's and the villager's parts in a shared moment, one step per line */
  function moment(n: Live, step: number) {
    const m = MOMENT[n.v.id], s = n.spot, id = n.v.id; if (!m) return;
    if (m.kind === 'anvil') {
      if (step === 0) {
        const p = local(s, [0.8, 0.75]); hooks.moment?.({ id, step, at: new THREE.Vector3(p.x, t.heightAt(p.x, p.z) + 0.05, p.z), face: s.yaw + Math.PI, act: true });
        n.force = { ...local(s, [1.75, -0.55]), face: s.yaw - 1.22, do: 'idle', t: [0, 0] };   // steps aside to watch
      } else hooks.moment?.({ id, step, act: true });
      n.sparkT = 0.62;                                                               // the hammer lands
    } else if (m.kind === 'tea') {
      if (step) return;
      const p = local(s, [0, 4.0]); hooks.moment?.({ id, step, at: new THREE.Vector3(p.x, t.heightAt(s.x, s.z) + 0.2, p.z), face: s.yaw, sit: true });
      n.force = { ...local(s, [0.85, 4.75]), face: s.yaw + Math.atan2(-0.85, -0.75), do: 'idle', t: [0, 0], then: () => { n.onceT = play(n, 'give', true) - 0.3; n.cupT = 0.9; } };
    } else if (step === 0) { n.onceT = play(n, 'give', true) - 0.3; hooks.moment?.({ id, step, act: true }); }
  }
  const end = () => {
    const n = talking; talking = null; if (!n) return;
    n.resume = 2.5; if (n.force) { n.force = null; if (n.v.route) n.mode = 'go'; }   // then back to the round
  };

  const api = {
    count: live.length,
    /** nearest villager within talking distance */
    near(p: THREE.Vector3) {
      let best: Live | null = null, bd = 3.2;
      for (const n of live) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd && Math.abs(n.y - p.y) < 2.5) { bd = d; best = n; } }
      return best ? { name: best.v.name, id: best.v.id, pos: best.root.position, head: best.headH } : null;
    },
    start(id: string): Talk | null {
      talking = live.find((n) => n.v.id === id) ?? null; if (!talking) return null;
      phase = 'greet'; line = 0; pick = Math.floor(Math.random() * talking.s.greet.length);
      return show(`greet${pick}`);
    },
    /** E / Next / a tap: the next line, or the highlighted choice when choices are showing; null when it's over */
    next(): Talk | null {
      if (!talking) return null;
      if (phase === 'bye') { end(); return null; }
      const t = view()!; if (t.choices) return api.choose(t.hot ?? 0);
      line++; if (phase === 'moment') moment(talking, line);
      return show(phase === 'topic' ? `topic-${talking.s.topics[topic].id}-${line}` : `moment${line}`);
    },
    /** pick choice i (a topic, the shared moment, or Goodbye) */
    choose(i: number): Talk | null {
      const n = talking; if (!n) return null;
      const m = menu(n), c = m[i]; if (!c) return view();
      line = 0;
      if (c.bye) { phase = 'bye'; pick = Math.floor(Math.random() * n.s.bye.length); gesture(n, n.v.greet.includes('namaste') ? 'namaste' : n.v.greet.includes('bow') ? 'bow' : 'nod', 0.7); return show(`bye${pick}`); }
      if (n.s.moment && i === n.s.topics.length) { phase = 'moment'; n.heard.add('moment'); moment(n, 0); return show('moment0'); }
      phase = 'topic'; topic = i; n.heard.add(n.s.topics[i].id);
      return show(`topic-${n.s.topics[i].id}-0`);
    },
    stop() { end(); },
    current: (): Talk | null => view(),
    pitch: () => talking?.v.pitch ?? 1,
    /** the villager you're talking to, live (the camera frames this) */
    speakerAt: () => talking?.headAt ?? null,
    /** if you wave or bow at someone nearby, they answer in kind */
    greet(kind: 'wave' | 'bow', p: THREE.Vector3) {
      let best: Live | null = null, bd = 7;
      for (const n of live) { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd && n !== talking) { bd = d; best = n; } }
      if (!best) return null;
      const bow = kind === 'bow' && !!best.s.react.bow;
      gesture(best, best.v.greet.includes('namaste') ? 'namaste' : bow ? 'bow' : best.v.greet.includes('wave') ? 'wave' : 'nod'); best.reactT = now;
      shout(best, bow ? best.s.react.bow! : best.s.react.wave, bow ? 'react-bow' : 'react-wave');
      return best.v.id;
    },
    /** where everyone is: x/y/z where they stand now; anchor (over the head, for the E prompt) and headAt follow them */
    list: () => live.map((n) => ({ id: n.v.id, x: n.x, y: n.y, z: n.z, yaw: n.home, head: n.headH, anchor: n.anchor, headAt: n.headAt })),
    /** per frame. quiet: on the boat or with a sheet open (no calls, nobody stops for you) */
    update(dt: number, player: THREE.Vector3, quiet = false) {
      now += dt; frame++; you.set(player.x, player.y + 1.5, player.z);
      for (const n of live) {
        const dx = player.x - n.x, dz = player.z - n.z, pd = Math.hypot(dx, dz), level = Math.abs(player.y - n.y) < 2.5;
        // only villagers near you cast shadows (each one is a skinned figure drawn again into the shadow map)
        if (!low && (pd < 20) !== n.shade) { n.shade = pd < 20; n.casters.forEach((m) => (m.castShadow = n.shade)); }
        const busy = n === talking, held = busy || (!quiet && pd < 2.6 && level), toYou = Math.atan2(dx, dz);   // held: stops and turns to you
        if (held !== n.held) { n.held = held; if (!held) n.resume = Math.max(n.resume, 1.2); }
        if (n.onceT > 0 && (n.onceT -= dt) <= 0) play(n, onMat(n) ? 'sit' : busy && n.talkT > 0 ? 'talk' : 'idle', false, onMat(n) ? 0.5 : 0.3);   // a one-off clip ran out
        let walking = false;
        if (n.v.route) {
          const f = n.force, st = n.stops[n.si];
          if (!held && n.resume > 0 && (n.resume -= dt) <= 0 && n.mode === 'stay' && !f) task(n, st);   // back to work
          const g = f ? (f.there ? null : f) : n.mode === 'go' && !held && n.resume <= 0 ? st : null;
          if (g) {
            const gx = g.x - n.x, gz = g.z - n.z, dist = Math.hypot(gx, gz);
            if (dist < 0.04) {                                                       // arrived
              n.spd = 0;
              if (f) { f.there = true; play(n, 'idle'); f.then?.(); }
              else { n.mode = 'stay'; n.T = rand(st.t[0], st.t[1]); task(n, st); }
            } else {
              walking = true; const err = wrap(Math.atan2(gx, gz) - n.yaw);
              if (n.spd < 0.08 && Math.abs(err) > 0.7) { n.yaw += Math.sign(err) * Math.min(Math.abs(err), 2.4 * dt); play(n, 'idle'); }   // turn on the spot first
              else {
                const cruise = WALK * n.hip * (g.via === 'sweep' ? 0.4 : 0.85);              // sweeping as she goes: a slow step
                n.yaw += err * Math.min(1, dt * 6);
                n.spd += THREE.MathUtils.clamp(Math.min(cruise * (Math.abs(err) > 0.5 ? 0.5 : 1), Math.sqrt(1.8 * dist)) - n.spd, -2 * dt, 1.2 * dt);   // ease in, ease out on arrival
                const step = Math.min(dist, n.spd * dt); n.x += (gx / dist) * step; n.z += (gz / dist) * step;
                play(n, 'walk'); if (n.cur) n.cur.timeScale = Math.max(0.2, n.spd / (WALK * n.hip));   // the feet keep pace with the ground
              }
            }
          } else if (n.mode === 'go' && n.spd > 0) { n.spd = 0; play(n, 'idle'); }     // stopped mid-walk for you
          if (!walking) {                                                            // standing: face the work, the moment, or you
            const sat = onMat(n);                                                    // (on his mat: only a half turn toward you)
            n.yaw += wrap((f ? f.face : held ? (sat ? st.face + THREE.MathUtils.clamp(wrap(toYou - st.face), -0.45, 0.45) : toYou) : n.mode === 'stay' ? st.face : n.yaw) - n.yaw) * Math.min(1, dt * 3);
            if (n.mode === 'stay' && !f && !held && n.resume <= 0) {
              if (st.do === 'idle' && n.onceT <= 0 && (n.vary -= dt) <= 0) { n.vary = rand(5, 10); play(n, n.cur === n.acts.idle ? 'idle2' : 'idle'); }   // shifts its weight now and then
              if ((n.T -= dt) <= 0) {
                if (sat) { play(n, 'idle', false, 0.9); n.resume = 1.0; }            // up off the mat before walking
                n.si = (n.si + 1) % n.stops.length; n.mode = 'go';
              }
            } else if (held && !busy && n.onceT <= 0 && !sat && n.cur !== n.acts.idle && n.cur !== n.acts.idle2) play(n, 'idle');
          }
        } else {                                                                       // seated: a half turn toward you, no more
          const want = held || (pd < 5 && level && !quiet) ? n.home + THREE.MathUtils.clamp(wrap(toYou - n.home), -0.45, 0.45) : n.home;
          n.yaw += wrap(want - n.yaw) * Math.min(1, dt * 2);
          if (!busy) {
            play(n, n.v.work);
            if ((n.idleT -= dt) <= 0) { n.idleT = rand(25, 45); if (pd > 5) gesture(n, 'stretch'); }   // a stretch now and then
          }
        }
        if (busy) {                                                                    // in conversation: talk while speaking, listen after
          if (n.talkT > 0 && (n.talkT -= dt) <= 0 && n.onceT <= 0 && !walking) play(n, rest(n));
          if (n.cupT > 0 && (n.cupT -= dt) <= 0) { const T = n.spot, p = local(T, [0.42, 3.8]); cup.position.set(p.x, t.heightAt(T.x, T.z) - 0.05 + 0.64, p.z); cup.visible = true; }   // on the deck
          if (n.sparkT > 0 && (n.sparkT -= dt) <= 0) { const p = local(n.spot, [0.8, -0.2]); burst(hp.set(p.x, t.heightAt(n.spot.x, n.spot.z) - 0.05 + 0.82, p.z)); hooks.strike(0); }   // off the anvil top
        }
        if (walking) { n.y = n.v.spot === 'shrine' ? n.y + ((n.stops[n.si].y ?? n.y) - n.y) * Math.min(1, dt * 3) : t.heightAt(n.x, n.z); n.body?.setNextKinematicTranslation({ x: n.x, y: n.y, z: n.z }); }   // (the islet is off the terrain)
        n.root.position.set(n.x, n.y, n.z); n.root.rotation.y = n.yaw;
        if (n.v.spot === 'shrine') n.headH += ((onMat(n) && !walking ? 0.95 : 1.55) - n.headH) * Math.min(1, dt * 2);   // seated or standing
        n.headAt.set(n.x, n.y + n.headH, n.z); n.anchor.set(n.x, n.y + n.headH + 0.35, n.z); n.barkAt.set(n.x, n.y + n.headH + 0.45, n.z);
        // they notice you: a nod, wave or bow and one of their calls as you come by; another now and then if you linger
        if (!quiet && !talking && level) {
          if (pd > 11) n.away = true;
          else if (pd < 7 && n.away && now - n.reactT > 40 && now - lastCall > 6) {
            n.away = false; n.reactT = now; lastCall = now;
            gesture(n, n.mode === 'go' ? 'nod' : n.v.greet[Math.floor(Math.random() * n.v.greet.length)]);
            const i = (n.lastBark = (n.lastBark + 1 + Math.floor(Math.random() * (n.s.barks.length - 1))) % n.s.barks.length); shout(n, n.s.barks[i], `bark${i}`);
          } else if (pd < 9 && pd > 3 && now - n.reactT > 50 && now - n.barkT > n.barkGap && now - lastCall > 10) {
            n.barkT = now; n.barkGap = rand(45, 70); lastCall = now;
            const i = (n.lastBark = (n.lastBark + 1 + Math.floor(Math.random() * (n.s.barks.length - 1))) % n.s.barks.length); shout(n, n.s.barks[i], `bark${i}`);
          }
        }
        // glances about when nobody is near
        if ((n.glanceT -= dt) <= 0) { n.glance = !n.glance && pd > 8 && Math.random() < 0.6 ? { y: rand(-0.9, 0.9), p: rand(-0.15, 0.12) } : null; n.glanceT = n.glance ? rand(1.5, 3) : rand(4, 9); }
        // the broom: a stroke across the ground at a sweeping stop, or on the slow walk between them
        const sweeping = !held && !n.force && n.resume <= 0 && (n.mode === 'stay' ? n.stops[n.si].do === 'sweep' : walking && n.stops[n.si].via === 'sweep');
        n.sw += ((sweeping ? 1 : 0) - n.sw) * Math.min(1, dt * 3);
        if (n.tool.length && n.tool[0].visible === !!n.force) n.tool.forEach((o) => (o.visible = !n.force));   // the broom is set down to pour the tea
        if (n.flame) puja(n, pd);
        // the hammer keeps time even unseen (you hear it across the village)
        let swing = -1;
        if (n.arm) {
          const hammering = n.mode === 'stay' && !held && !n.force && n.stops[n.si].do === 'hammer' && n.resume <= 0;   // (the player's own strikes come from the moment)
          if (hammering) { const prev = n.t % 1.3; n.t += dt; const ph = n.t % 1.3; swing = ph < 0.9 ? Math.sin((ph / 0.9) * Math.PI * 0.5) : 1 - (ph - 0.9) / 0.4; if (prev < 1.2 && ph >= 1.2) hooks.strike(pd); }
        }
        // animation: every frame up close, less often further away; the layered look and gestures only up close
        const every = pd < 16 ? 1 : pd < 30 ? 2 : pd < 60 ? 4 : 8; n.acc += dt;
        if ((frame + n.k) % every) continue;
        // the mixer only writes a bone when its clip value changes, so first put back what the clip last set (else the
        // layered turns below would pile up on still stretches of a clip), then remember the new clip pose
        if (n.B) n.B.all.forEach((b, i) => b.quaternion.copy(n.B!.clip[i]));
        n.mixer.update(n.acc);
        if (n.B) n.B.all.forEach((b, i) => n.B!.clip[i].copy(b.quaternion));
        if (swing >= 0) { n.arm![0].quaternion.multiply(_rq.setFromAxisAngle(X, -1.1 * swing)); n.arm![1].quaternion.multiply(_rq.setFromAxisAngle(X, -0.9 * swing)); }   // a hammer swing laid over the idle
        if (n.sw > 0.01 && n.B) {                                                       // the broom hangs from her right hand: turning the arm about
          n.t += every * dt; const a = Math.sin(n.t * 4.2);                              // the upright strokes its head side to side, still on the ground
          turn(n.B.s2, 0.1 * a * n.sw, 0.14 * n.sw, 0, n.yaw); turn(n.B.ua[1], 0.38 * a * n.sw, -0.15 * n.sw, 0, n.yaw);
        }
        if (n.B && pd < 16) layer(n, n.acc, busy || (pd < 8 && level && !quiet) ? you : null);
        n.acc = 0;
      }
      if (sparkLife > 0) {                                                            // sparks fly up and fall, then go dark
        sparkLife -= dt; for (let i = 0; i < N * 3; i += 3) { sparkVel[i + 1] -= 9.8 * dt; sparkPos[i] += sparkVel[i] * dt; sparkPos[i + 1] += sparkVel[i + 1] * dt; sparkPos[i + 2] += sparkVel[i + 2] * dt; }
        sparkGeo.attributes.position.needsUpdate = true; sparkMat.opacity = Math.min(1, sparkLife / 0.4); if (sparkLife <= 0) sparkGeo.setDrawRange(0, 0);
      }
      if (cup.visible && !talking && Math.hypot(player.x - cup.position.x, player.z - cup.position.z) > 6) cup.visible = false;   // cleared away once you leave
    },
  };
  return api;
}
const X = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0), you = new THREE.Vector3();

/** a ring of marigold heads round the lingam's top (one merged mesh) */
function mergeBalls(c: THREE.Vector3) {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; parts.push(new THREE.IcosahedronGeometry(0.028, 1).scale(1, 0.75, 1).translate(c.x + Math.cos(a) * 0.075, c.y - 0.035, c.z + Math.sin(a) * 0.075)); }
  parts.push(new THREE.IcosahedronGeometry(0.03, 1).scale(1, 0.7, 1).translate(c.x, c.y + 0.012, c.z));
  return mergeGeometries(parts)!;
}

/** a villager whose lines haven't been written yet still says something */
function fallback(v: Villager): Script {
  return { id: v.id, voice: { kokoro: '', speed: 1, note: '' }, humour: '', greet: [v.bark], topics: [{ id: 'about', ask: 'Tell me about yourself', lines: [v.summary], link: v.link, cta: v.cta }],
    bye: ['Safe travels.'], barks: [v.bark], react: { wave: v.bark } };
}
