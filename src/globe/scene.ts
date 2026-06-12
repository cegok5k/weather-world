import Globe from 'globe.gl';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type GlobeInstance = ReturnType<typeof createGlobe> extends Promise<infer T> ? T : never;

type Stop = [number, number, number];

// Interpolate through a multi-stop color ramp, t in [0,1]
function ramp(stops: Stop[], t: number): Stop {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1);
  const i = Math.min(Math.floor(x), stops.length - 2);
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

// Stylize the NASA Blue Marble into saturated tonal ramps (not flat posterize):
// keeps a hand-painted game look while preserving terrain depth. Also emits a
// specular mask so oceans get a modern stylized sheen and land stays matte.
async function makeStylizedEarthTextures(): Promise<{ map: HTMLCanvasElement; spec: HTMLCanvasElement }> {
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

  const specCanvas = document.createElement('canvas');
  specCanvas.width = w;
  specCanvas.height = h;
  const sctx = specCanvas.getContext('2d')!;
  const specData = sctx.createImageData(w, h);
  const sp = specData.data;

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  const OCEAN: Stop[] = [
    [16, 64, 128],
    [26, 105, 180],
    [52, 144, 218],
    [92, 182, 240],
  ];
  const LAND: Stop[] = [
    [44, 116, 62],
    [78, 162, 76],
    [132, 198, 88],
    [188, 230, 122],
  ];
  const DESERT: Stop[] = [
    [150, 102, 54],
    [196, 142, 78],
    [232, 190, 120],
    [248, 226, 168],
  ];
  const ICE: Stop[] = [
    [196, 218, 238],
    [228, 240, 250],
    [255, 255, 255],
    [255, 255, 255],
  ];

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    let c: Stop;
    let shiny = 0;
    if (b > g + 8 && b > r + 8) {
      c = ramp(OCEAN, lum * 2.6);
      shiny = 235;
    } else if (r > 200 && g > 200 && b > 200) {
      c = ramp(ICE, (lum - 0.6) * 2.5);
      shiny = 90;
    } else if (r > g + 15 && lum > 0.3) {
      c = ramp(DESERT, lum * 1.5);
    } else {
      c = ramp(LAND, lum * 2.8);
    }
    px[i] = c[0];
    px[i + 1] = c[1];
    px[i + 2] = c[2];
    sp[i] = shiny;
    sp[i + 1] = shiny;
    sp[i + 2] = shiny;
    sp[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  sctx.putImageData(specData, 0, 0);
  return { map: canvas, spec: specCanvas };
}

// Deep-space backdrop: vertical gradient sphere instead of a flat color
function makeSpaceBackdrop(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vP;
      void main(){
        float t = normalize(vP).y * 0.5 + 0.5;
        vec3 bot = vec3(0.065, 0.045, 0.15);
        vec3 mid = vec3(0.028, 0.032, 0.095);
        vec3 top = vec3(0.008, 0.012, 0.045);
        vec3 col = mix(mix(bot, mid, smoothstep(0.0, 0.5, t)), top, smoothstep(0.5, 1.0, t));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(3500, 32, 32), mat);
}

function makeStars(): THREE.Group {
  const group = new THREE.Group();
  const layers = [
    { count: 700, size: 2.5, color: 0xbfd0ff, opacity: 0.6 },
    { count: 320, size: 4.5, color: 0xffffff, opacity: 0.85 },
    { count: 110, size: 7, color: 0xfff2cf, opacity: 0.95 },
  ];
  for (const layer of layers) {
    const positions = new Float32Array(layer.count * 3);
    for (let i = 0; i < layer.count; i++) {
      const r = 2200 + Math.random() * 900;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: layer.color,
      size: layer.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
    });
    group.add(new THREE.Points(geo, mat));
  }
  return group;
}

// View-dependent fresnel rim: the soft blue edge-light that sells the
// "modern stylized planet" look, layered inside Globe.gl's atmosphere halo.
function makeFresnelRim(radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { rimColor: { value: new THREE.Color('#54b6ff') } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 rimColor; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 3.5);
        gl_FragColor = vec4(rimColor, f * 0.85);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 64, 64), mat);
}

export async function createGlobe(container: HTMLElement) {
  const globe = new Globe(container, { animateIn: true });

  globe
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#5fb8ff')
    .atmosphereAltitude(0.2)
    .bumpImageUrl(`${import.meta.env.BASE_URL}textures/earth-topology.png`)
    .pointOfView({ lat: 25, lng: 10, altitude: 2.2 }, 0);

  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Form-giving light rig: warm key, cool fill, moderate ambient — gives the
  // globe an actual lit side instead of the old flat ambient wash.
  const ambient = new THREE.AmbientLight(0xa8b8e8, 0.85);
  const key = new THREE.DirectionalLight(0xfff2dc, 2.1);
  key.position.set(280, 170, 320);
  const fill = new THREE.DirectionalLight(0x6f8cff, 0.55);
  fill.position.set(-320, -80, -240);
  globe.lights([ambient, key, fill]);

  globe.scene().add(makeSpaceBackdrop());
  globe.scene().add(makeStars());
  globe.scene().add(makeFresnelRim(globe.getGlobeRadius()));

  // Subtle bloom: bright things (sun, lightning, rim, specular glints) glow
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.38,
    0.65,
    0.82,
  );
  globe.postProcessingComposer().addPass(bloom);

  const { map, spec } = await makeStylizedEarthTextures();
  const material = globe.globeMaterial() as THREE.MeshPhongMaterial;
  const tex = new THREE.CanvasTexture(map);
  tex.colorSpace = THREE.SRGBColorSpace;
  material.map = tex;
  material.color = new THREE.Color(0xffffff);
  // Stylized water sheen: masked to oceans, soft blue highlight
  material.specularMap = new THREE.CanvasTexture(spec);
  material.specular = new THREE.Color('#7db5e8');
  material.shininess = 14;
  material.bumpScale = 12;
  material.needsUpdate = true;

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
    bloom.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    globe,
    flyTo(lat: number, lng: number, ms = 1400) {
      controls.autoRotate = false;
      globe.pointOfView({ lat, lng, altitude: 0.45 }, ms);
    },
  };
}
