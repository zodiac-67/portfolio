import * as THREE from 'three';

// meshopt-compressed models store positions as normalized integers; transforming those would clamp them to ±1
const GET = ['getX', 'getY', 'getZ', 'getW'] as const;
export function toFloat(g: THREE.BufferGeometry) {
  for (const [k, a] of Object.entries(g.attributes)) {
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a[GET[j]](i);
    g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
  }
  return g;
}

/** one prefab -> its geometries grouped by material name, in the prefab's own space; COL_* boxes come back separately */
export function mergePrefab(src: THREE.Object3D) {
  src.updateMatrixWorld(true);
  const inv = src.matrixWorld.clone().invert(), groups: Record<string, THREE.BufferGeometry[]> = {}, boxes: THREE.Box3[] = [];
  src.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    const g = toFloat(m.geometry.clone()).applyMatrix4(inv.clone().multiply(m.matrixWorld));
    if (m.name.startsWith('COL_')) { g.computeBoundingBox(); boxes.push(g.boundingBox!.clone()); return; }
    (groups[(m.material as THREE.Material).name.replace(/\.\d+$/, '')] ??= []).push(g);
  });
  return { groups, boxes };
}
