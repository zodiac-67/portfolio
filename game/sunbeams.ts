import * as THREE from 'three';
import type { Island } from './island';
import type { Terrain } from './terrain';

/** Dawn light: soft shafts of low sun slanting through the bamboo grove and the old forest (only where trees frame them). Each shaft
 * is a quad that turns about the sun's direction to face the camera, glows additively and breathes slowly; it fades
 * when you look straight down it or walk right into it. One draw call. Returns the per-frame update. */
export function buildSunbeams(scene: THREE.Scene, t: Terrain, I: Island, sunDir: THREE.Vector3, low: boolean) {
  const S = I.spots, beams: [number, number, number, number, number][] = [   // x, z, height above ground, width, length; only where trees frame them
    [S.bamboo.x - 4, S.bamboo.z + 2, 3.5, 3.2, 34], [S.bamboo.x + 2, S.bamboo.z - 4, 4.5, 4.5, 40], [S.bamboo.x - 1, S.bamboo.z + 7, 2.8, 2.4, 28],
    [S.forest.x - 3, S.forest.z + 2, 3.8, 4, 36], [S.forest.x + 3, S.forest.z - 4, 5, 5, 42], [S.forest.x - 6, S.forest.z - 3, 3.4, 3, 30],
  ];
  const n = low ? 4 : beams.length, m = new THREE.Matrix4(), axis = new THREE.Vector3(-sunDir.x, -0.5, -sunDir.z).normalize();   // a touch steeper than the dawn sun: they fall from the canopy
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uAxis: { value: axis } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform vec3 uAxis; varying vec2 vUv; varying float vSeed; varying float vFace;
void main() {
  vec3 c = instanceMatrix[3].xyz; float w = length(instanceMatrix[0].xyz), l = length(instanceMatrix[1].xyz);
  vec3 toCam = normalize(cameraPosition - c), side = normalize(cross(uAxis, toCam));
  vec3 p = c + uAxis * position.y * l + side * position.x * w;
  vUv = position.xy + 0.5; vSeed = c.x * 0.37 + c.z * 0.11;
  float dc = distance(cameraPosition, c);
  vFace = (1.0 - pow(abs(dot(toCam, uAxis)), 4.0)) * smoothstep(4.0, 12.0, dc) * (1.0 - smoothstep(18.0, 34.0, dc));   // no flat cards end-on, up close, or as streaks across the sky from afar
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vSeed; varying float vFace;
void main() {
  float across = exp(-pow((vUv.x - 0.5) * 3.2, 2.0)) * (0.55 + 0.45 * sin(vUv.x * 19.0 + vSeed * 3.0)), along = sin(3.14159 * vUv.y) * smoothstep(0.0, 0.35, vUv.y);   // a few streaks per shaft
  float breathe = 0.7 + 0.3 * sin(uTime * 0.45 + vSeed) * sin(uTime * 0.27 + vSeed * 1.7);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.58) * across * along * breathe * vFace * 1.0, 1.0);
}`,
  });
  const shafts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, n); shafts.frustumCulled = false;
  beams.slice(0, n).forEach(([x, z, up, w, l], i) => {
    const c = new THREE.Vector3(x, t.heightAt(x, z) + up, z).addScaledVector(axis, -l * 0.25);   // from the canopy down to its spot
    shafts.setMatrixAt(i, m.makeScale(w * 1.5, l * 0.6, 1).setPosition(c));
  });
  scene.add(shafts);
  return (time: number) => { mat.uniforms.uTime.value = time; };
}
