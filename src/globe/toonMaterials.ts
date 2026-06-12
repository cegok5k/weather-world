import * as THREE from 'three';

// Shared 3-step gradient map gives MeshToonMaterial its banded cel-shading look.
let gradientMap: THREE.DataTexture | null = null;

export function getToonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
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

// Low-poly fluffy cloud: a few squashed icospheres merged into one geometry.
export function makeCloudGeometry(seed = 1): THREE.BufferGeometry {
  // Cheap deterministic pseudo-random so clouds vary but are stable per seed
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };

  const geos: THREE.BufferGeometry[] = [];
  // One big central puff with smaller ones clustered around it
  const center = new THREE.IcosahedronGeometry(0.95, 1);
  center.scale(1, 0.7, 1);
  geos.push(center);
  const satellites = 4;
  for (let i = 0; i < satellites; i++) {
    const r = 0.45 + rnd() * 0.3;
    const a = (i / satellites) * Math.PI * 2 + rnd() * 0.8;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(Math.cos(a) * (0.75 + rnd() * 0.25), (rnd() - 0.5) * 0.2 - 0.1, Math.sin(a) * (0.55 + rnd() * 0.2));
    g.scale(1, 0.7, 1);
    geos.push(g);
  }
  const merged = mergeGeometriesFlat(geos);
  geos.forEach((g) => g.dispose());
  return merged;
}

// Minimal non-indexed merge (avoids importing BufferGeometryUtils for one use).
function mergeGeometriesFlat(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;

  const pos = new Float32Array(total * 3);
  const norm = new Float32Array(total * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    pos.set(g.attributes.position.array as Float32Array, offset * 3);
    norm.set(g.attributes.normal.array as Float32Array, offset * 3);
    offset += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  return merged;
}
