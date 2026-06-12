import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

// Shared 3-step gradient map gives MeshToonMaterial its banded cel-shading look.
let gradientMap: THREE.DataTexture | null = null;

export function getToonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([172, 172, 172, 255, 228, 228, 228, 255, 255, 255, 255, 255]);
    gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}

export function toonMaterial(color: number | string, opts: Partial<THREE.MeshToonMaterialParameters> = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: getToonGradient(),
    ...opts,
  });
}

// Soft airbrushed cloud shading: smooth lambert falloff (no toon bands) with
// a cool emissive lift so shadowed sides stay bright instead of going grey.
export function cloudMaterial(color: number | string = '#ffffff', opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color('#7888b8'),
    emissiveIntensity: 0.42,
    vertexColors: true,
    ...opts,
  });
}

// Low-poly fluffy cloud: a few squashed icospheres merged into one geometry.
export function makeCloudGeometry(seed = 1): THREE.BufferGeometry {
  // Cheap deterministic pseudo-random so clouds vary but are stable per seed
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  // Painterly metaball cloud: overlapping density blobs fused by marching
  // cubes into ONE smooth surface — a puffy head with tapering tails, like
  // stylized game-art clouds (no visible sphere boundaries).
  const mc = new MarchingCubes(44, new THREE.MeshBasicMaterial(), false, false, 80000);
  mc.isolation = 80;
  mc.reset();

  // Surface radius ≈ sqrt(strength / (isolation + subtract)), so strengths
  // need to be large: head ~7 → radius ~0.28 of the unit field.
  // Surface radius ≈ sqrt(strength / (isolation + subtract)): head r≈0.21,
  // satellites offset by ~their radius past the head edge so distinct lumps
  // survive the merge instead of being swallowed.
  const sub = 12;
  const headX = 0.5 + (rnd() - 0.5) * 0.03;
  // cumulus head with two crown bumps poking out of the top
  mc.addBall(headX, 0.5, 0.5, 5.5, sub);
  mc.addBall(headX - 0.14, 0.66, 0.48, 2.2 + rnd() * 0.6, sub);
  mc.addBall(headX + 0.12, 0.68, 0.52, 1.8 + rnd() * 0.6, sub);
  // long tapering tail to one side, short stub to the other
  const dir = rnd() > 0.5 ? 1 : -1;
  mc.addBall(headX + dir * 0.26, 0.475, 0.5 + (rnd() - 0.5) * 0.06, 2.4, sub);
  mc.addBall(headX + dir * 0.42, 0.465, 0.5 + (rnd() - 0.5) * 0.05, 1.2, sub);
  mc.addBall(headX - dir * 0.25, 0.47, 0.5 + (rnd() - 0.5) * 0.06, 2.1, sub);
  mc.addBall(headX - dir * 0.38, 0.46, 0.5, 0.9, sub);
  // depth puff so it's not paper-thin from the front
  mc.addBall(headX + (rnd() - 0.5) * 0.12, 0.5, 0.68, 2.2, sub);

  mc.update();

  const vertCount = mc.count;
  const srcPos = mc.geometry.getAttribute('position').array as Float32Array;
  const srcNor = mc.geometry.getAttribute('normal').array as Float32Array;
  const pos = new Float32Array(srcPos.slice(0, vertCount * 3));
  const nor = new Float32Array(srcNor.slice(0, vertCount * 3));
  mc.geometry.dispose();
  (mc.material as THREE.Material).dispose();

  // Elongate horizontally, soften the belly, and shade: white crowns fading
  // to a subtle cool underside.
  let maxY = 0;
  for (let i = 0; i < vertCount; i++) {
    let y = pos[i * 3 + 1];
    if (y < 0) y *= 0.6;
    pos[i * 3] *= 1.1;
    pos[i * 3 + 1] = y * 1.2;
    pos[i * 3 + 2] *= 1.05;
    if (y > maxY) maxY = y;
  }
  const colors = new Float32Array(vertCount * 3);
  const bottom = { r: 0.78, g: 0.84, b: 0.94 };
  for (let i = 0; i < vertCount; i++) {
    const t = Math.min(Math.max((pos[i * 3 + 1] + 0.3) / (maxY + 0.3), 0), 1);
    const e = t * t * (3 - 2 * t); // smoothstep
    colors[i * 3] = bottom.r + (1 - bottom.r) * e;
    colors[i * 3 + 1] = bottom.g + (1 - bottom.g) * e;
    colors[i * 3 + 2] = bottom.b + (1 - bottom.b) * e;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}
