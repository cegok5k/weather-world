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

// Stylize the NASA Blue Marble into a Fortnite-style painted look: saturated
// tonal ramps, and a bright cyan shallow-water halo around every coastline
// (computed by blurring the land mask). Also emits a specular mask so oceans
// get a stylized sheen and land stays matte.
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
    [14, 92, 176],
    [28, 130, 212],
    [56, 168, 236],
    [118, 212, 250],
  ];
  const SHALLOW: Stop = [132, 228, 252];
  const LAND: Stop[] = [
    [40, 122, 58],
    [80, 170, 72],
    [140, 206, 86],
    [196, 234, 124],
  ];
  const DESERT: Stop[] = [
    [168, 112, 52],
    [214, 158, 80],
    [240, 200, 118],
    [252, 232, 168],
  ];
  const ICE: Stop[] = [
    [196, 218, 238],
    [228, 240, 250],
    [255, 255, 255],
    [255, 255, 255],
  ];

  // Pass 1: classify each pixel and build the land mask
  const n = w * h;
  const cls = new Uint8Array(n); // 0 ocean, 1 land, 2 desert, 3 ice
  const lums = new Float32Array(n);
  const mask = document.createElement('canvas');
  mask.width = w;
  mask.height = h;
  const mctx = mask.getContext('2d')!;
  const maskData = mctx.createImageData(w, h);
  const mp = maskData.data;

  for (let j = 0; j < n; j++) {
    const i = j * 4;
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    lums[j] = lum;
    let land = 255;
    if (b > g + 8 && b > r + 8) {
      cls[j] = 0;
      land = 0;
    } else if (r > 200 && g > 200 && b > 200) {
      cls[j] = 3;
    } else if (r > g + 15 && lum > 0.3) {
      cls[j] = 2;
    } else {
      cls[j] = 1;
    }
    mp[i] = land;
    mp[i + 1] = land;
    mp[i + 2] = land;
    mp[i + 3] = 255;
  }
  mctx.putImageData(maskData, 0, 0);

  // Blur the land mask — blurred intensity over ocean = proximity to a coast
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext('2d', { willReadFrequently: true })!;
  bctx.filter = 'blur(14px)';
  bctx.drawImage(mask, 0, 0);
  const bm = bctx.getImageData(0, 0, w, h).data;

  // Pass 2: paint
  for (let j = 0; j < n; j++) {
    const i = j * 4;
    const lum = lums[j];
    let c: Stop;
    let shiny = 0;
    switch (cls[j]) {
      case 0: {
        c = ramp(OCEAN, lum * 2.6);
        // Coastal glow: blend toward bright cyan near land
        const t = Math.min((bm[i] / 255) * 1.6, 1);
        const e = t * t;
        c = [
          c[0] + (SHALLOW[0] - c[0]) * e,
          c[1] + (SHALLOW[1] - c[1]) * e,
          c[2] + (SHALLOW[2] - c[2]) * e,
        ];
        shiny = 235;
        break;
      }
      case 3:
        c = ramp(ICE, (lum - 0.6) * 2.5);
        shiny = 90;
        break;
      case 2:
        c = ramp(DESERT, lum * 1.5);
        break;
      default:
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

// Soft purple nebula sprites scattered behind the stars
function makeNebulae(): THREE.Group {
  const group = new THREE.Group();
  const palette = ['#7b3fd4', '#a44fd0', '#3f5fd4', '#d44f9e'];
  const texCanvas = document.createElement('canvas');
  texCanvas.width = 256;
  texCanvas.height = 256;
  const tctx = texCanvas.getContext('2d')!;
  const grad = tctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  tctx.fillStyle = grad;
  tctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(texCanvas);

  for (let i = 0; i < 7; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(palette[i % palette.length]),
      transparent: true,
      opacity: 0.16 + Math.random() * 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const r = 2800;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    sprite.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
    );
    const s = 1400 + Math.random() * 1400;
    sprite.scale.set(s, s, 1);
    group.add(sprite);
  }
  return group;
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
    uniforms: { rimColor: { value: new THREE.Color('#58dcff') } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 rimColor; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(1.0 - abs(dot(vN, vV)), 2.8);
        gl_FragColor = vec4(rimColor, f * 1.05);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius * 1.004, 64, 64), mat);
}

export async function createGlobe(container: HTMLElement) {
  const globe = new Globe(container, { animateIn: true });

  globe
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#4fd6ff')
    .atmosphereAltitude(0.26)
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
  globe.scene().add(makeNebulae());
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
