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

  // Classic cartoon cloud: a row of rounded mounds with a flat base.
  // [x, y, z, radius] — center mound biggest, sides taper, one behind for depth.
  const mounds: Array<[number, number, number, number]> = [
    [0, 0.4, 0, 1.0],
    [-0.95, 0.22, 0.05, 0.72 + rnd() * 0.08],
    [0.95, 0.25, -0.05, 0.76 + rnd() * 0.08],
    [0.15, 0.35, -0.6, 0.6 + rnd() * 0.08],
    [-0.35, 0.3, 0.55, 0.58 + rnd() * 0.08],
  ];
  const geos: THREE.BufferGeometry[] = [];
  for (const [x, y, z, r] of mounds) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(x, y, z);
    geos.push(g);
  }
  const merged = mergeGeometriesFlat(geos);
  geos.forEach((g) => g.dispose());

  // Slice off everything below y=0 for the flat cartoon base
  const pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) pos.setY(i, 0);
  }
  merged.computeVertexNormals();
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
