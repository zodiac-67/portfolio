import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Island } from './island';
import type { Terrain } from './terrain';

let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const Y = new THREE.Vector3(0, 1, 0);

/** leaf and frond cut-outs painted on a canvas: no image downloads */
export function cardTexture(draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d')!; draw(c);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const leafSpray = (c: CanvasRenderingContext2D) => {                       // bamboo: slender leaves fanning from twigs
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, r = 20 + rnd() * 36, x = 64 + Math.cos(a) * r * 0.6, y = 64 + Math.sin(a) * r * 0.6;
    c.save(); c.translate(x, y); c.rotate(a + 0.3); c.fillStyle = `hsl(${88 + rnd() * 20}, ${40 + rnd() * 20}%, ${28 + rnd() * 18}%)`;
    c.beginPath(); c.ellipse(0, 0, 22, 3.2, 0, 0, Math.PI * 2); c.fill(); c.restore();
  }
};
const frond = (c: CanvasRenderingContext2D) => {                           // fern: a curved rachis with paired pinnae
  for (let f = 0; f < 3; f++) {
    c.save(); c.translate(64, 124); c.rotate((f - 1) * 0.5);
    for (let i = 0; i < 16; i++) {
      const y = -i * 7, w = 26 * Math.sin((i / 16) * Math.PI) + 4; c.fillStyle = `hsl(${100 + f * 6}, 45%, ${26 + i}%)`;
      c.beginPath(); c.ellipse(-w / 2, y, w / 2, 2.6, -0.3, 0, Math.PI * 2); c.ellipse(w / 2, y, w / 2, 2.6, 0.3, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }
};

/** crossed cards (two quads at right angles) */
export function crossCards(w: number, h: number, lift = 0) {
  const a = new THREE.PlaneGeometry(w, h).translate(0, h / 2 + lift, 0), b = a.clone().rotateY(Math.PI / 2);
  return mergeGeometries([a, b])!;
}

/** a mossy broadleaf tree: tapered trunk and clumped crown, coloured per vertex */
function broadleaf() {
  const parts: THREE.BufferGeometry[] = [], col = new THREE.Color();
  const paint = (g: THREE.BufferGeometry, f: (y: number) => THREE.Color) => {
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) f(p.getY(i)).toArray(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g;
  };
  parts.push(paint(new THREE.CylinderGeometry(0.28, 0.5, 5, 7).translate(0, 2.5, 0), (y) => col.setRGB(0.24, 0.2, 0.15, THREE.SRGBColorSpace).lerp(new THREE.Color().setRGB(0.3, 0.4, 0.2, THREE.SRGBColorSpace), 1 - y / 5)));
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, r = k ? 1.6 : 0, g = new THREE.IcosahedronGeometry(1.5 + rnd() * 0.7, 1);
    g.scale(1, 0.75, 1).translate(Math.cos(a) * r, 5.4 + (k ? rnd() * 1.2 : 1.8), Math.sin(a) * r);
    parts.push(paint(g, (y) => col.setRGB(0.16, 0.3, 0.13, THREE.SRGBColorSpace).lerp(new THREE.Color().setRGB(0.36, 0.5, 0.2, THREE.SRGBColorSpace), Math.min(1, (y - 4.4) / 3))));
  }
  return mergeGeometries(parts)!;
}

/** a Japanese black pine: a leaning trunk and flat cloud-pads of needles */
function pine() {
  const parts: THREE.BufferGeometry[] = [], col = new THREE.Color();
  const paint = (g: THREE.BufferGeometry, c3: THREE.Color) => {
    const p = g.attributes.position, c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) c3.toArray(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g;
  };
  const trunk = new THREE.CylinderGeometry(0.18, 0.35, 5.5, 6).translate(0, 2.75, 0); trunk.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, 0.28, 0, 0, 0));
  parts.push(paint(trunk, col.setRGB(0.22, 0.17, 0.14, THREE.SRGBColorSpace).clone()));
  for (const [x, y, z, s] of [[1.4, 5.6, 0, 1.6], [0.2, 4.4, 1.2, 1.3], [-0.6, 3.6, -0.9, 1.2], [1.9, 3.2, 0.5, 1.0]]) {
    const g = new THREE.IcosahedronGeometry(s, 1); g.scale(1.3, 0.38, 1.1).translate(x, y, z);
    parts.push(paint(g, new THREE.Color().setRGB(0.12 + rnd() * 0.04, 0.24, 0.13, THREE.SRGBColorSpace)));
  }
  return mergeGeometries(parts)!;
}

/** Bamboo grove, mossy old forest, black pines, ferns and rim bushes; trees are solid. (Wildflowers grow in grass.ts.) */
export function buildFlora(scene: THREE.Scene, world: RAPIER.World, t: Terrain, I: Island, low: boolean) {
  const S = I.spots, keep: [number, number, number][] = [...Object.values(S).map((s) => [s.x, s.z, 6] as [number, number, number]), ...I.houses.map(([x, z]) => [x, z, 7] as [number, number, number]), [S.pond.x, S.pond.z, 11.5], ...(I.spring ? [[I.spring[0], I.spring[1], 5] as [number, number, number]] : [])];   // nothing grows in the pond or the spring
  const lines = [...I.paths, I.stream.map(([x, z]) => [x, z] as [number, number])];
  const distLine = (x: number, z: number) => {
    let d = 1e9;
    for (const p of lines) for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1], dx = bx - ax, dz = bz - az, u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
      d = Math.min(d, Math.hypot(x - ax - u * dx, z - az - u * dz));
    }
    return d;
  };
  const free = (x: number, z: number, clear: number) => t.heightAt(x, z) > -5 && distLine(x, z) > clear && keep.every(([a, b, r]) => Math.hypot(x - a, z - b) > r)
    && t.heightAt(x * 1.08, z * 1.08) > -5;                                       // not on the very rim
  const scatter = (cx: number, cz: number, r: number, n: number, clear: number) => {
    const out: [number, number][] = [];
    for (let k = 0; k < n * 12 && out.length < n; k++) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z, clear)) out.push([x, z]); }
    return out;
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), solid = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const instance = (geo: THREE.BufferGeometry, mat: THREE.Material, spots: [number, number][], scale: () => [number, number], shadow: boolean, onPlace?: (x: number, z: number, s: number) => void) => {
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, z], i) => { const [s, h] = scale(); mesh.setMatrixAt(i, m.compose(p.set(x, t.heightAt(x, z) - 0.1, z), q.setFromAxisAngle(Y, rnd() * 6.28), sc.set(s, h, s))); onPlace?.(x, z, s); });
    mesh.castShadow = shadow && !low; mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh); return mesh;
  };

  // bamboo: jointed stalks with leaf sprays near the top, packed around the grove and along the jungle path
  const stalk = mergeGeometries([new THREE.CylinderGeometry(0.07, 0.09, 9, 6, 1).translate(0, 4.5, 0),
    ...[1.4, 2.8, 4.2, 5.6, 7.0].map((y) => new THREE.CylinderGeometry(0.1, 0.1, 0.08, 6).translate(0, y, 0))])!;
  const bambooSpots = [...scatter(S.bamboo.x, S.bamboo.z, 15, low ? 110 : 220, 1.6), ...scatter(I.groves.bamboo2[0], I.groves.bamboo2[1], I.groves.bamboo2[2], low ? 30 : 60, 1.6)];
  const bambooMat = new THREE.MeshStandardMaterial({ color: 0x8fae5a, roughness: 0.6 });
  instance(stalk, bambooMat, bambooSpots, () => { const s = 0.8 + rnd() * 0.5; return [s, 0.8 + rnd() * 0.4]; }, true);
  const leafTex = cardTexture(leafSpray), leafMat = new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide });
  const sprays = bambooSpots.flatMap(([x, z]) => [[x + 0.3, z], [x - 0.2, z + 0.3]] as [number, number][]);
  const sprayGeo = crossCards(3.4, 3.4);
  const sprayMesh = new THREE.InstancedMesh(sprayGeo, leafMat, sprays.length);
  sprays.forEach(([x, z], i) => sprayMesh.setMatrixAt(i, m.compose(p.set(x, t.heightAt(x, z) + 5 + rnd() * 3, z), q.setFromAxisAngle(Y, rnd() * 6.28), sc.set(1, 1, 1))));
  sprayMesh.computeBoundingSphere(); scene.add(sprayMesh);

  // mossy old forest in the south-west corner, ferns on its floor
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  instance(broadleaf(), treeMat, scatter(S.forest.x, S.forest.z, 16, low ? 14 : 22, 2.2), () => { const s = 0.9 + rnd() * 0.6; return [s, s]; }, true,
    (x, z, s) => world.createCollider(RAPIER.ColliderDesc.cylinder(2.5 * s, 0.45 * s).setTranslation(x, t.heightAt(x, z) + 2.5 * s, z), solid));
  const fernMat = new THREE.MeshLambertMaterial({ map: cardTexture(frond), color: 0x8aa27a, alphaTest: 0.45, side: THREE.DoubleSide });
  instance(crossCards(1.5, 1.2), fernMat, [...scatter(S.forest.x, S.forest.z, 18, low ? 80 : 160, 1.3), ...scatter(S.bamboo.x, S.bamboo.z, 14, low ? 30 : 60, 1.3)], () => { const s = 0.7 + rnd() * 0.7; return [s, s]; }, false);

  // black pines at the torii, by the castle and the pagoda
  instance(pine(), treeMat, I.props.pine.map(([x, z]) => [x, z] as [number, number]).filter(([x, z]) => free(x, z, 2)),
    () => { const s = 0.9 + rnd() * 0.4; return [s, s]; }, true, (x, z, s) => world.createCollider(RAPIER.ColliderDesc.cylinder(2.7 * s, 0.35 * s).setTranslation(x, t.heightAt(x, z) + 2.7 * s, z), solid));


  // bushes along the rim hide where the grass meets the cliff
  // a few low shrubs along the rim, among the boulders (island.ts): small, lumpy, in mixed greens
  const rim = I.rim.flatMap(([x, z]) => { if (rnd() < 0.55) return []; const f = 0.92 - rnd() * 0.05; return [[x * f + (rnd() - 0.5) * 3, z * f + (rnd() - 0.5) * 3] as [number, number]]; })
    .filter(([x, z]) => t.heightAt(x, z) > -5 && distLine(x, z) > 2.5 && ((x - S.pond.x) / 10.5) ** 2 + ((z - S.pond.z) / 8) ** 2 > 1);   // not on the koi pond
  const bush = new THREE.IcosahedronGeometry(1, 1), bp = bush.attributes.position, bv = new THREE.Vector3();
  for (let i = 0; i < bp.count; i++) { bv.fromBufferAttribute(bp, i); bv.multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(bv.x * 5.1 + bv.z * 3.7) * Math.cos(bv.y * 4.3))); bp.setXYZ(i, bv.x * 1.2, bv.y * 0.75, bv.z * 1.2); }
  bush.computeVertexNormals();
  const shrubs = instance(bush, new THREE.MeshLambertMaterial({ color: 0xffffff }), rim, () => { const s = 0.38 + rnd() * 0.42; return [s, s]; }, false);
  const greens = [0x4e6d34, 0x5b7a3a, 0x3f5c2e, 0x667f3f];
  rim.forEach((_, i) => shrubs.setColorAt(i, new THREE.Color(greens[i % greens.length])));
}
