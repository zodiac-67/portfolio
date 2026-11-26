import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergePrefab } from './prefab';
import type { Island } from './island';
import { granite, type buildStatue } from './statue';

type Shrine = Awaited<ReturnType<typeof buildStatue>>;
const Y = new THREE.Vector3(0, 1, 0);
const STEPS = [[4.6, 3.3, 0.5], [4.0, 2.8, 0.5], [3.4, 2.3, 0.5], [3.0, 1.9, 0.45]];   // statue_build.py: the pedestal's courses (w, d, h)
const GH_TOP = 2.75;                                                             // statue_build.py: the gateway lintel's underside
const FLAME = new THREE.Vector3(0.082, 0.062, 0);                                // shrine_build.py DIYA_FLAME (glTF axes)
/** the placeholder materials of shrine.glb -> [batch, colour] (stone: granite tinted per vertex; cloth, wood, flowers: matte; metal) */
const MATS: Record<string, ['stone' | 'matte' | 'metal' | 'leaf', number]> = {
  M_Granite: ['stone', 0x8a867f], M_GraniteDark: ['stone', 0x5e5a55], M_Brass: ['metal', 0xb8903f], M_Iron: ['metal', 0x3a3a3d],
  M_Bark: ['matte', 0x8d877c], M_ThreadR: ['matte', 0xb3221b], M_ThreadY: ['matte', 0xe8b51c], M_Marigold: ['matte', 0xf08a12], M_MarigoldY: ['matte', 0xf7b41c],
  M_Plaster: ['matte', 0xece4d4], M_Kumkum: ['matte', 0xb0301e], M_Ochre: ['matte', 0xd0922f], M_Soil: ['matte', 0x4a3626], M_Tulsi: ['matte', 0x3f5f27],
  M_TulsiFlower: ['matte', 0x7d4f86], M_Wood: ['matte', 0x6b4a2e], M_Leather: ['matte', 0xd9c7a0], M_Cloth: ['matte', 0xe56a12], M_Wick: ['matte', 0xf0e6d0], M_Leaf: ['leaf', 0x4f7a2e],
};
const LUNGTA = [0x2a5db0, 0xf2efe6, 0xc8302a, 0x2e8a4a, 0xf0c419];                // the five prayer-flag colours, in their order: blue, white, red, green, yellow

/** many small pieces gathered into one draw call: positions, normals, a colour and (for the granite) each piece's height above the grass */
class Batch {
  pos: number[] = []; nor: number[] = []; col: number[] = []; h: number[] = []; uv: number[] = [];
  constructor(private withUv = false) {}
  private v = new THREE.Vector3(); private n = new THREE.Vector3(); private nm = new THREE.Matrix3(); private c = new THREE.Color();
  /** geo placed by m, in colour hex; its height above the grass is its own y (a prefab's origin is on the ground) or h */
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, hex: number, h?: number) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
    this.nm.getNormalMatrix(m); this.c.setHex(hex);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i); this.h.push(h ?? this.v.y); this.v.applyMatrix4(m); this.pos.push(this.v.x, this.v.y, this.v.z);
      this.n.fromBufferAttribute(nr, i).applyMatrix3(this.nm).normalize(); this.nor.push(this.n.x, this.n.y, this.n.z);
      this.col.push(this.c.r, this.c.g, this.c.b); if (this.withUv) this.uv.push(uv.getX(i), uv.getY(i));
    }
  }
  mesh(mat: THREE.Material, shadow: boolean) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aH', new THREE.Float32BufferAttribute(this.h, 1));
    if (this.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    const mesh = new THREE.Mesh(g, mat); mesh.castShadow = shadow; mesh.receiveShadow = true; return mesh;
  }
}

/** The islet round the Nataraja made a living shrine (statue.ts places the image, the lingam and the bell): a stone Nandi on his
 * plinth facing the image, a trident with its damaru, little brass lamps burning on the pedestal's steps, marigold garlands on the
 * pedestal and the bell gateway, a peepal with sacred threads and a bench under it, a tulsi in its raised pot, a flagstone path in
 * from the rope bridge with flowers along it, and strings of Nepali prayer flags fluttering between poles, the gateway and the tree.
 * Everything is placed on the islet's dome; the reserved ground (the pandit's mat, the aarti spot, the lingam, the gateway) stays clear.
 * Six draw calls: granite, matte things, metal, leaves (swaying), flags (instanced, fluttering), lamp flames (instanced). */
export async function buildShrineDecor(scene: THREE.Scene, world: RAPIER.World, loader: GLTFLoader, I: Island, low: boolean, shrine: Shrine) {
  const g = await loader.loadAsync('/game/shrine.glb');
  const isl = I.islets[0], [sx, sz] = I.props.shrine[0], yaw = shrine.yaw, O = new THREE.Vector3(isl.x, isl.y, isl.z);
  const top = (x: number, z: number) => isl.y + 0.8 * (1 - Math.min(1, Math.hypot(x - isl.x, z - isl.z) / isl.r) ** 2);   // statue.ts: the islet's dome
  const cs = Math.cos(yaw), sn = Math.sin(yaw);
  /** statue-local (x to its side, z out in front) -> islet space (everything below lives in a group at the islet's centre) */
  const L = (x: number, z: number, up = 0) => { const wx = sx + x * cs + z * sn, wz = sz - x * sn + z * cs; return new THREE.Vector3(wx - O.x, top(wx, wz) - O.y + up, wz - O.z); };
  const gate = (x: number, y: number, z: number) => { const c = Math.cos(shrine.gate.yaw), s = Math.sin(shrine.gate.yaw); return new THREE.Vector3(shrine.gate.x + x * c + z * s - O.x, shrine.gate.y + y - O.y, shrine.gate.z - x * s + z * c - O.z); };
  const ped = (x: number, y: number, z: number) => new THREE.Vector3(sx + x * cs + z * sn - O.x, shrine.statue.y + y - O.y, sz - x * sn + z * cs - O.z);
  const root = new THREE.Group(); root.position.copy(O); scene.add(root);
  const B = { stone: new Batch(), matte: new Batch(), metal: new Batch(), leaf: new Batch(true) }, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const box = (c: THREE.Vector3, hx: number, hy: number, hz: number, ry: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(c.x + O.x, c.y + O.y, c.z + O.z).setRotation(q.setFromAxisAngle(Y, ry)), body);

  /** a prefab from shrine.glb at statue-local (x, z), turned to face `face` (statue-local point) or by a yaw offset from the image's */
  const prefabs: Record<string, ReturnType<typeof mergePrefab>> = {};
  const place = (name: string, x: number, z: number, face: [number, number] | number, sink = 0.03) => {
    const P = (prefabs[name] ??= mergePrefab(g.scene.getObjectByName(name)!)), at = L(x, z, -sink);
    const ry = typeof face === 'number' ? yaw + face : yaw + Math.atan2(face[0] - x, face[1] - z);
    m4.compose(at, q.setFromAxisAngle(Y, ry), one);
    for (const [mat, gs] of Object.entries(P.groups)) { const [b, hex] = MATS[mat] ?? ['matte', 0x888888]; for (const geo of gs) B[b].add(geo, m4, hex); }
    for (const bx of P.boxes) {
      const c = bx.getCenter(new THREE.Vector3()).applyQuaternion(q.setFromAxisAngle(Y, ry)).add(at), s = bx.getSize(new THREE.Vector3()).multiplyScalar(0.5);
      box(c, s.x, s.y, s.z, ry);
    }
    return { at, ry };
  };

  // ---- the furnishings (statue-local metres: the image at 0,0 facing +z; the rope bridge lands at about 0.3, 10.7)
  place('nandi', 0.3, 7.3, Math.PI, 0.06);                                       // on the axis, looking at the image
  place('trishul', -3.0, 0.9, [0, 3]);                                           // planted beside the pedestal
  const tree = place('peepal', -5.4, 4.4, 0.6, 0.12);
  place('bench', -4.3, 6.4, [0.5, 3.5]);                                         // in its shade, looking at the shrine
  place('tulsi', -2.4, 8.4, [1.5, 8.6]);                                         // its niche turned to the path

  // ---- brass lamps on the pedestal's treads: along the front of the bottom two steps and down the bottom one's sides
  const lamps: [number, number, number, number][] = [];                          // x, y (above the statue's base), z, yaw
  const tread = (k: number) => [(STEPS[k][1] + STEPS[k + 1][1]) / 4, STEPS.slice(0, k + 1).reduce((a, s) => a + s[2], 0)] as const;
  { const [z0, y0] = tread(0); for (let i = 0; i < 9; i++) lamps.push([-1.8 + i * 0.45, y0, z0, 0]); for (const s of [-1, 1]) for (const z of [-1, 0, 1]) lamps.push([s * (STEPS[0][0] + STEPS[1][0]) / 4, y0, z * 1.0, s * Math.PI / 2]); }
  { const [z1, y1] = tread(1); for (let i = 0; i < 5; i++) lamps.push([-1.6 + i * 0.8, y1, z1, 0]); }
  const diya = mergePrefab(g.scene.getObjectByName('diya')!), flames: THREE.Vector3[] = [];
  for (const [x, y, z, ry] of lamps) {
    m4.compose(ped(x, y, z), q.setFromAxisAngle(Y, yaw + ry - Math.PI / 2), one);   // the spout (+x) out towards the visitor
    for (const [mat, gs] of Object.entries(diya.groups)) for (const geo of gs) B[MATS[mat]?.[0] ?? 'matte'].add(geo, m4, MATS[mat]?.[1] ?? 0xffffff);
    flames.push(FLAME.clone().applyMatrix4(m4));
  }

  // ---- marigold garlands: strings of faceted flower heads, orange and yellow
  const bead = new THREE.IcosahedronGeometry(1, 0), e = new THREE.Euler(); let k = 0;
  const garland = (pts: THREE.Vector3[], r = 0.032) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.round(a.distanceTo(b) / (r * 1.7)));
      for (let j = 0; j < n; j++, k++) {
        m4.compose(a.clone().lerp(b, j / n), q.setFromEuler(e.set(k * 1.7, k * 2.3, 0)), new THREE.Vector3(r, r * 0.8, r).multiplyScalar(0.9 + 0.2 * ((k * 0.618) % 1)));
        B.matte.add(bead, m4, k % 2 ? 0xf7b41c : 0xf08a12);
      }
    }
  };
  const swag = (a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return a.clone().lerp(b, t).addScaledVector(Y, -sag * 4 * t * (1 - t)); });
  // the pedestal's top course: three scallops across its front and a drop at each front corner
  { const [w, d, h] = STEPS[3], y = STEPS.slice(0, 3).reduce((a, s) => a + s[2], 0) + h - 0.04, z = d / 2 + 0.035;
    for (let i = 0; i < 3; i++) garland(swag(ped(-w / 2 + (i * w) / 3, y, z), ped(-w / 2 + ((i + 1) * w) / 3, y, z), 0.24));
    for (const s of [-1, 1]) garland(swag(ped(s * (w / 2 + 0.02), y, z), ped(s * (w / 2 + 0.02), y - 0.32, z), 0, 4));
  }
  // the bell gateway: scallops on the lintel's face that never dip below its underside (the bell and the ringer's arm need the
  // middle clear), and a strand down the front of each pillar
  { const zf = 0.16 + 0.035, yl = GH_TOP + 0.22;
    for (const [a, b] of [[-1.0, -0.33], [-0.33, 0.33], [0.33, 1.0]]) garland(swag(gate(a, yl, zf), gate(b, yl, zf), 0.15, 8), 0.03);
    for (const s of [-1, 1]) garland(swag(gate(s * 0.75, GH_TOP - 0.23, 0.11 + 0.035), gate(s * 0.75, 1.75, 0.11 + 0.035), 0, 10), 0.03);
  }

  // ---- the flagstone path from the bridge's end round the Nandi to the shrine, flowers along its edges
  const land = [...I.bridges].sort((a, b) => Math.hypot(a.b[0] - isl.x, a.b[2] - isl.z) - Math.hypot(b.b[0] - isl.x, b.b[2] - isl.z))[0]?.b;
  const lz = land ? (land[0] - sx) * sn + (land[2] - sz) * cs : 10.7, lx = land ? (land[0] - sx) * cs - (land[2] - sz) * sn : 0.3;
  const route = new THREE.CatmullRomCurve3([[lx, lz - 0.3], [lx + 0.6, lz - 1.6], [1.75, 7.6], [1.8, 6.0], [1.2, 5.0], [0.3, 4.7]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  let seed = 3; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const flag = new THREE.Vector3(), tan = new THREE.Vector3(), slab: number[] = [];
  const stone = (cx: number, cz: number, rad: number, hex: number) => {          // an irregular slab that follows the dome
    const n = 7, ring: THREE.Vector3[] = [], c = L(cx, cz, 0.02), base = rnd() * 6.28;
    for (let i = 0; i < n; i++) { const a = base + (i / n) * 6.2832, r = rad * (0.78 + 0.3 * rnd()); ring.push(L(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 0.02)); }
    const tri = (a: THREE.Vector3, b: THREE.Vector3, d: THREE.Vector3) => slab.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n], a2 = a.clone().setY(a.y - 0.08), b2 = b.clone().setY(b.y - 0.08);
      tri(c, b, a); tri(a, b, b2); tri(a, b2, a2);
    }
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(slab.splice(0), 3)); geo.computeVertexNormals();
    B.stone.add(geo, new THREE.Matrix4(), hex, 0.12);
  };
  const flower = (p: THREE.Vector3, hex: number) => {
    for (let i = 0; i < 3; i++) {
      const h = 0.1 + rnd() * 0.12, r = 0.03 + rnd() * 0.015, a = rnd() * 6.28;
      m4.compose(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.07, h, Math.sin(a) * 0.07)), q.identity(), new THREE.Vector3(r, r * 0.7, r));
      B.matte.add(bead, m4, i === 2 && hex === 0xf08a12 ? 0xf7b41c : hex);
      m4.compose(p.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, h * 0.5, Math.sin(a) * 0.05)), q.setFromEuler(e.set(0, a, 0.5)), new THREE.Vector3(0.012, h * 0.55, 0.012));
      B.matte.add(stem, m4, 0x4b6b2a);
    }
  };
  const stem = new THREE.CylinderGeometry(1, 1, 1, 3, 1, true);
  const len = route.getLength(), steps = Math.floor(len / 0.5);
  for (let i = 0; i <= steps; i++) {
    const u = i / steps; route.getPointAt(u, flag); route.getTangentAt(u, tan); const nx = -tan.z, nz = tan.x;
    for (const s of [-1, 1]) stone(flag.x + nx * s * 0.3 + (rnd() - 0.5) * 0.08 + tan.x * (s * 0.12), flag.z + nz * s * 0.3 + (rnd() - 0.5) * 0.08 + tan.z * (s * 0.12), 0.25, [0x8f8a82, 0x7f7a73, 0x99938a][i % 3]);
    if (i % 2 === 0 && (!low || i % 4 === 0)) for (const s of [-1, 1]) {
      const ex = flag.x + nx * s * (0.85 + rnd() * 0.25), ez = flag.z + nz * s * (0.85 + rnd() * 0.25);
      if (Math.hypot(ex - 0.3, ez - 7.3) < 1.3) continue;                        // not under the Nandi's plinth
      flower(L(ex, ez), [0xf08a12, 0xf08a12, 0xe8e2d6, 0xd9467a][Math.floor(rnd() * 4)]);
    }
  }

  // ---- prayer-flag poles and the strings between them, the gateway and the peepal
  const pole = (x: number, z: number, h: number) => {
    const p = L(x, z);
    m4.compose(p.clone().add(new THREE.Vector3(0, 0.07, 0)), q.identity(), one); B.stone.add(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 8), m4, 0x8a867f, 0.05);
    m4.compose(p.clone().add(new THREE.Vector3(0, h / 2, 0)), q.identity(), one); B.matte.add(new THREE.CylinderGeometry(0.035, 0.05, h, 6, 1, true), m4, 0x6b4a2e);
    m4.compose(p.clone().add(new THREE.Vector3(0, h + 0.04, 0)), q.identity(), one); B.metal.add(new THREE.SphereGeometry(0.06, 8, 6), m4, 0xb8903f);
    box(p.clone().add(new THREE.Vector3(0, h / 2, 0)), 0.12, h / 2, 0.12, 0);
    return p.clone().add(new THREE.Vector3(0, h - 0.15, 0));
  };
  const P1 = pole(4.3, -2.5, 5.0), P3 = pole(-4.8, -2.3, 5.0), P2 = pole(5.3, 7.4, 4.8), P4 = pole(-4.2, 8.6, 4.8);   // the string between these two crosses the way in high, over a camera's head
  const gl = gate(-1.05, GH_TOP + 0.34, 0), gr = gate(1.05, GH_TOP + 0.34, 0);
  const [g2, g1] = gl.distanceTo(P2) < gr.distanceTo(P2) ? [gl, gr] : [gr, gl];   // neither string crosses in front of the bell
  const branch = tree.at.clone().add(new THREE.Vector3(0, 3.0, 0));
  const strings: [THREE.Vector3, THREE.Vector3, number][] = [[P1, P3, 0.9], [P1, g1, 0.6], [g2, P2, 0.35], [P3, branch, 0.7], [branch, P4, 0.5], [P2, P4, 0.45]];
  const fl: { p: THREE.Vector3; t: THREE.Vector3 }[] = [], cord = new THREE.CylinderGeometry(0.006, 0.006, 1, 3, 1, true);
  for (const [a, b, sag] of strings) {
    const pts = swag(a, b, sag, 16);
    for (let i = 0; i < 16; i++) {
      const p0 = pts[i], p1 = pts[i + 1], d = p1.clone().sub(p0);
      m4.compose(p0.clone().lerp(p1, 0.5), q.setFromUnitVectors(Y, d.clone().normalize()), new THREE.Vector3(1, d.length(), 1)); B.matte.add(cord, m4, 0xb8ad98);
    }
    const n = Math.floor(a.distanceTo(b) / 0.27);
    for (let i = 1; i < n; i++) { const t = i / n; fl.push({ p: a.clone().lerp(b, t).addScaledVector(Y, -sag * 4 * t * (1 - t)), t: b.clone().sub(a).setY(sag * 4 * (2 * t - 1)).normalize() }); }
  }

  // ---- the meshes
  const time = { value: 0 };
  const stoneM = granite(0xffffff, undefined, true);
  const matteM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const metalM = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.35 });
  root.add(B.stone.mesh(stoneM, !low), B.matte.mesh(matteM, !low), B.metal.mesh(metalM, false));
  // peepal leaves: the crown sways slowly, every leaf trembles on its long stalk (uv.x: 0 at the stalk -> 1 at the tip, uv.y: its phase)
  const leafMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });            // no sheen: grazing sky glare washed the crown out
  leafMat.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aH; varying vec2 vLf;').replace('#include <begin_vertex>', `#include <begin_vertex>
vLf = uv; float sw = smoothstep(1.6, 4.2, aH), fl = sin(uTime * (4.0 + 3.0 * uv.y) + uv.y * 40.0) * uv.x;
transformed.xz += vec2(sin(uTime * 0.9 + aH * 0.4), cos(uTime * 0.7 + aH * 0.5)) * 0.05 * sw;
transformed += normal * fl * 0.03;`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vLf;').replace('#include <map_fragment>', `
diffuseColor.rgb = mix(vec3(0.035, 0.09, 0.018), vec3(0.08, 0.15, 0.03), fract(vLf.y * 7.31)) * (0.8 + 0.35 * vLf.x);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.06, 0.025), step(0.96, fract(vLf.y * 13.7)));   // a few new leaves, still copper`);
  };
  leafMat.customProgramCacheKey = () => 'peepal-leaf';
  root.add(B.leaf.mesh(leafMat, !low));

  // prayer flags: one small square per instance hanging from its string, the hem blown out and rippling; a woodblock print on each
  const flagM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  flagM.onBeforeCompile = (s) => {
    s.uniforms.uTime = time;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec2 vFu;').replace('#include <begin_vertex>', `#include <begin_vertex>
vFu = uv; float ph = dot(vec3(instanceMatrix[3]), vec3(1.3, 0.7, 2.1)), d = -position.y / 0.22;
transformed.z += d * (0.06 + 0.04 * sin(uTime * 1.3 + ph)) + d * 0.035 * sin(uTime * 7.0 + position.x * 20.0 + ph * 3.0);
transformed.y += d * 0.012 * sin(uTime * 5.0 + ph);`);
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vFu;').replace('#include <map_fragment>', `#include <map_fragment>
float rows = step(0.5, fract(vFu.y * 10.0)) * step(0.3, fract(vFu.x * 11.0 + floor(vFu.y * 10.0) * 0.37)) * step(0.12, vFu.x) * step(vFu.x, 0.88) * step(0.1, vFu.y) * step(vFu.y, 0.9);
float horse = step(abs(vFu.x - 0.5), 0.2) * step(abs(vFu.y - 0.5), 0.16);
diffuseColor.rgb *= 1.0 - 0.4 * max(rows * 0.7, horse * 0.8);`);
  };
  flagM.customProgramCacheKey = () => 'lungta';
  const flags = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.22, 3, 3).translate(0, -0.11, 0), flagM, fl.length), xs = new THREE.Vector3(), zs = new THREE.Vector3(), c = new THREE.Color();
  fl.forEach((f, i) => {
    xs.copy(f.t); zs.crossVectors(xs, Y).normalize(); const ys = new THREE.Vector3().crossVectors(zs, xs);
    flags.setMatrixAt(i, m4.makeBasis(xs, ys, zs).setPosition(f.p.x, f.p.y - 0.01, f.p.z)); flags.setColorAt(i, c.setHex(LUNGTA[i % 5]));
  });
  flags.computeBoundingSphere(); flags.boundingSphere!.radius += 0.5; root.add(flags);

  // the lamp flames: camera-facing teardrops that flicker, with a faint glow round each (no real lights)
  const flameM = new THREE.ShaderMaterial({
    uniforms: { uTime: time }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uTime; varying vec2 vUv; varying float vK;
void main() { vec3 c = vec3(instanceMatrix[3]); float ph = dot(c, vec3(17.0, 3.0, 11.0)); vUv = uv;
  vK = 1.0 + 0.16 * sin(uTime * 13.0 + ph) + 0.09 * sin(uTime * 23.0 + ph * 1.7);
  vec4 mv = modelViewMatrix * vec4(c, 1.0); mv.xy += vec2(position.x * 0.1 + sin(uTime * 9.0 + ph) * 0.006 * uv.y, position.y * 0.15 * vK);
  gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vK;
void main() { vec2 q = vec2(vUv.x * 2.0 - 1.0, vUv.y * 1.2 - 0.12); float w = 0.32 * sin(3.1416 * pow(clamp(q.y, 0.0, 1.0), 0.65));
  float f = (1.0 - smoothstep(0.55, 1.0, abs(q.x) / max(w, 0.001))) * step(0.0, q.y) * step(q.y, 1.0);
  float core = (1.0 - smoothstep(0.2, 0.7, abs(q.x) / max(w, 0.001))) * smoothstep(0.75, 0.15, q.y);
  vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.92, 0.65), core) * f * 1.4;
  float glow = exp(-length((vUv - vec2(0.5, 0.25)) * vec2(1.6, 1.0)) * 7.0) * 0.3 * vK;
  gl_FragColor = vec4(col + vec3(1.0, 0.5, 0.15) * glow, 1.0); }`,
  });
  const flameMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.4, 0), flameM, flames.length);
  flames.forEach((p, i) => flameMesh.setMatrixAt(i, m4.makeTranslation(p.x, p.y - 0.01, p.z)));
  flameMesh.computeBoundingSphere(); flameMesh.boundingSphere!.radius += 0.3; root.add(flameMesh);

  return { update: (t: number) => { time.value = t; } };
}
