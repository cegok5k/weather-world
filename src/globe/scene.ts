import Globe from 'globe.gl';
import * as THREE from 'three';

export type GlobeInstance = ReturnType<typeof createGlobe> extends Promise<infer T> ? T : never;

// Posterize the NASA Blue Marble texture into flat cartoon colors on an offscreen canvas.
async function makeToonEarthTexture(): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = `${import.meta.env.BASE_URL}textures/earth-blue-marble.jpg`;
  await img.decode();

  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Flat toon palette
  const OCEAN = [38, 150, 222];
  const OCEAN_DEEP = [28, 120, 195];
  const GRASS = [126, 200, 80];
  const FOREST = [74, 157, 88];
  const DESERT = [235, 200, 120];
  const ICE = [240, 248, 255];

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    let c: number[];
    if (b > g + 8 && b > r + 8) {
      // ocean — two flat blues by depth
      c = lum < 40 ? OCEAN_DEEP : OCEAN;
    } else if (r > 200 && g > 200 && b > 200) {
      c = ICE; // snow/ice caps
    } else if (r > g + 18 && lum > 90) {
      c = DESERT; // tan/arid
    } else if (lum > 95) {
      c = GRASS;
    } else {
      c = FOREST;
    }
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function makeStarfield(): THREE.Points {
  const count = 1200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Random points on a big sphere shell well outside the camera orbit
    const r = 2200 + Math.random() * 800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
  });
  return new THREE.Points(geo, mat);
}

export async function createGlobe(container: HTMLElement) {
  const globe = new Globe(container, { animateIn: true });

  globe
    .backgroundColor('#0b1026')
    .showAtmosphere(true)
    .atmosphereColor('#7fd4ff')
    .atmosphereAltitude(0.22)
    .pointOfView({ lat: 25, lng: 10, altitude: 2.2 }, 0);

  // Clamp pixel ratio for mobile perf
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Toony flat lighting: bright ambient + one strong directional so cel bands read well
  const ambient = new THREE.AmbientLight(0xffffff, 1.6);
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.2);
  sun.position.set(200, 150, 300);
  globe.lights([ambient, sun]);

  globe.scene().add(makeStarfield());

  // Swap in the posterized cartoon texture once ready
  const toonCanvas = await makeToonEarthTexture();
  const material = globe.globeMaterial() as THREE.MeshPhongMaterial;
  const tex = new THREE.CanvasTexture(toonCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  material.map = tex;
  material.color = new THREE.Color(0xffffff);
  material.shininess = 0; // kill specular glare for a flat look
  material.needsUpdate = true;

  // Slow idle auto-rotate until the user interacts
  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  const stopAutoRotate = () => {
    controls.autoRotate = false;
    container.removeEventListener('pointerdown', stopAutoRotate);
  };
  container.addEventListener('pointerdown', stopAutoRotate);

  window.addEventListener('resize', () => {
    globe.width(window.innerWidth).height(window.innerHeight);
  });

  return {
    globe,
    flyTo(lat: number, lng: number, ms = 1400) {
      controls.autoRotate = false;
      globe.pointOfView({ lat, lng, altitude: 0.45 }, ms);
    },
  };
}
