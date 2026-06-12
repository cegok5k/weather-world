import * as THREE from 'three';
import type { GlobeInstance } from 'globe.gl';
import type { EffectKind } from '../lib/wmo';
import { makeCloudGeometry, toonMaterial } from './toonMaterials';

// Local toony weather effects anchored above the selected location.
// One active effect group at a time; built in local space with +Y = away from globe center.
export function createWeatherEffects(globe: GlobeInstance) {
  const root = new THREE.Group();
  root.visible = false;
  globe.scene().add(root);

  const R = globe.getGlobeRadius();
  const S = R * 0.05; // base effect scale

  let current: THREE.Group | null = null;
  let animator: ((dt: number, t: number) => void) | null = null;
  let t = 0;

  function disposeCurrent() {
    if (!current) return;
    current.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.InstancedMesh) {
        o.geometry.dispose();
        const m = o.material;
        (Array.isArray(m) ? m : [m]).forEach((mm) => mm.dispose());
      }
    });
    root.remove(current);
    current = null;
    animator = null;
  }

  // --- builders -----------------------------------------------------------

  function buildSun(isDay: boolean): THREE.Group {
    const g = new THREE.Group();
    const color = isDay ? '#ffd93d' : '#e8eaf6';
    const core = new THREE.Mesh(new THREE.SphereGeometry(S * 0.45, 20, 16), toonMaterial(color, { emissive: new THREE.Color(isDay ? 0x665510 : 0x333344) }));
    core.position.y = S * 1.4;
    g.add(core);

    if (isDay) {
      // Rays radiate in the local horizontal plane — the post-fly-to camera
      // looks straight down at the location, so this plane faces the viewer.
      const rayGeo = new THREE.ConeGeometry(S * 0.09, S * 0.35, 6);
      const rayMat = toonMaterial('#ffd93d');
      for (let i = 0; i < 8; i++) {
        const ray = new THREE.Mesh(rayGeo, rayMat);
        const a = (i / 8) * Math.PI * 2;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        ray.position.set(dir.x * S * 0.72, S * 1.4, dir.z * S * 0.72);
        ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        g.add(ray);
      }
    } else {
      // toon crater dots on top of the moon (the side facing the camera)
      const craterMat = toonMaterial('#c5cae9');
      for (const [dx, dz, r] of [[0.15, 0.1, 0.09], [-0.12, -0.08, 0.07], [0.02, -0.18, 0.05]] as const) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(S * r, 10, 8), craterMat);
        c.position.set(S * dx * 2.2, S * 1.4 + S * 0.38, S * dz * 2.2);
        g.add(c);
      }
    }

    animator = (_dt, tt) => {
      const pulse = 1 + Math.sin(tt * 2) * 0.04;
      core.scale.set(pulse, pulse, pulse);
      g.rotation.y = Math.sin(tt * 0.6) * 0.15;
      if (isDay) g.children.forEach((c, i) => i > 0 && (c.rotation.z += 0.000));
    };
    return g;
  }

  function buildClouds(count: number, opts: { dark?: boolean } = {}): THREE.Group {
    const g = new THREE.Group();
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Mesh(
        makeCloudGeometry(11 + i * 3),
        toonMaterial(opts.dark ? '#9aa4b5' : '#ffffff'),
      );
      const s = S * (0.45 + (i % 2) * 0.15);
      cloud.scale.set(s, s, s);
      cloud.position.set((i - (count - 1) / 2) * S * 1.7, S * (1.3 + (i % 2) * 0.4), (i % 2 ? 1 : -1) * S * 0.45);
      g.add(cloud);
      clouds.push(cloud);
    }
    const prev = animator;
    animator = (dt, tt) => {
      prev?.(dt, tt);
      clouds.forEach((c, i) => {
        c.position.y += Math.sin(tt * 1.5 + i * 1.7) * S * 0.0015;
      });
    };
    return g;
  }

  function buildParticles(kind: 'rain' | 'snow'): THREE.Group {
    const g = new THREE.Group();
    const count = kind === 'rain' ? 140 : 100;
    const geo =
      kind === 'rain'
        ? new THREE.CapsuleGeometry(S * 0.03, S * 0.16, 2, 6)
        : new THREE.OctahedronGeometry(S * 0.07, 0);
    const mat = toonMaterial(kind === 'rain' ? '#4fc3f7' : '#ffffff');
    const mesh = new THREE.InstancedMesh(geo, mat, count);

    const area = S * 2.4; // spawn box width
    const top = S * 1.1;
    const bottom = S * 0.05;
    const speeds: number[] = [];
    const seeds: Array<{ x: number; z: number; y: number; sway: number }> = [];
    for (let i = 0; i < count; i++) {
      seeds.push({
        x: (Math.random() - 0.5) * area,
        z: (Math.random() - 0.5) * area * 0.6,
        y: bottom + Math.random() * (top - bottom),
        sway: Math.random() * Math.PI * 2,
      });
      speeds.push(kind === 'rain' ? S * (2.2 + Math.random()) : S * (0.35 + Math.random() * 0.3));
    }

    const dummy = new THREE.Object3D();
    const prev = animator;
    animator = (dt, tt) => {
      prev?.(dt, tt);
      for (let i = 0; i < count; i++) {
        const p = seeds[i];
        p.y -= speeds[i] * dt;
        if (p.y < bottom) p.y = top;
        const swayX = kind === 'snow' ? Math.sin(tt * 2 + p.sway) * S * 0.08 : 0;
        dummy.position.set(p.x + swayX, p.y, p.z);
        if (kind === 'snow') dummy.rotation.set(tt + i, tt * 0.7 + i, 0);
        else dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    g.add(mesh);
    return g;
  }

  function buildLightning(): THREE.Group {
    const g = new THREE.Group();
    // Flat toon zigzag bolt
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-0.18, -0.35);
    shape.lineTo(0.02, -0.32);
    shape.lineTo(-0.12, -0.7);
    shape.lineTo(0.16, -0.28);
    shape.lineTo(-0.02, -0.31);
    shape.lineTo(0.12, 0);
    shape.closePath();
    const bolt = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0xffe838, side: THREE.DoubleSide, transparent: true }),
    );
    bolt.scale.set(S * 1.4, S * 1.4, S * 1.4);
    // Lay the bolt in the horizontal plane so the top-down camera sees it face-on
    bolt.rotation.x = -Math.PI / 2;
    bolt.position.y = S * 0.95;
    g.add(bolt);

    const prev = animator;
    animator = (dt, tt) => {
      prev?.(dt, tt);
      // Flash on/off in irregular bursts
      const phase = tt % 2.4;
      const mat = bolt.material as THREE.MeshBasicMaterial;
      mat.opacity = phase < 0.12 || (phase > 0.25 && phase < 0.33) ? 1 : 0;
    };
    return g;
  }

  function buildFog(): THREE.Group {
    const g = new THREE.Group();
    const layers: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const fog = new THREE.Mesh(
        makeCloudGeometry(31 + i * 5),
        toonMaterial('#cfd8dc', { transparent: true, opacity: 0.55 }),
      );
      const s = S * (0.7 + i * 0.12);
      fog.scale.set(s, s * 0.4, s);
      fog.position.set((i - 1) * S * 0.5, S * (0.25 + i * 0.18), (i % 2 ? 1 : -1) * S * 0.3);
      g.add(fog);
      layers.push(fog);
    }
    const prev = animator;
    animator = (dt, tt) => {
      prev?.(dt, tt);
      layers.forEach((f, i) => {
        f.position.x += Math.sin(tt * 0.4 + i * 2) * S * 0.0012;
      });
    };
    return g;
  }

  // --- public API ----------------------------------------------------------

  function show(effect: EffectKind, lat: number, lng: number, isDay: boolean) {
    disposeCurrent();
    t = 0;

    const g = new THREE.Group();
    switch (effect) {
      case 'clear':
        g.add(buildSun(isDay));
        break;
      case 'cloudy':
        g.add(buildClouds(3));
        break;
      case 'fog':
        g.add(buildFog());
        break;
      case 'rain':
        g.add(buildClouds(2, { dark: true }));
        g.add(buildParticles('rain'));
        break;
      case 'snow':
        g.add(buildClouds(2));
        g.add(buildParticles('snow'));
        break;
      case 'thunder':
        g.add(buildClouds(2, { dark: true }));
        g.add(buildParticles('rain'));
        g.add(buildLightning());
        break;
    }

    const { x, y, z } = globe.getCoords(lat, lng, 0.012);
    root.position.set(x, y, z);
    root.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(x, y, z).normalize(),
    );
    root.add(g);
    current = g;
    root.visible = true;
  }

  function hide() {
    disposeCurrent();
    root.visible = false;
  }

  function tick(dt: number) {
    if (!root.visible || !animator) return;
    t += dt;
    animator(dt, t);
  }

  return { show, hide, tick };
}
