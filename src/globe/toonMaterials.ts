import * as THREE from 'three';

// Shared 3-step gradient map gives MeshToonMaterial its banded cel-shading look.
let gradientMap: THREE.DataTexture | null = null;

export function getToonGradient(): THREE.DataTexture {
  if (!gradientMap) {
    const data = new Uint8Array([150, 150, 150, 255, 218, 218, 218, 255, 255, 255, 255, 255]);
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

  // Stylized game-style cloud: an irregular cluster of smooth puffs with a
  // softly squashed base, organic vertex jitter and white-top / dusty-blue
  // underside vertex shading.
  const geos: THREE.BufferGeometry[] = [];
  const center = new THREE.IcosahedronGeometry(1.0, 2);
  center.translate(0, 0.28, 0);
  geos.push(center);
  const puffs = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + rnd() * 1.2;
    const d = 0.55 + rnd() * 0.75;
    const r = (0.4 + rnd() * 0.4) * (1.25 - d / 2.2);
    const g = new THREE.IcosahedronGeometry(r, 2);
    g.translate(Math.cos(a) * d * 1.25, 0.12 + rnd() * 0.3, Math.sin(a) * d * 0.7);
    geos.push(g);
  }
  const merged = mergeGeometriesFlat(geos);
  geos.forEach((g) => g.dispose());

  // Soft-squash the base (keeps roundness, no hard slice) + organic jitter.
  // Sphere normals are kept as-is so shading stays smooth, not faceted.
  const pos = merged.attributes.position;
  const nor = merged.attributes.normal;
  let maxY = 0;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    if (y < 0) y *= 0.32;
    const wobble = Math.sin(x * 4.7 + z * 3.1) * Math.cos(y * 5.3 + x * 2.2) * 0.05;
    x += nor.getX(i) * wobble;
    y += nor.getY(i) * wobble;
    z += nor.getZ(i) * wobble;
    pos.setXYZ(i, x, y, z);
    if (y > maxY) maxY = y;
  }

  // Vertex colors: white crowns fading to a dusty blue-grey underside
  const colors = new Float32Array(pos.count * 3);
  const bottom = { r: 0.72, g: 0.78, b: 0.88 };
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(Math.max((pos.getY(i) + 0.35) / (maxY + 0.35), 0), 1);
    const e = t * t * (3 - 2 * t); // smoothstep
    colors[i * 3] = bottom.r + (1 - bottom.r) * e;
    colors[i * 3 + 1] = bottom.g + (1 - bottom.g) * e;
    colors[i * 3 + 2] = bottom.b + (1 - bottom.b) * e;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
